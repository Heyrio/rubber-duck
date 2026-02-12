const API_URL = 'http://localhost:3000' // Change to production URL later

interface SyncSession {
  title?: string
  summary?: string
  transcript: string[]
  duration: number
  flashcards?: { front: string; back: string; category?: string }[]
  learningMoments?: { type: string; content: string; context?: string; timestamp?: number }[]
}

export async function syncSession(apiKey: string, session: SyncSession) {
  try {
    const res = await fetch(`${API_URL}/api/sync/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(session),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Sync failed')
    }

    return await res.json()
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
