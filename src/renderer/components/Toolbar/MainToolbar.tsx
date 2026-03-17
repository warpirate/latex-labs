import { Play, MessageSquare, Save, Home, Loader, Search, PenTool, Sigma, BookOpen } from 'lucide-react'
import { useStore } from '../../store'

interface Props {
  onToggleAI: () => void
  showAI: boolean
  onQuickAction?: (prompt: string) => void
}

export default function MainToolbar({ onToggleAI, showAI, onQuickAction }: Props) {
  const activeFile = useStore((s) => s.activeFile)
  const fileContent = useStore((s) => s.fileContent)
  const isDirty = useStore((s) => s.isDirty)
  const isCompiling = useStore((s) => s.isCompiling)
  const setCompiling = useStore((s) => s.setCompiling)
  const setCompileResult = useStore((s) => s.setCompileResult)
  const setView = useStore((s) => s.setView)
  const projectFormat = useStore((s) => s.projectFormat)

  async function handleSave() {
    if (!activeFile || !isDirty) return
    await window.api.writeFile(activeFile, fileContent)
    useStore.getState().setDirty(false)
  }

  async function handleCompile() {
    if (!activeFile || isCompiling) return
    await handleSave()
    setCompiling(true)
    try {
      const result = await window.api.compile(activeFile)
      setCompileResult(result.log, result.success ? result.pdfPath : null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Compilation failed'
      setCompileResult(message, null)
    }
  }

  function quickAction(prompt: string) {
    onQuickAction?.(prompt)
  }

  return (
    <div className="h-9 bg-claude-bg-secondary border-b border-claude-border-subtle flex items-center px-2.5 gap-1 shrink-0">
      {/* Home */}
      <button
        onClick={() => setView('landing')}
        className="p-1.5 rounded-md hover:bg-claude-surface-hover transition-colors"
        title="Back to home"
      >
        <Home size={14} className="text-claude-text-tertiary" />
      </button>

      <div className="w-px h-4 bg-claude-border-subtle mx-0.5" />

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={!isDirty}
        className="p-1.5 rounded-md hover:bg-claude-surface-hover transition-colors disabled:opacity-20"
        title="Save (Ctrl+S)"
      >
        <Save size={14} className={isDirty ? 'text-claude-accent' : 'text-claude-text-tertiary'} />
      </button>

      {/* Compile */}
      <button
        onClick={handleCompile}
        disabled={!activeFile || isCompiling}
        className="flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border border-claude-border
          bg-claude-surface hover:bg-claude-surface-hover
          text-claude-text text-xs font-medium transition-all duration-150 disabled:opacity-30"
      >
        {isCompiling ? (
          <Loader size={12} className="text-claude-accent animate-spin-slow" />
        ) : (
          <Play size={11} className="text-claude-text-secondary" fill="currentColor" />
        )}
        <span>{isCompiling ? 'Compiling' : 'Compile'}</span>
      </button>

      {/* Format badge */}
      <div className="px-2 py-0.5 rounded-md bg-claude-accent/8 text-claude-accent text-2xs font-medium">
        {projectFormat.toUpperCase()}
      </div>

      <div className="w-px h-4 bg-claude-border-subtle mx-0.5" />

      {/* Quick Actions */}
      <button
        onClick={() => quickAction('Search for relevant papers on the topic of my current document. Present the top results with title, authors, year, and citation count, then ask me which ones to add to references.bib.')}
        className="p-1.5 rounded-md hover:bg-claude-surface-hover transition-colors"
        title="Literature Search"
      >
        <Search size={13} className="text-claude-text-tertiary" />
      </button>
      <button
        onClick={() => quickAction('I need a diagram or figure for this paper. Ask me what kind (flowchart, architecture, plot, etc.), then generate TikZ code or a Python matplotlib script and save the output to figures/.')}
        className="p-1.5 rounded-md hover:bg-claude-surface-hover transition-colors"
        title="Create Diagram"
      >
        <PenTool size={13} className="text-claude-text-tertiary" />
      </button>
      <button
        onClick={() => quickAction('Help me write a LaTeX equation. Ask me what I want to express mathematically, then write the proper LaTeX code.')}
        className="p-1.5 rounded-md hover:bg-claude-surface-hover transition-colors"
        title="Equation Helper"
      >
        <Sigma size={13} className="text-claude-text-tertiary" />
      </button>
      <button
        onClick={() => quickAction('Scan my main.tex for all \\cite{} references, check references.bib for missing entries, search Semantic Scholar for any missing ones, and add the correct BibTeX. Report what was added.')}
        className="p-1.5 rounded-md hover:bg-claude-surface-hover transition-colors"
        title="Fix Bibliography"
      >
        <BookOpen size={13} className="text-claude-text-tertiary" />
      </button>

      <div className="flex-1" />

      {/* File name */}
      {activeFile && (
        <span className="text-2xs text-claude-text-tertiary mr-1.5 font-mono">
          {activeFile.split(/[/\\]/).pop()}
          {isDirty && <span className="text-claude-accent ml-1">●</span>}
        </span>
      )}

      {/* AI Toggle */}
      <button
        onClick={onToggleAI}
        className={`p-1.5 rounded-md transition-colors ${
          showAI ? 'bg-claude-accent/12 text-claude-accent' : 'hover:bg-claude-surface-hover text-claude-text-tertiary'
        }`}
        title="Toggle AI Assistant"
      >
        <MessageSquare size={14} />
      </button>
    </div>
  )
}
