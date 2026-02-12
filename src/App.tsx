import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './stores/appStore'
import StatusIndicator from './components/StatusIndicator'
import WaveformViz from './components/WaveformViz'
import { syncSession } from './lib/sync'

function App() {
  const {
    isListening,
    status,
    isMuted,
    transcript,
    error,
    apiKey,
    showSettings,
    setIsListening,
    setStatus,
    addToTranscript,
    setError,
    setApiKey,
    setShowSettings
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
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const isSpeakingRef = useRef<boolean>(false)
  const sessionStartRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(20).fill(0))

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
        activeSourcesRef.current = []
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

      // Track this source so we can stop it later
      activeSourcesRef.current.push(source)
      source.onended = () => {
        const idx = activeSourcesRef.current.indexOf(source)
        if (idx > -1) activeSourcesRef.current.splice(idx, 1)
      }

      const now = ctx.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      source.start(startTime)
      nextPlayTimeRef.current = startTime + buffer.duration
    } catch (e) {
      console.error('Audio play error:', e)
    }
  }

  const stopPlayback = () => {
    // Stop all active audio sources
    for (const source of activeSourcesRef.current) {
      try {
        source.stop()
      } catch (e) {
        // Already stopped
      }
    }
    activeSourcesRef.current = []

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
      sessionStartRef.current = Date.now()
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
                text: 'You are Vibeless, a helpful AI coding assistant. You can see the user\'s screen in real-time. Help them debug their code, explain what you see, and answer their questions. Be concise and helpful.'
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
              isSpeakingRef.current = false
            }

            if (content.modelTurn?.parts) {
              // If we weren't speaking, this is a new turn - clear any old audio
              if (!isSpeakingRef.current) {
                stopPlayback()
              }

              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.mimeType?.startsWith('audio/')) {
                  isSpeakingRef.current = true
                  setStatus('speaking')
                  playAudio(part.inlineData.data)
                } else if (part.text && !part.thought) {
                  // Only capture actual responses, not internal thinking
                  addToTranscript(`Vibeless: ${part.text}`)
                }
              }
            }

            if (content.turnComplete) {
              isSpeakingRef.current = false
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

      // Analyser for visualization (small FFT for responsiveness)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      sourceNode.connect(analyser)
      analyserRef.current = analyser

      // Separate analyser for audio capture (larger buffer)
      const captureAnalyser = ctx.createAnalyser()
      captureAnalyser.fftSize = 2048
      sourceNode.connect(captureAnalyser)

      const captureBufferLength = captureAnalyser.fftSize
      const captureDataArray = new Float32Array(captureBufferLength)
      const freqData = new Uint8Array(analyser.frequencyBinCount)

      addLog('Speak now!')

      // Visualization update (fast)
      const vizInterval = window.setInterval(() => {
        analyser.getByteFrequencyData(freqData)
        const levels: number[] = []
        const barsCount = 20
        const step = Math.floor(freqData.length / barsCount)
        for (let i = 0; i < barsCount; i++) {
          let sum = 0
          for (let j = 0; j < step; j++) {
            sum += freqData[i * step + j]
          }
          levels.push(sum / step / 255)
        }
        setAudioLevels(levels)
      }, 50)

      // Audio capture and send (100ms chunks)
      audioIntervalRef.current = window.setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          clearInterval(vizInterval)
          return
        }

        captureAnalyser.getFloatTimeDomainData(captureDataArray)

        // Convert to PCM16
        const pcm16 = new Int16Array(captureBufferLength)
        for (let i = 0; i < captureBufferLength; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, captureDataArray[i] * 32768))
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

  const stopGemini = async () => {
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
    analyserRef.current = null
    setAudioLevels(new Array(20).fill(0))

    // Sync session to web app if API key is set and there's transcript
    // Get fresh transcript from store
    const currentTranscript = useAppStore.getState().transcript
    console.log('Sync check:', { apiKey: !!apiKey, transcriptLen: currentTranscript.length, sessionStart: sessionStartRef.current })

    if (apiKey && currentTranscript.length > 0 && sessionStartRef.current > 0) {
      const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000)
      addLog('Syncing session...')
      try {
        await syncSession(apiKey, {
          transcript: currentTranscript,
          duration,
          title: `Coding Session - ${new Date().toLocaleDateString()}`,
        })
        addLog('Session synced!')
      } catch (e) {
        console.error('Sync error:', e)
        addLog('Sync failed')
      }
    }
    sessionStartRef.current = 0

    setStatus('idle')
  }

  const toggleListening = async () => {
    console.log('toggleListening, isListening:', isListening)
    if (isListening) {
      await stopGemini()
      setIsListening(false)
    } else {
      setLogs([])
      setIsListening(true)
      startGemini()
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#0f0f1a] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-yellow-400/10">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 font-semibold text-sm">Vibeless</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-white p-1 no-drag">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={() => window.electronAPI?.minimizeWindow()} className="text-gray-400 hover:text-white p-1 no-drag">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button onClick={() => window.electronAPI?.closeWindow()} className="text-gray-400 hover:text-red-400 p-1 no-drag">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="px-4 py-3 border-b border-yellow-400/10 bg-[#1a1a2e] no-drag">
          <label className="block text-xs text-gray-400 mb-1">Vibeless API Key</label>
          <input
            type="password"
            value={apiKey || ''}
            onChange={(e) => setApiKey(e.target.value || null)}
            placeholder="Enter your API key from vibeless.com"
            className="w-full px-2 py-1 text-xs bg-[#0f0f1a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {apiKey ? 'Connected to Vibeless' : 'Get your key at vibeless.com'}
          </p>
        </div>
      )}

      <div className="px-4 py-2 border-b border-yellow-400/10">
        <StatusIndicator status={status} />
      </div>

      <div className="px-4 py-2 flex justify-center">
        <WaveformViz isActive={isListening && !isMuted} status={status} audioLevels={audioLevels} />
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
            isListening ? 'bg-red-600' : 'bg-blue-500'
          }`}
        >
          {isListening ? (
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg className="w-6 h-6 text-gray-900 text-white " fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

export default App
