const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getListeningState: () => ipcRenderer.invoke('get-listening-state'),
  setListening: (value: boolean) => ipcRenderer.send('set-listening', value),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  onToggleListening: (callback: (isListening: boolean) => void) => {
    ipcRenderer.on('toggle-listening', (_event: unknown, isListening: boolean) => callback(isListening))
  },
  removeToggleListeningListener: () => {
    ipcRenderer.removeAllListeners('toggle-listening')
  }
})
