import { create } from 'zustand'

// ── Chat Types ──

export interface ThinkingBlock {
  text: string
  collapsed: boolean
}

export interface ToolUseBlock {
  name: string
  input: string
  status: 'running' | 'done' | 'error'
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  thinking?: ThinkingBlock[]
  toolUses?: ToolUseBlock[]
}

export interface ChatTab {
  id: string
  title: string
  messages: ChatMessage[]
  sessionId: string | null
  isStreaming: boolean
  streamingText: string
  streamingThinking: string
  streamingToolUses: ToolUseBlock[]
  createdAt: number
}

// ── App State ──

interface AppState {
  // View
  view: 'landing' | 'workspace'
  setView: (view: 'landing' | 'workspace') => void

  // Project
  projectPath: string | null
  projectFormat: string
  setProject: (path: string, format: string) => void

  // Editor
  activeFile: string | null
  fileContent: string
  setActiveFile: (path: string | null) => void
  setFileContent: (content: string) => void
  isDirty: boolean
  setDirty: (dirty: boolean) => void
  fileTreeVersion: number
  bumpFileTree: () => void

  // Sidebar
  sidebarTab: 'files' | 'outline' | 'citations' | 'ai'
  setSidebarTab: (tab: 'files' | 'outline' | 'citations' | 'ai') => void

  // Chat tabs
  chatTabs: ChatTab[]
  activeChatId: string
  createChat: () => string
  deleteChat: (id: string) => void
  setActiveChat: (id: string) => void
  renameChat: (id: string, title: string) => void

  // Chat messages
  addMessage: (chatId: string, msg: ChatMessage) => void
  appendStreamText: (chatId: string, text: string) => void
  appendStreamThinking: (chatId: string, text: string) => void
  addStreamToolUse: (chatId: string, tool: ToolUseBlock) => void
  updateStreamToolStatus: (chatId: string, name: string, status: ToolUseBlock['status']) => void
  finalizeStream: (chatId: string) => void
  setStreaming: (chatId: string, streaming: boolean) => void
  setSessionId: (chatId: string, sessionId: string) => void
  clearMessages: (chatId: string) => void
  toggleThinking: (chatId: string, msgIndex: number, thinkingIndex: number) => void

  // Compile
  compileLog: string
  pdfPath: string | null
  isCompiling: boolean
  setCompileResult: (log: string, pdfPath: string | null) => void
  setCompiling: (compiling: boolean) => void

  // AI Settings
  effortLevel: 'low' | 'medium' | 'high'
  setEffortLevel: (level: 'low' | 'medium' | 'high') => void

