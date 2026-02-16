import * as fs from 'fs/promises'
import * as path from 'path'

export interface FileInfo {
  path: string
  relativePath: string
  name: string
  extension: string
  size: number
  symbols: string[] // function names, class names, etc.
}

export interface CodebaseIndex {
  rootPath: string
  repoName: string
  fileTree: string
  files: FileInfo[]
  totalFiles: number
  languages: Record<string, number>
  keyFiles: string[] // Important files like package.json, README, etc.
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'venv', '.venv', 'env', '.env', 'coverage', '.nyc_output',
  '.cache', '.parcel-cache', '.turbo', 'out', 'target'
])

const IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitignore', '.npmrc', 'yarn.lock',
  'package-lock.json', 'pnpm-lock.yaml'
])

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
  '.kt', '.scala', '.vue', '.svelte', '.astro'
])

const KEY_FILES = new Set([
  'package.json', 'tsconfig.json', 'README.md', 'Cargo.toml',
  'go.mod', 'requirements.txt', 'pyproject.toml', 'Makefile',
  'docker-compose.yml', 'Dockerfile', '.env.example'
])

// Extract symbols from code (simple regex-based extraction)
function extractSymbols(content: string, extension: string): string[] {
  const symbols: string[] = []

  // TypeScript/JavaScript
  if (['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
    // Functions
    const funcMatches = content.matchAll(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|[\(<])/g)
    for (const match of funcMatches) {
      if (match[1] && !['if', 'for', 'while', 'switch'].includes(match[1])) {
        symbols.push(`fn:${match[1]}`)
      }
    }

    // Classes
    const classMatches = content.matchAll(/class\s+(\w+)/g)
    for (const match of classMatches) {
      symbols.push(`class:${match[1]}`)
    }

    // Interfaces/Types
    const typeMatches = content.matchAll(/(?:interface|type)\s+(\w+)/g)
    for (const match of typeMatches) {
      symbols.push(`type:${match[1]}`)
    }

    // Exports
    const exportMatches = content.matchAll(/export\s+(?:default\s+)?(?:function|const|class|interface|type)\s+(\w+)/g)
    for (const match of exportMatches) {
      symbols.push(`export:${match[1]}`)
    }
  }

  // Python
  if (extension === '.py') {
    const funcMatches = content.matchAll(/def\s+(\w+)/g)
    for (const match of funcMatches) {
      symbols.push(`fn:${match[1]}`)
    }

    const classMatches = content.matchAll(/class\s+(\w+)/g)
    for (const match of classMatches) {
      symbols.push(`class:${match[1]}`)
    }
  }

  // Go
  if (extension === '.go') {
    const funcMatches = content.matchAll(/func\s+(?:\([^)]*\)\s*)?(\w+)/g)
    for (const match of funcMatches) {
      symbols.push(`fn:${match[1]}`)
    }

    const typeMatches = content.matchAll(/type\s+(\w+)/g)
    for (const match of typeMatches) {
      symbols.push(`type:${match[1]}`)
    }
  }

  // Rust
  if (extension === '.rs') {
    const funcMatches = content.matchAll(/fn\s+(\w+)/g)
    for (const match of funcMatches) {
      symbols.push(`fn:${match[1]}`)
    }

    const structMatches = content.matchAll(/(?:struct|enum|trait)\s+(\w+)/g)
    for (const match of structMatches) {
      symbols.push(`type:${match[1]}`)
    }
  }

  return [...new Set(symbols)] // Dedupe
}

async function scanDirectory(
  dirPath: string,
  rootPath: string,
  files: FileInfo[],
  treeLines: string[],
  depth: number = 0
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const indent = '  '.repeat(depth)

  // Sort: directories first, then files
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sorted) {
    if (IGNORE_DIRS.has(entry.name) || IGNORE_FILES.has(entry.name)) continue
    if (entry.name.startsWith('.') && !KEY_FILES.has(entry.name)) continue

    const fullPath = path.join(dirPath, entry.name)
    const relativePath = path.relative(rootPath, fullPath)

    if (entry.isDirectory()) {
      treeLines.push(`${indent}${entry.name}/`)
      // Limit depth to avoid massive trees
      if (depth < 4) {
        await scanDirectory(fullPath, rootPath, files, treeLines, depth + 1)
      }
    } else {
      const extension = path.extname(entry.name).toLowerCase()
      const stats = await fs.stat(fullPath)

      // Skip large files (>500KB)
      if (stats.size > 500 * 1024) continue

      treeLines.push(`${indent}${entry.name}`)

      let symbols: string[] = []
      if (CODE_EXTENSIONS.has(extension)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          symbols = extractSymbols(content, extension)
        } catch {
          // Skip unreadable files
        }
      }

      files.push({
        path: fullPath,
        relativePath,
        name: entry.name,
        extension,
        size: stats.size,
        symbols
      })
    }
  }
}

export async function indexCodebase(repoPath: string): Promise<CodebaseIndex> {
  const files: FileInfo[] = []
  const treeLines: string[] = []
  const repoName = path.basename(repoPath)

  console.log(`Indexing codebase: ${repoPath}`)

  await scanDirectory(repoPath, repoPath, files, treeLines)

  // Count languages
  const languages: Record<string, number> = {}
  for (const file of files) {
    if (CODE_EXTENSIONS.has(file.extension)) {
      const lang = file.extension.slice(1) // Remove the dot
      languages[lang] = (languages[lang] || 0) + 1
    }
  }

  // Find key files
  const keyFiles = files
    .filter(f => KEY_FILES.has(f.name))
    .map(f => f.relativePath)

  const index: CodebaseIndex = {
    rootPath: repoPath,
    repoName,
    fileTree: treeLines.join('\n'),
    files,
    totalFiles: files.length,
    languages,
    keyFiles
  }

  console.log(`Indexed ${files.length} files in ${repoName}`)
  console.log(`Languages: ${JSON.stringify(languages)}`)

  return index
}

// Find files relevant to a query (simple keyword matching)
export function findRelevantFiles(
  index: CodebaseIndex,
  query: string,
  maxFiles: number = 5
): FileInfo[] {
  const queryLower = query.toLowerCase()
  const words = queryLower.split(/\s+/).filter(w => w.length > 2)

  const scored = index.files.map(file => {
    let score = 0

    // Match file name
    if (file.name.toLowerCase().includes(queryLower)) score += 10
    for (const word of words) {
      if (file.name.toLowerCase().includes(word)) score += 3
    }

    // Match path
    for (const word of words) {
      if (file.relativePath.toLowerCase().includes(word)) score += 2
    }

    // Match symbols
    for (const symbol of file.symbols) {
      const symbolLower = symbol.toLowerCase()
      for (const word of words) {
        if (symbolLower.includes(word)) score += 5
      }
    }

    return { file, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map(s => s.file)
}
