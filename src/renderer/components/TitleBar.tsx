import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  return (
    <div className="titlebar h-8 bg-claude-bg-tertiary flex items-center justify-between px-3 border-b border-claude-border-subtle select-none shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-[5px] bg-claude-accent/80 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="text-2xs font-medium text-claude-text-tertiary tracking-wide">LaTeX-Labs</span>
      </div>
      <div className="flex items-center">
        <button
          onClick={() => window.api.minimize()}
          className="w-7 h-6 flex items-center justify-center rounded hover:bg-claude-surface-hover transition-colors"
        >
          <Minus size={12} className="text-claude-text-tertiary" />
        </button>
        <button
          onClick={() => window.api.maximize()}
          className="w-7 h-6 flex items-center justify-center rounded hover:bg-claude-surface-hover transition-colors"
        >
          <Square size={9} className="text-claude-text-tertiary" />
        </button>
        <button
          onClick={() => window.api.close()}
          className="w-7 h-6 flex items-center justify-center rounded hover:bg-[#D4564A]/20 transition-colors group"
        >
          <X size={12} className="text-claude-text-tertiary group-hover:text-[#D4564A]" />
        </button>
      </div>
    </div>
  )
}
