import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './stores/appStore'
import { useVisionContext } from './services/visionContext'
import StatusIndicator from './components/StatusIndicator'
import WaveformViz from './components/WaveformViz'

function App() {
  const {
    isListening,
    status,
    isMuted,
    transcript,
    error,
    visionContext,
    setIsListening,
    setStatus,
    addToTranscript,
    setError
  } = useAppStore()

  const { triggerCapture, startCapturing, stopCapturing } = useVisionContext()

  const [logs, setLogs] = useState<string[]>([])
  const addLog = (msg: string) => {
    console.log('LOG:', msg)
    setLogs(prev => [...prev.slice(-20), msg])
  }

  const transcriptRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const intervalRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef<number>(0)

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript, logs])

  const playAudio = (base64Audio: string) => {
    try {
      // Reuse or create AudioContext
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext({ sampleRate: 24000 })
        nextPlayTimeRef.current = 0
      }
      const ctx = audioCtxRef.current

      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const pcm16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0
      }
      const buffer = ctx.createBuffer(1, float32.length, 24000)
      buffer.getChannelData(0).set(float32)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)

      // Schedule audio to play in sequence
      const now = ctx.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      source.start(startTime)
      nextPlayTimeRef.current = startTime + buffer.duration
    } catch (e) {
      console.error('Audio play error:', e)
    }
  }

  const visionContextRef = useRef<string | null>(null)

  // Keep ref in sync with state and update session when context changes
  useEffect(() => {
    visionContextRef.current = visionContext
    // Update session instructions with new screen context
    if (visionContext && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('Updating session with new screen context')
      wsRef.current.send(JSON.stringify({
        type: 'session.update',
        session: {
          instructions: `You are a helpful rubber duck debugging assistant. You can see the user's screen. Be very brief and helpful.\n\nCurrent screen context: ${visionContext}`
        }
      }))
    }
  }, [visionContext])

  const startVoice = async () => {
    console.log('startVoice called')
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) {
      setError('No API key')
      return
    }

    // Capture screen first
    addLog('Capturing screen...')
    await triggerCapture()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      mediaStreamRef.current = stream
      addLog('Mic ready')
    } catch (e) {
      console.error('Mic error:', e)
      setError('Mic denied')
      return
    }

    // Start periodic screen captures
    startCapturing()

    try {
      setStatus('listening')
      addLog('Connecting...')

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
      )
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WS opened')
        addLog('Connected')
        const screenContext = visionContextRef.current
          ? `\n\nCurrent screen context: ${visionContextRef.current}`
          : ''
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `You are a helpful rubber duck debugging assistant. You can see the user's screen. Be very brief and helpful.${screenContext}`,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 1000 }
          }
        }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          console.log('WS msg:', msg.type)

          if (msg.type === 'session.updated') {
            addLog('Session ready')
            startAudioCapture(ws, stream)
          } else if (msg.type === 'input_audio_buffer.speech_started') {
            addLog('Heard you!')
            setStatus('listening')
          } else if (msg.type === 'input_audio_buffer.speech_stopped') {
            addLog('Processing...')
            setStatus('thinking')
          } else if (msg.type === 'response.created') {
            // Reset audio queue for new response
            nextPlayTimeRef.current = 0
          } else if (msg.type === 'response.audio.delta' && msg.delta) {
            setStatus('speaking')
            playAudio(msg.delta)
          } else if (msg.type === 'conversation.item.input_audio_transcription.completed' && msg.transcript) {
            addToTranscript(`You: ${msg.transcript}`)
          } else if (msg.type === 'response.audio_transcript.done' && msg.transcript) {
            addToTranscript(`Duck: ${msg.transcript}`)
          } else if (msg.type === 'response.done') {
            setStatus('listening')
          } else if (msg.type === 'error') {
            console.error('API Error:', msg.error)
            addLog(`Error: ${msg.error?.message}`)
            setError(msg.error?.message || 'Error')
          }
        } catch (e) {
          console.error('Parse error:', e)
        }
      }

      ws.onerror = (e) => {
        console.error('WS error:', e)
        addLog('Connection error')
        setError('Connection failed')
      }

      ws.onclose = (e) => {
        console.log('WS closed:', e.code)
        addLog(`Closed: ${e.code}`)
        setStatus('idle')
      }
    } catch (e: any) {
      console.error('Start error:', e)
      addLog(`Error: ${e.message}`)
      setError(e.message)
    }
  }

  const startAudioCapture = (ws: WebSocket, stream: MediaStream) => {
    console.log('startAudioCapture called')
    try {
      // Use AudioContext to capture raw PCM data
      const audioContext = new AudioContext({ sampleRate: 24000 })
      const sourceNode = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 4096
      sourceNode.connect(analyser)

      const bufferLength = analyser.fftSize
      const dataArray = new Float32Array(bufferLength)

      addLog('Speak now!')

      // Poll for audio data
      intervalRef.current = window.setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return

        analyser.getFloatTimeDomainData(dataArray)

        // Convert to PCM16
        const pcm16 = new Int16Array(bufferLength)
        for (let i = 0; i < bufferLength; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, dataArray[i] * 32768))
        }

        // Convert to base64
        const bytes = new Uint8Array(pcm16.buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)

        ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64
        }))
      }, 100) // Send every 100ms

      console.log('Audio capture started')
    } catch (e: any) {
      console.error('Audio capture error:', e)
      addLog(`Audio error: ${e.message}`)
    }
  }

  const stopVoice = () => {
    console.log('stopVoice called')
    stopCapturing()
    try {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (recorderRef.current) {
        recorderRef.current.stop()
        recorderRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      wsRef.current?.close()
    } catch (e) {
      console.error('Stop error:', e)
    }
    mediaStreamRef.current = null
    wsRef.current = null
    nextPlayTimeRef.current = 0
    setStatus('idle')
  }

  const toggleListening = () => {
    console.log('toggleListening, isListening:', isListening)
    if (isListening) {
      stopVoice()
      setIsListening(false)
    } else {
      setLogs([])
      setIsListening(true)
      startVoice()
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#0f0f1a] rounded-2xl overflow-hidden border border-yellow-400/20">
      <div className="flex items-center justify-between px-4 py-2 border-b border-yellow-400/10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🦆</span>
          <span className="text-yellow-400 font-semibold text-sm">Rubber Duck</span>
        </div>
        <button onClick={() => window.electronAPI?.minimizeWindow()} className="text-gray-400 hover:text-white p-1 no-drag">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-2 border-b border-yellow-400/10">
        <StatusIndicator status={status} />
      </div>

      <div className="px-4 py-2 flex justify-center">
        <WaveformViz isActive={isListening && !isMuted} status={status} />
      </div>

      <div ref={transcriptRef} className="flex-1 px-4 py-2 overflow-y-auto text-sm no-drag min-h-0">
        {logs.map((log, i) => (
          <div key={`log-${i}`} className="text-gray-500 text-xs mb-1">{log}</div>
        ))}
        {transcript.map((msg, i) => (
          <div key={`msg-${i}`} className={`mb-2 ${msg.startsWith('You:') ? 'text-yellow-400' : 'text-white'}`}>
            {msg}
          </div>
        ))}
        {transcript.length === 0 && logs.length === 0 && (
          <div className="text-gray-500 text-center mt-4">Press button to start</div>
        )}
      </div>

      {error && <div className="px-4 py-1 bg-red-900/50 text-red-300 text-xs">{error}</div>}

      <div className="px-4 py-3 border-t border-yellow-400/10 flex items-center justify-center no-drag">
        <button
          onClick={toggleListening}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105 ${
            isListening ? 'bg-red-600' : 'bg-yellow-500'
          }`}
        >
          {isListening ? (
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

export default App
