import { useMemo } from 'react'
import Wave from 'react-wavify'
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
        return '#22c55e'
      case 'thinking':
        return '#3b82f6'
      case 'speaking':
        return '#FFD93D'
      default:
        return '#6b7280'
    }
  }, [status])

  const avgLevel = useMemo(() => {
    if (audioLevels.length === 0) return 0
    return audioLevels.reduce((a, b) => a + b, 0) / audioLevels.length
  }, [audioLevels])

  const amplitude = useMemo(() => {
    if (!isActive) return 5

    if (status === 'listening' && avgLevel > 0) {
      return Math.max(10, Math.min(40, avgLevel * 80))
    }

    switch (status) {
      case 'listening':
        return 15
      case 'thinking':
        return 20
      case 'speaking':
        return 30
      default:
        return 5
    }
  }, [isActive, status, avgLevel])

  const speed = useMemo(() => {
    if (!isActive) return 0.1

    switch (status) {
      case 'listening':
        return 0.2
      case 'thinking':
        return 0.3
      case 'speaking':
        return 0.4
      default:
        return 0.1
    }
  }, [isActive, status])

  return (
    <div className="w-[240px] h-[60px] overflow-hidden rounded-lg">
      <Wave
        fill={color}
        paused={false}
        style={{ display: 'flex', height: '100%' }}
        options={{
          height: 20,
          amplitude,
          speed,
          points: 4
        }}
      />
    </div>
  )
}
