import { useState, useRef, useEffect } from 'react'
import { Send, Loader, Trash2, Sparkles, Plus, X, Square, ChevronDown, ChevronRight, Brain, Wrench, Terminal, Zap } from 'lucide-react'
import { useStore, ChatTab, ChatMessage, ThinkingBlock, ToolUseBlock } from '../../store'

export default function AIChatPanel() {
  const chatTabs = useStore((s) => s.chatTabs)
  const activeChatId = useStore((s) => s.activeChatId)
  const createChat = useStore((s) => s.createChat)
  const deleteChat = useStore((s) => s.deleteChat)
  const setActiveChat = useStore((s) => s.setActiveChat)

  const activeTab = chatTabs.find(t => t.id === activeChatId) || chatTabs[0]

  return (
    <div className="h-full flex flex-col bg-claude-bg-secondary">
      <ChatTabBar
        tabs={chatTabs}
        activeId={activeChatId}
        onSelect={setActiveChat}
        onCreate={createChat}
        onDelete={deleteChat}
      />
      {activeTab && <ChatView key={activeTab.id} tab={activeTab} />}
    </div>
  )
}

// ── Tab Bar ──

function ChatTabBar({ tabs, activeId, onSelect, onCreate, onDelete }: {
  tabs: ChatTab[]; activeId: string;
  onSelect: (id: string) => void; onCreate: () => string; onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center border-b border-claude-border-subtle bg-claude-bg-tertiary">
      <div className="flex-1 flex items-center overflow-x-auto gap-px px-1 py-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`group flex items-center gap-1 px-2.5 py-1 rounded-md text-2xs font-medium transition-all duration-100 shrink-0 max-w-[130px]
              ${tab.id === activeId
                ? 'bg-claude-surface text-claude-accent'
                : 'text-claude-text-tertiary hover:bg-claude-surface-hover'
              }`}
          >
            <Sparkles size={9} className={`shrink-0 ${tab.id === activeId ? 'text-claude-accent' : 'text-claude-text-tertiary'}`} />
            <span className="truncate">{tab.title}</span>
            {tabs.length > 1 && (
              <X
                size={10}
                className="shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDelete(tab.id) }}
              />
            )}
          </button>
        ))}
      </div>
      <button
        onClick={() => onCreate()}
        className="p-1 mx-1 rounded-md transition-colors shrink-0 text-claude-text-tertiary hover:bg-claude-surface-hover hover:text-claude-text-secondary"
        title="New chat"
      >
        <Plus size={12} />
      </button>
    </div>
  )
}

// ── Single Chat View ──

function ChatView({ tab }: { tab: ChatTab }) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const addMessage = useStore((s) => s.addMessage)
  const appendStreamText = useStore((s) => s.appendStreamText)
  const appendStreamThinking = useStore((s) => s.appendStreamThinking)
  const addStreamToolUse = useStore((s) => s.addStreamToolUse)
  const updateStreamToolStatus = useStore((s) => s.updateStreamToolStatus)
  const finalizeStream = useStore((s) => s.finalizeStream)
  const setStreaming = useStore((s) => s.setStreaming)
  const setSessionId = useStore((s) => s.setSessionId)
  const clearMessages = useStore((s) => s.clearMessages)
  const renameChat = useStore((s) => s.renameChat)
  const bumpFileTree = useStore((s) => s.bumpFileTree)

  const activeFile = useStore((s) => s.activeFile)
  const projectPath = useStore((s) => s.projectPath)
  const projectFormat = useStore((s) => s.projectFormat)
  const effortLevel = useStore((s) => s.effortLevel)
  const pendingQuickAction = useStore((s) => s.pendingQuickAction)
  const setPendingQuickAction = useStore((s) => s.setPendingQuickAction)

  // Keep a stable ref to sendMessage to avoid stale closures in effects
  const sendMessageRef = useRef<(msg: string) => void>(() => {})

  // Consume quick actions from toolbar
  useEffect(() => {
    if (pendingQuickAction && !tab.isStreaming) {
      const action = pendingQuickAction
      setPendingQuickAction(null)
      // Small delay to ensure panel is rendered before sending
      setTimeout(() => sendMessageRef.current(action), 100)
    }
  }, [pendingQuickAction, tab.isStreaming])

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [tab.messages, tab.streamingText, tab.streamingThinking])

  // Streaming listeners
  useEffect(() => {
    const unsubStream = window.api.onClaudeStream((data) => {
      if (data.chatId !== tab.id) return
      const msg = data.message

      if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
        setSessionId(tab.id, msg.session_id)
        return
      }

      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'thinking' && block.text) {
            appendStreamThinking(tab.id, block.text)
          } else if (block.type === 'text' && block.text) {
            appendStreamText(tab.id, block.text)
          } else if (block.type === 'tool_use' && block.name) {
            addStreamToolUse(tab.id, {
              name: block.name,
              input: typeof block.input === 'string' ? block.input : JSON.stringify(block.input || {}).substring(0, 200),
              status: 'running'
            })
          } else if (block.type === 'tool_result') {
            updateStreamToolStatus(tab.id, block.name || '', 'done')
          }
        }
        return
      }

      if (msg.subtype === 'raw' && msg.text) {
        appendStreamText(tab.id, msg.text + '\n')
        return
      }
    })

    const unsubComplete = window.api.onClaudeComplete((data) => {
      if (data.chatId !== tab.id) return
      finalizeStream(tab.id)
      bumpFileTree()
      const state = useStore.getState()
      if (state.activeFile) {
        window.api.readFile(state.activeFile).then((content) => {
          state.setFileContent(content)
          state.setDirty(false)
        }).catch(() => {})
      }
    })

    const unsubError = window.api.onClaudeError((data) => {
      if (data.chatId !== tab.id) return
      appendStreamText(tab.id, `\n${data.error}\n`)
    })

    return () => { unsubStream(); unsubComplete(); unsubError() }
  }, [tab.id])

  async function sendMessage(userMsg: string) {
    addMessage(tab.id, { role: 'user', content: userMsg, timestamp: Date.now() })

    if (tab.messages.length === 0) {
      renameChat(tab.id, userMsg.substring(0, 40) + (userMsg.length > 40 ? '...' : ''))
    }

    const fileName = activeFile?.split(/[/\\]/).pop() || 'main.tex'
    let prompt = ''
    if (activeFile) {
      prompt += `[Currently open file: ${fileName}]\n`
      prompt += `[Format: ${projectFormat.toUpperCase()}]\n\n`
    }
    prompt += userMsg

    setStreaming(tab.id, true)

    try {
      await window.api.claudeExecute({
        chatId: tab.id,
        prompt,
        cwd: projectPath || '.',
        sessionId: tab.sessionId || undefined,
        effortLevel: effortLevel
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start Claude'
      addMessage(tab.id, {
        role: 'system',
        content: `Error: ${message}`,
        timestamp: Date.now()
      })
      setStreaming(tab.id, false)
    }
  }

  // Keep ref in sync so effects always call the latest version
  sendMessageRef.current = sendMessage

  async function handleSend() {
    if (!input.trim() || tab.isStreaming) return
    const userMsg = input.trim()
    setInput('')
    sendMessage(userMsg)
  }

  function handleCancel() {
    window.api.claudeCancel(tab.id)
    finalizeStream(tab.id)
  }

  function handleClear() {
    if (tab.isStreaming) handleCancel()
    clearMessages(tab.id)
    renameChat(tab.id, 'New Chat')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-claude-border-subtle">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded flex items-center justify-center bg-claude-accent/8">
            <Sparkles size={9} className="text-claude-accent" />
          </div>
          <span className="text-2xs font-semibold truncate max-w-[160px] text-claude-text">{tab.title}</span>
          {tab.sessionId && (
            <span className="text-[10px] px-1 py-px rounded font-mono text-claude-text-tertiary bg-claude-surface">
              {tab.sessionId.substring(0, 8)}
            </span>
          )}
        </div>
        <button
          onClick={handleClear}
          className="p-1 rounded-md transition-colors text-claude-text-tertiary hover:bg-claude-error/10 hover:text-claude-error"
          title="Clear chat"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-2.5 space-y-2">
        {tab.messages.length === 0 && !tab.streamingText && !tab.streamingThinking && (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center bg-claude-accent/6 border border-claude-accent/8">
              <Sparkles size={18} className="text-claude-accent/30" />
            </div>
            <p className="text-xs font-medium text-claude-text-secondary/60">Ask me anything about your paper.</p>
            <p className="text-2xs mt-1 text-claude-text-tertiary">I have full access to your project files.</p>
          </div>
        )}

        {tab.messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} chatId={tab.id} msgIndex={i} />
        ))}

        {/* Live streaming area */}
        {(tab.streamingThinking || tab.streamingText || tab.streamingToolUses.length > 0 || (tab.isStreaming && !tab.streamingText && !tab.streamingThinking)) && (
          <div className="space-y-1.5">
            {tab.streamingThinking && <LiveThinkingBlock text={tab.streamingThinking} />}

            {tab.streamingToolUses.map((tool, i) => (
              <LiveToolBlock key={i} tool={tool} />
            ))}

            {tab.streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[95%] rounded-xl rounded-bl px-3 py-2 text-xs leading-relaxed bg-claude-surface border border-claude-border-subtle">
                  <pre className="whitespace-pre-wrap text-claude-text" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: '12px', lineHeight: '1.6' }}>
                    {tab.streamingText}
                  </pre>
                  <span className="inline-block w-1 h-3 ml-0.5 align-middle animate-cursor-blink bg-claude-accent" />
                </div>
              </div>
            )}

            {tab.isStreaming && !tab.streamingText && !tab.streamingThinking && tab.streamingToolUses.length === 0 && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2 flex items-center gap-2 bg-claude-surface border border-claude-border-subtle">
                  <div className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full animate-thinking-dot-1 bg-claude-accent" />
                    <span className="w-1 h-1 rounded-full animate-thinking-dot-2 bg-claude-accent" />
                    <span className="w-1 h-1 rounded-full animate-thinking-dot-3 bg-claude-accent" />
                  </div>
                  <span className="text-2xs text-claude-text-tertiary">Claude is thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2.5 border-t border-claude-border-subtle">
        {/* Effort level toggle */}
        <EffortToggle />
        <div className="flex gap-1.5 mt-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your paper..."
            rows={2}
            disabled={tab.isStreaming}
            className="flex-1 rounded-lg px-2.5 py-2 text-xs resize-none focus:outline-none disabled:opacity-40
              bg-claude-bg border border-claude-border/60 text-claude-text placeholder:text-claude-text-tertiary
              focus:border-claude-accent/40 focus:ring-1 focus:ring-claude-accent/15 transition-all"
          />
          {tab.isStreaming ? (
            <button
              onClick={handleCancel}
              className="self-end p-2 rounded-lg transition-colors bg-[#D4564A]/12 text-[#D4564A] hover:bg-[#D4564A]/20"
              title="Stop generation"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="self-end p-2 rounded-lg transition-colors disabled:opacity-20 bg-claude-accent text-white hover:bg-claude-accent-light"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Effort Level Toggle ──

const EFFORT_LEVELS = [
  { value: 'low' as const, label: 'Quick', desc: 'Fast, concise responses' },
  { value: 'medium' as const, label: 'Balanced', desc: 'Good balance of speed and depth' },
  { value: 'high' as const, label: 'Thorough', desc: 'Deep analysis, detailed output' }
]

function EffortToggle() {
  const effortLevel = useStore((s) => s.effortLevel)
  const setEffortLevel = useStore((s) => s.setEffortLevel)

  return (
    <div className="flex items-center gap-1">
      <Zap size={10} className="text-claude-text-tertiary mr-0.5" />
      {EFFORT_LEVELS.map((level) => (
        <button
          key={level.value}
          onClick={() => setEffortLevel(level.value)}
          title={level.desc}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
            effortLevel === level.value
              ? 'bg-claude-accent/12 text-claude-accent'
              : 'text-claude-text-tertiary hover:text-claude-text-secondary hover:bg-claude-surface-hover'
          }`}
        >
          {level.label}
        </button>
      ))}
    </div>
  )
}

