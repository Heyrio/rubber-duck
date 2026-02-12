import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { captureScreen } from './screenCapture'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isListening = false
let currentDisplayId: number | null = null
let screenFollowInterval: ReturnType<typeof setInterval> | null = null

const isDev = !app.isPackaged

function positionWindowOnDisplay(display: Electron.Display) {
  if (!mainWindow) return
  const { x, y, width, height } = display.workArea
  // Position in bottom-right corner of this display
  mainWindow.setPosition(x + width - 340, y + height - 420)
  currentDisplayId = display.id
}

function followCursorToScreen() {
  if (!mainWindow) return

  const cursorPoint = screen.getCursorScreenPoint()
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)

  // Only move if we changed displays
  if (currentDisplay.id !== currentDisplayId) {
    positionWindowOnDisplay(currentDisplay)
  }
}

function startScreenFollowing() {
  if (screenFollowInterval) return
  // Check every 500ms if cursor moved to different screen
  screenFollowInterval = setInterval(followCursorToScreen, 500)
}

function stopScreenFollowing() {
  if (screenFollowInterval) {
    clearInterval(screenFollowInterval)
    screenFollowInterval = null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 400,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Position in bottom-right corner of cursor's current screen
  const cursorPoint = screen.getCursorScreenPoint()
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
  positionWindowOnDisplay(currentDisplay)

  // Make window visible on all macOS spaces/desktops (for swipe gestures)
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Start following cursor between physical screens/monitors
  startScreenFollowing()

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    stopScreenFollowing()
    mainWindow = null
  })
}

function createTray() {
  // Create a simple duck icon (yellow circle for now)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABo0lEQVR4nO2Xv0oDQRDGf3cxBBQRC4tgYSEIFoKNjY2FhQ+gj+ADWPkOPoSVrY2FhYWIYGNhESwECxERFQv/gHdwM7AWt5fL5S6XuLrgg4Wd2dl+s7O7OwOr+EMIcBbgBrg0AycSwMCAE+C9XQfqjnAO7DcCnyABdoFrYEMJtOuAy8C2EqgZ0K4DrgGbSqBmQNcD+IAVYEEJbALnQK8BfQMOgSElsAEcAX0G9CxwDAwpgW3gCBhQApNKYBkYFgJjemABEhNp9iL4BxDQYpRhJA4B5f96JCxAlC/5MxIZwV9KxIhyLiFKxBpC1O2lCEmzP02ChJ5ZOIZh0g8kCST0kkL4TomYBPJfq1QT+4AOXa4aWApxEQz8BTBXE0BEEK7/M4FanGkE8gA4Dz5D4k8Fqn2tQpLWdECk9iNAYX+WCcYxEfxPB6p5hRCpYQfJJhD5DyhQy0Og4gpxEXRJB0q5BBLuQNQl4iIYhA6Uu0TsEKkLkrqg2tRtYjnk8jzRFGIH+s93oNYdCG+Jv3YHwlfyLx2o5Z3H8jb8azrwBV35ZBjqz4KOAAAAAElFTkSuQmCC'
  )

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isListening ? 'Stop Listening' : 'Start Listening',
      click: () => toggleListening()
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => mainWindow?.show()
    },
    {
      label: 'Hide Window',
      click: () => mainWindow?.hide()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ])

  tray.setToolTip('Vibeless')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
    }
  })
}

function toggleListening() {
  isListening = !isListening
  mainWindow?.webContents.send('toggle-listening', isListening)
  createTray() // Refresh tray menu
}

function registerShortcuts() {
  // Cmd+Shift+D to toggle window visibility and listening
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
      if (isListening) toggleListening()
    } else {
      mainWindow?.show()
      if (!isListening) toggleListening()
    }
  })
}

// IPC Handlers
ipcMain.handle('capture-screen', async () => {
  try {
    const screenshot = await captureScreen()
    return screenshot
  } catch (error) {
    console.error('Screen capture failed:', error)
    return null
  }
})

ipcMain.handle('get-listening-state', () => isListening)

ipcMain.on('set-listening', (_event, value: boolean) => {
  isListening = value
  createTray()
})

ipcMain.on('minimize-window', () => {
  mainWindow?.hide()
  // Show dock icon when window is hidden so user can find the app
  app.dock?.show()
})

ipcMain.on('close-window', () => {
  app.quit()
})

app.whenReady().then(() => {
  createWindow()
  createTray()
  registerShortcuts()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  } else {
    // Show window when clicking dock icon
    mainWindow.show()
  }
})

app.on('will-quit', () => {
  stopScreenFollowing()
  globalShortcut.unregisterAll()
})
