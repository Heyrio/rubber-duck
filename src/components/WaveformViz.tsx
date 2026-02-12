import { useMemo } from 'react'
import SiriWave from 'react-siriwave'
import { AppStatus } from '../stores/appStore'

interface WaveformVizProps {
  isActive: boolean
  status: AppStatus
  audioLevels?: number[]
}

export default function WaveformViz({ isActive, status, audioLevels = [] }: WaveformVizProps) {
  const color = useMemo(() => {
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
  }, [status])

  const amplitude = useMemo(() => {
    if (!isActive) return 0.1

    if (status === 'listening' && audioLevels.length > 0) {
      const avg = audioLevels.reduce((a, b) => a + b, 0) / audioLevels.length
      return Math.max(0.2, Math.min(3, avg * 4))
    }

    switch (status) {
      case 'listening':
        return 0.5
      case 'thinking':
        return 0.8
      case 'speaking':
        return 1.5
      default:
        return 0.1
    }
  }, [isActive, status, audioLevels])

  const speed = useMemo(() => {
    if (!isActive) return 0.02

    switch (status) {
      case 'listening':
        return 0.05
      case 'thinking':
        return 0.08
      case 'speaking':
        return 0.12
      default:
        return 0.02
    }
  }, [isActive, status])

  return (
    <SiriWave
      theme="ios9"
      color={color}
      width={240}
      height={60}
      amplitude={amplitude}
      speed={speed}
      autostart={true}
    />
  )
}
