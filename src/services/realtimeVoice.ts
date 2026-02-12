import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '../stores/appStore'

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17'

export function useRealtimeVoice() {
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const { setStatus, addToTranscript, setError, visionContext } = useAppStore()

  const getApiKey = (): string => {
    return import.meta.env.VITE_OPENAI_API_KEY || ''
  }

  const playAudioDelta = useCallback((base64Audio: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 })
      }

      const audioContext = audioContextRef.current
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

      const audioBuffer = audioContext.createBuffer(1, float32.length, 24000)
      audioBuffer.getChannelData(0).set(float32)

      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start()
    } catch (err) {
      console.error('Audio playback error:', err)
    }
  }, [])

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data)
      console.log('Realtime message:', message.type)

      switch (message.type) {
        case 'session.created':
          console.log('Realtime session created')
          setStatus('listening')
          break

        case 'input_audio_buffer.speech_started':
          setStatus('listening')
          break

        case 'input_audio_buffer.speech_stopped':
          setStatus('thinking')
          break

        case 'conversation.item.input_audio_transcription.completed':
          if (message.transcript) {
            addToTranscript(`You: ${message.transcript}`)
          }
          break

        case 'response.audio.delta':
          setStatus('speaking')
          if (message.delta) {
            playAudioDelta(message.delta)
          }
          break

        case 'response.audio_transcript.done':
          if (message.transcript) {
            addToTranscript(`Duck: ${message.transcript}`)
          }
          break

        case 'response.done':
          setStatus('listening')
          break

        case 'error':
          console.error('Realtime API error:', message.error)
          setError(message.error?.message || 'API error')
          break
      }
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }, [setStatus, addToTranscript, setError, playAudioDelta])

  const sendAudioChunk = useCallback((audioData: Float32Array) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    try {
      const pcm16 = new Int16Array(audioData.length)
      for (let i = 0; i < audioData.length; i++) {
        const s = Math.max(-1, Math.min(1, audioData[i]))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }

      const bytes = new Uint8Array(pcm16.buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)

      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64
      }))
    } catch (err) {
      console.error('Send audio error:', err)
    }
  }, [])

  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      mediaStreamRef.current = stream
      audioContextRef.current = new AudioContext({ sampleRate: 24000 })

      const source = audioContextRef.current.createMediaStreamSource(stream)
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        sendAudioChunk(new Float32Array(inputData))
      }

      source.connect(processor)
      processor.connect(audioContextRef.current.destination)
      processorRef.current = processor

      console.log('Microphone started')
    } catch (error) {
      console.error('Failed to start microphone:', error)
      setError('Microphone access denied')
    }
  }, [sendAudioChunk, setError])

  const stopMicrophone = useCallback(() => {
    try {
      if (processorRef.current) {
        processorRef.current.disconnect()
        processorRef.current = null
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    } catch (err) {
      console.error('Stop mic error:', err)
    }
  }, [])

  const connect = useCallback(async () => {
    const apiKey = getApiKey()
    if (!apiKey) {
      setError('OpenAI API key not configured')
      return
    }

    try {
      console.log('Connecting to OpenAI Realtime API...')

      const ws = new WebSocket(OPENAI_REALTIME_URL, [
        'realtime',
        `openai-insecure-api-key.${apiKey}`,
        'openai-beta.realtime-v1'
      ])

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)

        const systemPrompt = `You are a friendly rubber duck coding companion. You help developers think through their code by listening, asking clarifying questions, and pointing out potential issues. Keep responses concise and conversational.${visionContext ? `\n\nCurrent screen context: ${visionContext}` : ''}`

        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: systemPrompt,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 700
            }
          }
        }))

        startMicrophone()
      }

      ws.onmessage = handleMessage

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('Connection error')
        setIsConnected(false)
      }

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        setIsConnected(false)
        setStatus('idle')
        stopMicrophone()
      }

      wsRef.current = ws
    } catch (error) {
      console.error('Failed to connect:', error)
      setError('Failed to connect')
      setIsConnected(false)
    }
  }, [handleMessage, setError, setStatus, startMicrophone, stopMicrophone, visionContext])

  const disconnect = useCallback(() => {
    try {
      stopMicrophone()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      setIsConnected(false)
      setStatus('idle')
    } catch (err) {
      console.error('Disconnect error:', err)
    }
  }, [stopMicrophone, setStatus])

  return {
    connect,
    disconnect,
    isConnected
  }
}