  // Quick actions from toolbar
  pendingQuickAction: string | null
  setPendingQuickAction: (prompt: string | null) => void
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function createNewTab(): ChatTab {
  const id = makeId()
  return {
    id,
    title: 'New Chat',
    messages: [],
    sessionId: null,
    isStreaming: false,
    streamingText: '',
    streamingThinking: '',
    streamingToolUses: [],
    createdAt: Date.now()
  }
}

const initialTab = createNewTab()

export const useStore = create<AppState>((set, get) => ({
  view: 'landing',
  setView: (view) => set({ view }),

  projectPath: null,
  projectFormat: 'ieee',
  setProject: (path, format) => set({ projectPath: path, projectFormat: format, view: 'workspace' }),

  activeFile: null,
  fileContent: '',
  setActiveFile: (path) => set({ activeFile: path }),
  setFileContent: (content) => set({ fileContent: content }),
  isDirty: false,
  setDirty: (dirty) => set({ isDirty: dirty }),
  fileTreeVersion: 0,
  bumpFileTree: () => set((s) => ({ fileTreeVersion: s.fileTreeVersion + 1 })),

  sidebarTab: 'files',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  // Chat tabs
  chatTabs: [initialTab],
  activeChatId: initialTab.id,

  createChat: () => {
    const tab = createNewTab()
    set((s) => ({
      chatTabs: [...s.chatTabs, tab],
      activeChatId: tab.id
    }))
    return tab.id
  },

  deleteChat: (id) => {
    const state = get()
    if (state.chatTabs.length <= 1) {
      // Can't delete last tab — just clear it
      const tab = createNewTab()
      set({ chatTabs: [tab], activeChatId: tab.id })
      return
    }
    const remaining = state.chatTabs.filter(t => t.id !== id)
    const newActive = state.activeChatId === id
      ? remaining[remaining.length - 1].id
      : state.activeChatId
    // Cancel any streaming process
    window.api.claudeCancel(id)
    set({ chatTabs: remaining, activeChatId: newActive })
  },

  setActiveChat: (id) => set({ activeChatId: id }),

  renameChat: (id, title) => set((s) => ({
    chatTabs: s.chatTabs.map(t => t.id === id ? { ...t, title } : t)
  })),

  // Messages
  addMessage: (chatId, msg) => set((s) => ({
    chatTabs: s.chatTabs.map(t =>
      t.id === chatId ? { ...t, messages: [...t.messages, msg] } : t
    )
  })),

  appendStreamText: (chatId, text) => set((s) => ({
    chatTabs: s.chatTabs.map(t =>
      t.id === chatId ? { ...t, streamingText: t.streamingText + text } : t
    )
  })),

  appendStreamThinking: (chatId, text) => set((s) => ({
    chatTabs: s.chatTabs.map(t =>
      t.id === chatId ? { ...t, streamingThinking: t.streamingThinking + text } : t
    )
  })),

  addStreamToolUse: (chatId, tool) => set((s) => ({
    chatTabs: s.chatTabs.map(t =>
      t.id === chatId ? { ...t, streamingToolUses: [...t.streamingToolUses, tool] } : t
    )
  })),

  updateStreamToolStatus: (chatId, name, status) => set((s) => ({
    chatTabs: s.chatTabs.map(t => {
      if (t.id !== chatId) return t
      const tools = [...t.streamingToolUses]
      const last = tools.findLastIndex(tu => tu.name === name)
      if (last >= 0) tools[last] = { ...tools[last], status }
      return { ...t, streamingToolUses: tools }
    })
  })),

  finalizeStream: (chatId) => set((s) => ({
    chatTabs: s.chatTabs.map(t => {
      if (t.id !== chatId || (!t.streamingText && !t.streamingThinking && t.streamingToolUses.length === 0)) return t
      const thinking: ThinkingBlock[] = t.streamingThinking
        ? [{ text: t.streamingThinking, collapsed: true }]
        : []
      return {
        ...t,
        messages: [...t.messages, {
          role: 'assistant' as const,
          content: t.streamingText,
          timestamp: Date.now(),
          thinking,
          toolUses: t.streamingToolUses.length > 0 ? [...t.streamingToolUses] : undefined
        }],
        streamingText: '',
        streamingThinking: '',
        streamingToolUses: [],
        isStreaming: false
      }
    })
  })),

  setStreaming: (chatId, streaming) => set((s) => ({
    chatTabs: s.chatTabs.map(t =>
      t.id === chatId ? {
        ...t,
        isStreaming: streaming,
        streamingText: streaming ? '' : t.streamingText,
        streamingThinking: streaming ? '' : t.streamingThinking,
        streamingToolUses: streaming ? [] : t.streamingToolUses
      } : t
    )
  })),

  setSessionId: (chatId, sessionId) => set((s) => ({
    chatTabs: s.chatTabs.map(t =>
      t.id === chatId ? { ...t, sessionId } : t
    )
  })),

  clearMessages: (chatId) => set((s) => ({
    chatTabs: s.chatTabs.map(t =>
      t.id === chatId ? { ...t, messages: [], sessionId: null, streamingText: '', streamingThinking: '', streamingToolUses: [] } : t
    )
  })),

  toggleThinking: (chatId, msgIndex, thinkingIndex) => set((s) => ({
    chatTabs: s.chatTabs.map(t => {
      if (t.id !== chatId) return t
      const msgs = [...t.messages]
      const msg = { ...msgs[msgIndex] }
      if (msg.thinking) {
        const thinking = [...msg.thinking]
        thinking[thinkingIndex] = { ...thinking[thinkingIndex], collapsed: !thinking[thinkingIndex].collapsed }
        msg.thinking = thinking
      }
      msgs[msgIndex] = msg
      return { ...t, messages: msgs }
    })
  })),

  // Compile
  compileLog: '',
  pdfPath: null,
  isCompiling: false,
  setCompileResult: (log, pdfPath) => set({ compileLog: log, pdfPath, isCompiling: false }),
  setCompiling: (compiling) => set({ isCompiling: compiling }),

  effortLevel: 'medium',
  setEffortLevel: (level) => set({ effortLevel: level }),

  pendingQuickAction: null,
  setPendingQuickAction: (prompt) => set({ pendingQuickAction: prompt })
}))
