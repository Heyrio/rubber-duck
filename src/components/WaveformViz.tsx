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
    if (!isActive) return 0.3

    if (status === 'listening' && audioLevels.length > 0) {
      const avg = audioLevels.reduce((a, b) => a + b, 0) / audioLevels.length
      return Math.max(0.5, Math.min(4, avg * 6 + 0.5))
    }

    switch (status) {
      case 'listening':
        return 1
      case 'thinking':
        return 1.5
      case 'speaking':
        return 2.5
      default:
        return 0.3
    }
  }, [isActive, status, audioLevels])

  const speed = useMemo(() => {
    if (!isActive) return 0.03

    switch (status) {
      case 'listening':
        return 0.1
      case 'thinking':
        return 0.15
      case 'speaking':
        return 0.2
      default:
        return 0.03
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
