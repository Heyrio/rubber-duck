import { AppStatus } from '../stores/appStore'

interface StatusIndicatorProps {
  status: AppStatus
}

const statusConfig: Record<AppStatus, { label: string; color: string; bgColor: string }> = {
  idle: {
    label: 'Ready',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500'
  },
  listening: {
    label: 'Listening...',
    color: 'text-green-400',
    bgColor: 'bg-green-500'
  },
  thinking: {
    label: 'Thinking...',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500'
  },
  speaking: {
    label: 'Speaking...',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400'
  }
}

export default function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className={`w-2.5 h-2.5 rounded-full ${config.bgColor}`} />
        {status !== 'idle' && (
          <div
            className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${config.bgColor} animate-ping opacity-75`}
          />
        )}
      </div>
      <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
    </div>
  )
}
