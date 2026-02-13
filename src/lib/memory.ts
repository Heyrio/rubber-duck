const MEMORY_KEY = 'vibeless_memory'

export interface MemoryEntry {
  type: 'project' | 'pattern' | 'decision' | 'context' | 'preference'
  content: string
  timestamp: number
}

export interface Memory {
  projectContext: string | null  // What project/repo we're working on
  recentWork: string | null      // What we were last working on
  entries: MemoryEntry[]         // Accumulated knowledge
}

const DEFAULT_MEMORY: Memory = {
  projectContext: null,
  recentWork: null,
  entries: []
}

export function getMemory(): Memory {
  if (typeof window === 'undefined') return DEFAULT_MEMORY
  const stored = localStorage.getItem(MEMORY_KEY)
  if (!stored) return DEFAULT_MEMORY
  try {
    return JSON.parse(stored) as Memory
  } catch {
    return DEFAULT_MEMORY
  }
}

export function saveMemory(memory: Memory) {
  if (typeof window === 'undefined') return
  // Keep only last 20 entries to prevent memory bloat
  const trimmed = {
    ...memory,
    entries: memory.entries.slice(-20)
  }
  localStorage.setItem(MEMORY_KEY, JSON.stringify(trimmed))
}

export function addMemoryEntry(entry: Omit<MemoryEntry, 'timestamp'>) {
  const memory = getMemory()
  memory.entries.push({ ...entry, timestamp: Date.now() })
  saveMemory(memory)
}

export function updateProjectContext(context: string) {
  const memory = getMemory()
  memory.projectContext = context
  saveMemory(memory)
}

export function updateRecentWork(work: string) {
  const memory = getMemory()
  memory.recentWork = work
  saveMemory(memory)
}

export function clearMemory() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(MEMORY_KEY)
}

export function buildMemoryPrompt(): string {
  const memory = getMemory()
  const parts: string[] = []

  if (memory.projectContext) {
    parts.push(`## Current Project\n${memory.projectContext}`)
  }

  if (memory.recentWork) {
    parts.push(`## Last Session\n${memory.recentWork}`)
  }

  if (memory.entries.length > 0) {
    const knowledgeItems = memory.entries
      .map(e => `- [${e.type}] ${e.content}`)
      .join('\n')
    parts.push(`## Accumulated Knowledge\n${knowledgeItems}`)
  }

  return parts.length > 0 ? parts.join('\n\n') : ''
}

// Extract knowledge from transcript using simple heuristics
// (Could be enhanced with AI later)
export async function extractKnowledge(transcript: string[], geminiKey?: string): Promise<{
  recentWork: string
  newEntries: Omit<MemoryEntry, 'timestamp'>[]
}> {
  if (!geminiKey || transcript.length === 0) {
    return { recentWork: '', newEntries: [] }
  }

  const conversationText = transcript.join('\n')

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Analyze this coding conversation and extract knowledge worth remembering for future sessions.

CONVERSATION:
${conversationText}

Respond with ONLY valid JSON:
{
  "recentWork": "Brief 1-sentence summary of what was being worked on",
  "entries": [
    {"type": "project", "content": "Info about the project/repo structure"},
    {"type": "pattern", "content": "A coding pattern used in this codebase"},
    {"type": "decision", "content": "An architectural or design decision made"},
    {"type": "context", "content": "Important context about the codebase"},
    {"type": "preference", "content": "User's coding preferences or style"}
  ]
}

Rules:
- Only extract genuinely useful knowledge for future sessions
- Skip generic/obvious information
- Keep entries concise (1 sentence each)
- Return empty entries array if nothing worth remembering
- Types: project, pattern, decision, context, preference` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
        })
      }
    )

    if (!response.ok) return { recentWork: '', newEntries: [] }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    let jsonStr = text.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
    }

    const result = JSON.parse(jsonStr)
    return {
      recentWork: result.recentWork || '',
      newEntries: result.entries || []
    }
  } catch (error) {
    console.error('Knowledge extraction error:', error)
    return { recentWork: '', newEntries: [] }
  }
}
