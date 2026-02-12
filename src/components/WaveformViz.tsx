import { useEffect, useRef } from 'react'
import { AppStatus } from '../stores/appStore'

interface WaveformVizProps {
  isActive: boolean
  status: AppStatus
  audioLevels?: number[]
}

export default function WaveformViz({ isActive, status, audioLevels = [] }: WaveformVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const barsRef = useRef<number[]>(new Array(20).fill(0))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bars = barsRef.current
    const barCount = 20
    const barWidth = 8
    const barGap = 4
    const maxHeight = 60

    const getTargetHeight = (index: number, time: number): number => {
      if (!isActive) {
        return 4 // Minimal height when inactive
      }

      // Use real audio levels when listening
      if (status === 'listening' && audioLevels.length > 0) {
        const level = audioLevels[index] || 0
        // Scale the level to a nice visual height (min 6, max 55)
        return 6 + level * 50
      }

      const centerIndex = barCount / 2
      const distanceFromCenter = Math.abs(index - centerIndex) / centerIndex

      switch (status) {
        case 'listening':
          // Gentle breathing animation (fallback when no audio data)
          return 8 + Math.sin(time / 300 + index * 0.3) * 15 * (1 - distanceFromCenter * 0.5)
        case 'thinking':
          // Wave pattern
          return 10 + Math.sin(time / 150 + index * 0.5) * 20
        case 'speaking':
          // More dynamic, speech-like
          return 15 + Math.random() * 30 * (1 - distanceFromCenter * 0.3)
        default:
          return 4
      }
    }

    const getColor = (): string => {
      switch (status) {
        case 'listening':
          return '#22c55e' // green
        case 'thinking':
          return '#3b82f6' // blue
        case 'speaking':
          return '#FFD93D' // duck yellow
        default:
          return '#6b7280' // gray
      }
    }

    const draw = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const color = getColor()

      for (let i = 0; i < barCount; i++) {
        const targetHeight = getTargetHeight(i, time)
        // Smooth interpolation - faster for real audio data
        const smoothing = status === 'listening' && audioLevels.length > 0 ? 0.3 : 0.15
        bars[i] += (targetHeight - bars[i]) * smoothing

        const x = i * (barWidth + barGap)
        const height = Math.max(4, bars[i])
        const y = (maxHeight - height) / 2

        // Draw bar with rounded ends
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, height, 4)
        ctx.fill()
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    animationRef.current = requestAnimationFrame(draw)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isActive, status, audioLevels])

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={60}
      className="opacity-90"
    />
  )
}
