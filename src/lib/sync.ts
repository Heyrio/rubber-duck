const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface SyncSession {
  title?: string
  summary?: string
  transcript: string[]
  duration: number
  flashcards?: { front: string; back: string; category?: string }[]
  learningMoments?: { type: string; content: string; context?: string; timestamp?: number }[]
}

export async function syncSession(apiKey: string, session: SyncSession) {
  const url = `${API_URL}/api/sync/session`
  console.log('Syncing to:', url)
  console.log('Session data:', JSON.stringify(session, null, 2))

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(session),
    })

    console.log('Sync response status:', res.status)

    if (!res.ok) {
      const error = await res.json()
      console.error('Sync error response:', error)
      throw new Error(error.error || 'Sync failed')
    }

    const result = await res.json()
    console.log('Sync success:', result)
    return result
  } catch (error) {
    console.error('Sync error:', error)
    throw error
  }
}

export async function createFlashcard(apiKey: string, flashcard: { front: string; back: string; category?: string }) {
  try {
    const res = await fetch(`${API_URL}/api/flashcards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(flashcard),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Create flashcard failed')
    }

    return await res.json()
  } catch (error) {
    console.error('Create flashcard error:', error)
    throw error
  }
}

export function getStoredApiKey(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('vibeless_api_key')
  }
  return null
}

export function setStoredApiKey(key: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('vibeless_api_key', key)
  }
}
