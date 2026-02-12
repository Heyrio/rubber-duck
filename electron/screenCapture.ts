import screenshot from 'screenshot-desktop'

let lastCaptureTime = 0
const MIN_CAPTURE_INTERVAL = 5000 // 5 seconds minimum between captures

export async function captureScreen(): Promise<string | null> {
  const now = Date.now()

  // Debounce captures
  if (now - lastCaptureTime < MIN_CAPTURE_INTERVAL) {
    console.log('Screenshot debounced, too soon since last capture')
    return null
  }

  lastCaptureTime = now

  try {
    // Capture the primary display
    const img = await screenshot({ format: 'png' })

    // Convert buffer to base64
    const base64 = img.toString('base64')

    console.log(`Screenshot captured: ${Math.round(base64.length / 1024)}KB`)

    return base64
  } catch (error) {
    console.error('Failed to capture screen:', error)
    throw error
  }
}
