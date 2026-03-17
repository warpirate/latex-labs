import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '../store'
import Sidebar from './Sidebar/Sidebar'
import LaTeXEditor from './Editor/LaTeXEditor'
import PDFPreview from './Preview/PDFPreview'
import Toolbar from './Toolbar/MainToolbar'
import AIChatPanel from './Sidebar/AIChat'

function useResizable(initial: number, min: number, max: number, direction: 'left' | 'right' = 'right') {
  const [size, setSize] = useState(initial)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startSize = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startSize.current = size
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = direction === 'right'
        ? ev.clientX - startX.current
        : startX.current - ev.clientX
      setSize(Math.max(min, Math.min(max, startSize.current + delta)))
    }

    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [size, min, max, direction])

  return { size, onMouseDown }
}

/** Fraction-based resizer: tracks a 0-1 ratio within a container */
function useFractionResize(initialFraction: number, minFraction: number, maxFraction: number) {
  const [fraction, setFraction] = useState(initialFraction)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const newFraction = Math.max(minFraction, Math.min(maxFraction, x / rect.width))
      setFraction(newFraction)
    }

    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [minFraction, maxFraction])

  return { fraction, containerRef, onMouseDown }
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-[3px] shrink-0 cursor-col-resize relative group"
    >
      <div className="absolute inset-0 -left-1 -right-1 z-10" />
      <div className="h-full w-px mx-auto bg-claude-border-subtle group-hover:bg-claude-accent/40 group-active:bg-claude-accent/60 transition-colors" />
    </div>
  )
}

export default function Workspace() {
  const projectPath = useStore((s) => s.projectPath)
  const activeFile = useStore((s) => s.activeFile)
  const setActiveFile = useStore((s) => s.setActiveFile)
  const setFileContent = useStore((s) => s.setFileContent)
  const [showAI, setShowAI] = useState(false)

  const sidebar = useResizable(240, 160, 400)
  const editorPreview = useFractionResize(0.5, 0.2, 0.8)
  const aiPanel = useResizable(340, 260, 500, 'left')

  // Auto-open main.tex when project loads and no file is active
  useEffect(() => {
    if (projectPath && !activeFile) {
      const sep = projectPath.includes('\\') ? '\\' : '/'
      const mainTex = projectPath + sep + 'main.tex'
      loadFile(mainTex)
    }
  }, [projectPath, activeFile])

  async function loadFile(path: string) {
    try {
      const content = await window.api.readFile(path)
      setActiveFile(path)
      setFileContent(content)
    } catch (err) {
      console.error('Failed to load file:', err)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-claude-bg">
      <Toolbar
        onToggleAI={() => setShowAI(!showAI)}
        showAI={showAI}
        onQuickAction={(prompt) => {
          if (!showAI) setShowAI(true)
          useStore.getState().setPendingQuickAction(prompt)
        }}
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <div className="shrink-0 overflow-hidden" style={{ width: sidebar.size }}>
          <Sidebar onFileSelect={loadFile} />
        </div>
        <ResizeHandle onMouseDown={sidebar.onMouseDown} />

        {/* Editor + Preview */}
        <div ref={editorPreview.containerRef} className="flex-1 flex overflow-hidden">
          <div className="overflow-hidden shrink-0" style={{ width: `${editorPreview.fraction * 100}%` }}>
            <LaTeXEditor />
          </div>
          <ResizeHandle onMouseDown={editorPreview.onMouseDown} />
          <div className="flex-1 overflow-hidden min-w-0">
            <PDFPreview />
          </div>
        </div>

        {/* AI Chat panel */}
        {showAI && (
          <>
            <ResizeHandle onMouseDown={aiPanel.onMouseDown} />
            <div className="shrink-0 overflow-hidden" style={{ width: aiPanel.size }}>
              <AIChatPanel />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
