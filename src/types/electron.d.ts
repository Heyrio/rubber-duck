export interface CodebaseIndex {
  rootPath: string
  repoName: string
  fileTree: string
  files: Array<{
    path: string
    relativePath: string
    name: string
    extension: string
    size: number
    symbols: string[]
  }>
  totalFiles: number
  languages: Record<string, number>
  keyFiles: string[]
}

export interface ElectronAPI {
  captureScreen: () => Promise<string | null>
  getListeningState: () => Promise<boolean>
  setListening: (value: boolean) => void
  minimizeWindow: () => void
  closeWindow: () => void
  onToggleListening: (callback: (isListening: boolean) => void) => void
  removeToggleListeningListener: () => void
  // Codebase context features
  selectDirectory: () => Promise<string | null>
  indexCodebase: (repoPath: string) => Promise<CodebaseIndex | null>
  getCodebaseIndex: () => Promise<CodebaseIndex | null>
  getFileContent: (filePath: string) => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