// ── Live Thinking Block ──

function LiveThinkingBlock({ text }: { text: string }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="rounded-lg overflow-hidden border border-claude-accent/10 bg-claude-accent/4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-medium text-claude-accent/70"
      >
        <Brain size={10} className="animate-pulse" />
        <span>Thinking</span>
        <div className="flex gap-px ml-1">
          <span className="w-0.5 h-0.5 rounded-full animate-thinking-dot-1 bg-claude-accent" />
          <span className="w-0.5 h-0.5 rounded-full animate-thinking-dot-2 bg-claude-accent" />
          <span className="w-0.5 h-0.5 rounded-full animate-thinking-dot-3 bg-claude-accent" />
        </div>
        <span className="ml-auto">
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        </span>
      </button>
      {!collapsed && (
        <div className="px-2.5 pb-2 max-h-[180px] overflow-auto">
          <pre className="whitespace-pre-wrap text-claude-accent/35" style={{
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontSize: '11px',
            lineHeight: '1.5'
          }}>
            {text}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Live Tool Block ──

function LiveToolBlock({ tool }: { tool: ToolUseBlock }) {
  const colors = {
    running: { bg: 'bg-blue-400/4', border: 'border-blue-400/12', text: 'text-blue-400' },
    error: { bg: 'bg-[#D4564A]/4', border: 'border-[#D4564A]/12', text: 'text-[#D4564A]' },
    done: { bg: 'bg-[#4BA67C]/4', border: 'border-[#4BA67C]/12', text: 'text-[#4BA67C]' }
  }
  const c = colors[tool.status] || colors.done

  return (
    <div className={`rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 ${c.bg} border ${c.border}`}>
      {tool.status === 'running' ? (
        <Loader size={10} className={`animate-spin-slow ${c.text}`} />
      ) : tool.status === 'error' ? (
        <Terminal size={10} className={c.text} />
      ) : (
        <Wrench size={10} className={c.text} />
      )}
      <span className={`text-2xs font-mono font-medium ${c.text}`}>
        {tool.name}
      </span>
      {tool.input && (
        <span className="text-2xs truncate max-w-[160px] text-claude-text-tertiary">
          {tool.input.substring(0, 50)}
        </span>
      )}
    </div>
  )
}

// ── Message Bubble ──

function MessageBubble({ msg, chatId, msgIndex }: { msg: ChatMessage; chatId: string; msgIndex: number }) {
  const toggleThinking = useStore((s) => s.toggleThinking)

  if (msg.role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] px-2 py-0.5 rounded-full text-claude-text-tertiary bg-claude-surface">
          {msg.content}
        </span>
      </div>
    )
  }

  const isUser = msg.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[95%] space-y-1.5 ${isUser ? '' : 'w-full'}`}>
        {/* Thinking blocks */}
        {!isUser && msg.thinking && msg.thinking.map((t, ti) => (
          <div key={ti} className="rounded-lg overflow-hidden border border-claude-accent/10 bg-claude-accent/4">
            <button
              onClick={() => toggleThinking(chatId, msgIndex, ti)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium text-claude-accent/50"
            >
              <Brain size={9} />
              <span>Thinking</span>
              <span className="ml-auto">
                {t.collapsed ? <ChevronRight size={9} /> : <ChevronDown size={9} />}
              </span>
            </button>
            {!t.collapsed && (
              <div className="px-2.5 pb-2 max-h-[250px] overflow-auto">
                <pre className="whitespace-pre-wrap text-claude-accent/30" style={{
                  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                  fontSize: '11px',
                  lineHeight: '1.5'
                }}>
                  {t.text}
                </pre>
              </div>
            )}
          </div>
        ))}

        {/* Tool uses */}
        {!isUser && msg.toolUses && msg.toolUses.map((tool, ti) => (
          <div key={ti} className={`rounded-lg px-2.5 py-1 flex items-center gap-1.5 border
            ${tool.status === 'error'
              ? 'bg-[#D4564A]/4 border-[#D4564A]/12'
              : 'bg-[#4BA67C]/4 border-[#4BA67C]/12'
            }`}
          >
            <Wrench size={9} className={tool.status === 'error' ? 'text-[#D4564A]' : 'text-[#4BA67C]'} />
            <span className={`text-2xs font-mono ${tool.status === 'error' ? 'text-[#D4564A]' : 'text-[#4BA67C]'}`}>
              {tool.name}
            </span>
          </div>
        ))}

        {/* Main content */}
        {msg.content && (
          <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${isUser
            ? 'rounded-br-sm bg-claude-accent text-white'
            : 'rounded-bl-sm bg-claude-surface text-claude-text border border-claude-border-subtle'
          }`}>
            <pre className="whitespace-pre-wrap" style={{
              fontFamily: isUser ? "'Inter', system-ui, sans-serif" : "'JetBrains Mono', 'SF Mono', monospace",
              fontSize: isUser ? '13px' : '12px',
              lineHeight: '1.6'
            }}>
              {msg.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
