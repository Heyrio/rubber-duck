// Codebase context manager for dynamic prompt building

export interface FileInfo {
  path: string
  relativePath: string
  name: string
  extension: string
  size: number
  symbols: string[]
}

export interface CodebaseIndex {
  rootPath: string
  repoName: string
  fileTree: string
  files: FileInfo[]
  totalFiles: number
  languages: Record<string, number>
  keyFiles: string[]
}

// Store for the current codebase context
let currentIndex: CodebaseIndex | null = null
let recentFiles: Map<string, string> = new Map() // path -> content cache

export function setCodebaseIndex(index: CodebaseIndex | null) {
  currentIndex = index
  recentFiles.clear()
}

export function getCodebaseIndex(): CodebaseIndex | null {
  return currentIndex
}

export function hasCodebaseContext(): boolean {
  return currentIndex !== null
}

// Cache a file's content for quick access
export function cacheFileContent(path: string, content: string) {
  // Keep only last 10 files to avoid memory bloat
  if (recentFiles.size >= 10) {
    const firstKey = recentFiles.keys().next().value
    if (firstKey) recentFiles.delete(firstKey)
  }
  recentFiles.set(path, content)
}

export function getCachedFile(path: string): string | undefined {
  return recentFiles.get(path)
}

// Build a compact summary of the codebase for the system prompt
export function buildCodebaseContext(): string {
  if (!currentIndex) return ''

  const parts: string[] = []

  // Header
  parts.push(`## Active Repository: ${currentIndex.repoName}`)
  parts.push(`Path: ${currentIndex.rootPath}`)
  parts.push(`Files: ${currentIndex.totalFiles}`)

  // Languages
  const langs = Object.entries(currentIndex.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, count]) => `${lang}(${count})`)
    .join(', ')
  if (langs) {
    parts.push(`Languages: ${langs}`)
  }

  // Key files
  if (currentIndex.keyFiles.length > 0) {
    parts.push(`\nKey files: ${currentIndex.keyFiles.join(', ')}`)
  }

  // File tree (truncated)
  const treeLines = currentIndex.fileTree.split('\n')
  const truncatedTree = treeLines.slice(0, 50).join('\n')
  parts.push(`\n### Project Structure\n\`\`\`\n${truncatedTree}`)
  if (treeLines.length > 50) {
    parts.push(`... (${treeLines.length - 50} more entries)`)
  }
  parts.push('```')

  // Key symbols (top functions/classes)
  const allSymbols: string[] = []
  for (const file of currentIndex.files) {
    for (const symbol of file.symbols) {
      allSymbols.push(`${file.relativePath}: ${symbol}`)
    }
  }
  if (allSymbols.length > 0) {
    const topSymbols = allSymbols.slice(0, 30).join('\n')
    parts.push(`\n### Key Symbols\n${topSymbols}`)
    if (allSymbols.length > 30) {
      parts.push(`... (${allSymbols.length - 30} more symbols)`)
    }
  }

  return parts.join('\n')
}

// Find files that might be relevant based on current conversation
export function findRelevantContext(
  conversationHint: string
): { files: FileInfo[], suggestion: string } {
  if (!currentIndex) {
    return { files: [], suggestion: '' }
  }

  const hintLower = conversationHint.toLowerCase()
  const words = hintLower.split(/\s+/).filter(w => w.length > 2)

  const scored = currentIndex.files.map(file => {
    let score = 0

    // Match file name
    for (const word of words) {
      if (file.name.toLowerCase().includes(word)) score += 5
    }

    // Match path
    for (const word of words) {
      if (file.relativePath.toLowerCase().includes(word)) score += 2
    }

    // Match symbols
    for (const symbol of file.symbols) {
      const symbolLower = symbol.toLowerCase()
      for (const word of words) {
        if (symbolLower.includes(word)) score += 3
      }
    }

    return { file, score }
  })

  const relevant = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.file)

  let suggestion = ''
  if (relevant.length > 0) {
    suggestion = `Potentially relevant files: ${relevant.map(f => f.relativePath).join(', ')}`
  }

  return { files: relevant, suggestion }
}

// Build context snippet for specific files
export async function buildFileContext(filePaths: string[]): Promise<string> {
  const parts: string[] = []

  for (const filePath of filePaths) {
    let content: string | undefined = getCachedFile(filePath)

    if (!content && window.electronAPI?.getFileContent) {
      const fetched = await window.electronAPI.getFileContent(filePath)
      if (fetched) {
        content = fetched
        cacheFileContent(filePath, content)
      }
    }

    if (content) {
      // Truncate large files
      const lines = content.split('\n')
      const truncated = lines.slice(0, 100).join('\n')
      const relativePath = currentIndex?.files.find(f => f.path === filePath)?.relativePath || filePath

      parts.push(`### ${relativePath}`)
      parts.push('```')
      parts.push(truncated)
      if (lines.length > 100) {
        parts.push(`... (${lines.length - 100} more lines)`)
      }
      parts.push('```')
    }
  }

  return parts.join('\n')
}
