import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './stores/appStore'
import StatusIndicator from './components/StatusIndicator'
import WaveformViz from './components/WaveformViz'

function App() {
  const {
    isListening,
    status,
    isMuted,
    transcript,
    error,
    setIsListening,
    setStatus,
    addToTranscript,
    setError
  } = useAppStore()

  const [logs, setLogs] = useState<string[]>([])
  const addLog = (msg: string) => {
    console.log('LOG:', msg)
    setLogs(prev => [...prev.slice(-20), msg])
  }

  const transcriptRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioIntervalRef = useRef<number | null>(null)
  const screenIntervalRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef<number>(0)
  const inputAudioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript, logs])

  const playAudio = (base64Audio: string) => {
    try {
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

      const now = ctx.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      source.start(startTime)
      nextPlayTimeRef.current = startTime + buffer.duration
    } catch (e) {
      console.error('Audio play error:', e)
    }
  }

  const stopPlayback = () => {
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    nextPlayTimeRef.current = 0
  }

  const startGemini = async () => {
    console.log('startGemini called')
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      setError('No Gemini API key - add VITE_GEMINI_API_KEY to .env')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
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

    try {
      setStatus('listening')
      addLog('Connecting to Gemini...')

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('Gemini WS opened')
        addLog('Connected')

        // Send setup message
        const setupMsg = {
          setup: {
            model: 'models/gemini-2.5-flash-native-audio-latest',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Aoede'
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{
                text: 'You are a helpful rubber duck debugging assistant. You can see the user\'s screen in real-time. Help them debug their code, explain what you see, and answer their questions. Be concise and helpful.'
              }]
            }
          }
        }
        console.log('Sending setup:', JSON.stringify(setupMsg))
        ws.send(JSON.stringify(setupMsg))
      }

      ws.onmessage = async (event) => {
        try {
          let msg
          if (event.data instanceof Blob) {
            const text = await event.data.text()
            msg = JSON.parse(text)
          } else {
            msg = JSON.parse(event.data)
          }
          console.log('Gemini msg:', JSON.stringify(msg).slice(0, 500))

          if (msg.setupComplete) {
            addLog('Session ready - streaming screen')
            startAudioCapture(ws, stream)
            startScreenCapture(ws)
          } else if (msg.serverContent) {
            const content = msg.serverContent

            if (content.interrupted) {
              stopPlayback()
            }

            if (content.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.mimeType?.startsWith('audio/')) {
                  setStatus('speaking')
                  playAudio(part.inlineData.data)
                } else if (part.text) {
                  addToTranscript(`Duck: ${part.text}`)
                }
              }
            }

            if (content.turnComplete) {
              setStatus('listening')
            }
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
        console.log('WS closed:', e.code, e.reason)
        addLog(`Closed: ${e.code} ${e.reason}`)
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
      inputAudioCtxRef.current = new AudioContext({ sampleRate: 16000 })
      const ctx = inputAudioCtxRef.current
      const sourceNode = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      sourceNode.connect(analyser)

      const bufferLength = analyser.fftSize
      const dataArray = new Float32Array(bufferLength)

      addLog('Speak now!')

      audioIntervalRef.current = window.setInterval(() => {
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
          realtimeInput: {
            mediaChunks: [{
              mimeType: 'audio/pcm;rate=16000',
              data: base64
            }]
          }
        }))
      }, 100)

      console.log('Audio capture started')
    } catch (e: any) {
      console.error('Audio capture error:', e)
      addLog(`Audio error: ${e.message}`)
    }
  }

  const startScreenCapture = (ws: WebSocket) => {
    console.log('startScreenCapture called')

    const captureAndSend = async () => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (!window.electronAPI?.captureScreen) return

      try {
        const screenshot = await window.electronAPI.captureScreen()
        if (!screenshot) return

        // Send screen frame to Gemini
        ws.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: 'image/jpeg',
              data: screenshot
            }]
          }
        }))
      } catch (e) {
        console.error('Screen capture error:', e)
      }
    }

    // Capture immediately and then every 1 second
    captureAndSend()
    screenIntervalRef.current = window.setInterval(captureAndSend, 1000)
    console.log('Screen capture started - 1 fps')
  }

  const stopGemini = () => {
    console.log('stopGemini called')
    try {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current)
        audioIntervalRef.current = null
      }
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current)
        screenIntervalRef.current = null
      }
      if (inputAudioCtxRef.current) {
        inputAudioCtxRef.current.close()
        inputAudioCtxRef.current = null
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
      stopGemini()
      setIsListening(false)
    } else {
      setLogs([])
      setIsListening(true)
      startGemini()
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
