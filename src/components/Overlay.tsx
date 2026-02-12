import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import StatusIndicator from './StatusIndicator'
import WaveformViz from './WaveformViz'
import { useRealtimeVoice } from '../services/realtimeVoice'
import { useVisionContext } from '../services/visionContext'

export default function Overlay() {
  const {
    isListening,
    status,
    isMuted,
    transcript,
    error,
    setIsListening,
    setMuted
  } = useAppStore()

  const { connect, disconnect, isConnected } = useRealtimeVoice()
  const { startCapturing, stopCapturing } = useVisionContext()
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isListening && !isConnected) {
      connect()
      startCapturing()
    } else if (!isListening && isConnected) {
      disconnect()
      stopCapturing()
    }
  }, [isListening, isConnected, connect, disconnect, startCapturing, stopCapturing])

  useEffect(() => {
    // Auto-scroll transcript
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  const toggleListening = () => {
    const newValue = !isListening
    setIsListening(newValue)
    window.electronAPI?.setListening(newValue)
  }

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow()
  }

  return (
    <div className="h-full flex flex-col bg-duck-darker/95 rounded-2xl overflow-hidden border border-duck-yellow/20 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-duck-yellow/10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🦆</span>
          <span className="text-duck-yellow font-semibold">Rubber Duck</span>
        </div>
        <div className="flex items-center gap-2 no-drag">
          <button
            onClick={handleMinimize}
            className="text-gray-400 hover:text-white transition-colors p-1"
            title="Minimize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="px-4 py-3 border-b border-duck-yellow/10">
        <StatusIndicator status={status} />
      </div>

      {/* Waveform / Visual feedback */}
      <div className="px-4 py-4 flex justify-center">
        <WaveformViz isActive={isListening && !isMuted} status={status} />
      </div>

      {/* Transcript */}
      <div
        ref={transcriptRef}
        className="flex-1 px-4 py-2 overflow-y-auto text-sm text-gray-300 no-drag"
      >
        {transcript.length === 0 ? (
          <div className="text-gray-500 text-center mt-4">
            {isListening
              ? 'Listening... Say something!'
              : 'Press the button below to start'}
          </div>
        ) : (
          transcript.map((msg, i) => (
            <div
              key={i}
              className={`mb-2 ${
                msg.startsWith('You:')
                  ? 'text-duck-yellow'
                  : msg.startsWith('Duck:')
                  ? 'text-white'
                  : 'text-gray-500'
              }`}
            >
              {msg}
            </div>
          ))
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-red-900/50 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="px-4 py-4 border-t border-duck-yellow/10 flex items-center justify-center gap-4 no-drag">
        {/* Mute button */}
        <button
          onClick={() => setMuted(!isMuted)}
          disabled={!isListening}
          className={`p-2 rounded-full transition-all ${
            !isListening
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : isMuted
              ? 'bg-red-900/50 text-red-400 hover:bg-red-900'
              : 'bg-duck-dark text-gray-300 hover:text-white'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* Main listen button */}
        <button
          onClick={toggleListening}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all transform hover:scale-105 ${
            isListening
              ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/30'
              : 'bg-gradient-to-br from-duck-yellow to-duck-orange shadow-lg shadow-duck-yellow/30'
          }`}
        >
          {isListening ? (
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-duck-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* Settings placeholder */}
        <button
          className="p-2 rounded-full bg-duck-dark text-gray-300 hover:text-white transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Hotkey hint */}
      <div className="px-4 py-2 text-center text-xs text-gray-500 border-t border-duck-yellow/10">
        Press <kbd className="px-1.5 py-0.5 bg-duck-dark rounded text-gray-400">⌘⇧D</kbd> to toggle
      </div>
    </div>
  )
}
