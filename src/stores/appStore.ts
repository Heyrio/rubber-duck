import { create } from 'zustand'

export type AppStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

interface AppState {
  isListening: boolean
  status: AppStatus
  isMuted: boolean
  lastScreenshot: string | null
  visionContext: string | null
  transcript: string[]
  error: string | null

  setIsListening: (value: boolean) => void
  setStatus: (status: AppStatus) => void
  setMuted: (value: boolean) => void
  setLastScreenshot: (screenshot: string | null) => void
  setVisionContext: (context: string | null) => void
  addToTranscript: (message: string) => void
  clearTranscript: () => void
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  isListening: false,
  status: 'idle',
  isMuted: false,
  lastScreenshot: null,
  visionContext: null,
  transcript: [],
  error: null,

  setIsListening: (value) => set({ isListening: value }),
  setStatus: (status) => set({ status }),
  setMuted: (value) => set({ isMuted: value }),
  setLastScreenshot: (screenshot) => set({ lastScreenshot: screenshot }),
  setVisionContext: (context) => set({ visionContext: context }),
  addToTranscript: (message) =>
    set((state) => ({
      transcript: [...state.transcript.slice(-50), message] // Keep last 50 messages
    })),
  clearTranscript: () => set({ transcript: [] }),
  setError: (error) => set({ error })
}))
