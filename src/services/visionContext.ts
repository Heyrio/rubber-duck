import { useCallback, useRef } from 'react'
import { useAppStore } from '../stores/appStore'

const CAPTURE_INTERVAL = 30000 // 30 seconds between captures

export function useVisionContext() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { setVisionContext } = useAppStore()

  const analyzeScreenshot = useCallback(async (base64Image: string): Promise<string | null> => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) return null

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'Briefly describe the code/application visible on screen in 1-2 sentences. Focus on language, errors, and what the developer is working on.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`,
                    detail: 'low'
                  }
                },
                {
                  type: 'text',
                  text: 'What is on this screen?'
                }
              ]
            }
          ],
          max_tokens: 150
        })
      })

      if (!response.ok) {
        console.error('Vision API error:', response.status)
        return null
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || null
    } catch (error) {
      console.error('Vision analysis failed:', error)
      return null
    }
  }, [])

  const captureAndAnalyze = useCallback(async () => {
    try {
      // Check if electronAPI is available
      if (!window.electronAPI?.captureScreen) {
        console.log('Screen capture not available')
        return
      }

      const screenshot = await window.electronAPI.captureScreen()
      if (!screenshot) {
        console.log('No screenshot captured')
        return
      }

      console.log('Screenshot captured, analyzing...')
      const context = await analyzeScreenshot(screenshot)

      if (context) {
        setVisionContext(context)
        console.log('Vision context:', context)
      }
    } catch (error) {
      console.error('Capture failed:', error)
      // Don't set error - just log it, screen capture is optional
    }
  }, [analyzeScreenshot, setVisionContext])

  const startCapturing = useCallback(() => {
    // Don't capture immediately - wait for first interval
    // This prevents issues during startup
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    intervalRef.current = setInterval(captureAndAnalyze, CAPTURE_INTERVAL)
    console.log('Vision capture started')
  }, [captureAndAnalyze])

  const stopCapturing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    console.log('Vision capture stopped')
  }, [])

  return {
    startCapturing,
    stopCapturing,
    triggerCapture: captureAndAnalyze
  }
}
