import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

interface AppState {
  isListening: boolean
  status: AppStatus
  isMuted: boolean
  lastScreenshot: string | null
  visionContext: string | null
  transcript: string[]
  error: string | null

  // Sync settings
  apiKey: string | null
  sessionStartTime: number | null

  // Settings panel
  showSettings: boolean

  setIsListening: (value: boolean) => void
  setStatus: (status: AppStatus) => void
  setMuted: (value: boolean) => void
  setLastScreenshot: (screenshot: string | null) => void
  setVisionContext: (context: string | null) => void
  addToTranscript: (message: string) => void
  clearTranscript: () => void
  setError: (error: string | null) => void
  setApiKey: (key: string | null) => void
  setSessionStartTime: (time: number | null) => void
  setShowSettings: (show: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isListening: false,
      status: 'idle',
      isMuted: false,
      lastScreenshot: null,
      visionContext: null,
      transcript: [],
      error: null,
      apiKey: null,
      sessionStartTime: null,
      showSettings: false,

      setIsListening: (value) => set({ isListening: value }),
      setStatus: (status) => set({ status }),
      setMuted: (value) => set({ isMuted: value }),
      setLastScreenshot: (screenshot) => set({ lastScreenshot: screenshot }),
      setVisionContext: (context) => set({ visionContext: context }),
      addToTranscript: (message) =>
        set((state) => ({
          transcript: [...state.transcript.slice(-50), message]
        })),
      clearTranscript: () => set({ transcript: [] }),
      setError: (error) => set({ error }),
      setApiKey: (key) => set({ apiKey: key }),
      setSessionStartTime: (time) => set({ sessionStartTime: time }),
      setShowSettings: (show) => set({ showSettings: show }),
    }),
    {
      name: 'vibeless-storage',
      partialize: (state) => ({ apiKey: state.apiKey }), // Only persist apiKey
    }
  )
)
