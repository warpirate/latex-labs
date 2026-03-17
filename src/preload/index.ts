import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const api = {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Status checks
  checkStatus: () => ipcRenderer.invoke('status:check'),

  // File operations
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  createProject: (opts: { name: string; path: string; format: string }) =>
    ipcRenderer.invoke('project:create', opts),
  readDir: (path: string) => ipcRenderer.invoke('project:readDir', path),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),

  // Recent projects
  getRecentProjects: () => ipcRenderer.invoke('projects:recent'),
  addRecentProject: (path: string) => ipcRenderer.invoke('projects:addRecent', path),

  // Project management
  setActiveProject: (path: string) => ipcRenderer.invoke('project:setActive', path),
  readProjectConfig: (path: string) => ipcRenderer.invoke('project:readConfig', path) as Promise<{ format: string } | null>,

  // Claude CLI — streaming
  claudeExecute: (opts: {
    chatId: string; prompt: string; cwd: string;
    sessionId?: string; model?: string; effortLevel?: string
  }) => ipcRenderer.invoke('claude:execute', opts),

  claudeCancel: (chatId: string) => ipcRenderer.invoke('claude:cancel', chatId),

  onClaudeStream: (callback: (data: { chatId: string; message: ClaudeStreamMessage }) => void) => {
    const handler = (_e: IpcRendererEvent, data: { chatId: string; message: ClaudeStreamMessage }) => callback(data)
    ipcRenderer.on('claude:stream', handler)
    return () => ipcRenderer.removeListener('claude:stream', handler)
  },

  onClaudeError: (callback: (data: { chatId: string; error: string }) => void) => {
    const handler = (_e: IpcRendererEvent, data: { chatId: string; error: string }) => callback(data)
    ipcRenderer.on('claude:error', handler)
    return () => ipcRenderer.removeListener('claude:error', handler)
  },

  onClaudeComplete: (callback: (data: { chatId: string; success: boolean; exitCode: number }) => void) => {
    const handler = (_e: IpcRendererEvent, data: { chatId: string; success: boolean; exitCode: number }) => callback(data)
    ipcRenderer.on('claude:complete', handler)
    return () => ipcRenderer.removeListener('claude:complete', handler)
  },

  // Legacy non-streaming
  runClaude: (prompt: string, cwd?: string) => ipcRenderer.invoke('claude:run', prompt, cwd),

  // Tectonic
  compile: (texPath: string) => ipcRenderer.invoke('tectonic:compile', texPath),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // File management
  createFile: (path: string) => ipcRenderer.invoke('file:createFile', path),
  createFolder: (path: string) => ipcRenderer.invoke('file:createFolder', path),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
  deleteFile: (path: string) => ipcRenderer.invoke('file:delete', path),
  copyFileInto: (src: string, destDir: string) => ipcRenderer.invoke('file:copyInto', src, destDir),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile') as Promise<string[]>
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
