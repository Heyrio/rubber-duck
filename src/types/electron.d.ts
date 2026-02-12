export interface ElectronAPI {
  captureScreen: () => Promise<string | null>
  getListeningState: () => Promise<boolean>
  setListening: (value: boolean) => void
  minimizeWindow: () => void
  onToggleListening: (callback: (isListening: boolean) => void) => void
  removeToggleListeningListener: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
