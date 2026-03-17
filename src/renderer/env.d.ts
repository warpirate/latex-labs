/// <reference types="vite/client" />

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

interface StatusResult {
  claude: { ok: boolean; version: string; user: string }
  python: { ok: boolean; version: string }
  skills: { ok: boolean; count: number }
}

interface RecentProject {
  name: string
  path: string
  lastOpened: string
}

interface CompileResult {
  success: boolean
  pdfPath: string
  log: string
}

interface ClaudeExecuteOpts {
  chatId: string
  prompt: string
  cwd: string
  sessionId?: string
  model?: string
  effortLevel?: string
}

interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result'
  subtype?: string
  session_id?: string
  message?: {
    content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; thinking?: string }>
    usage?: { input_tokens: number; output_tokens: number }
  }
  text?: string // for raw non-JSON output
  cost_usd?: number
  duration_ms?: number
}

interface ProjectConfig {
  format: string
}

interface Window {
  api: {
    minimize: () => void
    maximize: () => void
    close: () => void
    checkStatus: () => Promise<StatusResult>
    openFolder: () => Promise<string | null>
    createProject: (opts: { name: string; path: string; format: string }) => Promise<string>
    readDir: (path: string) => Promise<FileEntry[]>
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<boolean>
    getRecentProjects: () => Promise<RecentProject[]>
    addRecentProject: (path: string) => Promise<void>
    // Project management
    setActiveProject: (path: string) => Promise<void>
    readProjectConfig: (path: string) => Promise<ProjectConfig | null>
    // Streaming Claude
    claudeExecute: (opts: ClaudeExecuteOpts) => Promise<{ started: boolean }>
    claudeCancel: (chatId: string) => Promise<void>
    onClaudeStream: (callback: (data: { chatId: string; message: ClaudeStreamMessage }) => void) => () => void
    onClaudeError: (callback: (data: { chatId: string; error: string }) => void) => () => void
    onClaudeComplete: (callback: (data: { chatId: string; success: boolean; exitCode: number }) => void) => () => void
    // Legacy
    runClaude: (prompt: string, cwd?: string) => Promise<string>
    compile: (texPath: string) => Promise<CompileResult>
    openExternal: (url: string) => Promise<void>
    // File management
    createFile: (path: string) => Promise<boolean>
    createFolder: (path: string) => Promise<boolean>
    renameFile: (oldPath: string, newPath: string) => Promise<boolean>
    deleteFile: (path: string) => Promise<boolean>
    copyFileInto: (src: string, destDir: string) => Promise<string>
    openFileDialog: () => Promise<string[]>
  }
}
