import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../../store'
import { FileText, AlertTriangle, Terminal, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export default function PDFPreview() {
  const pdfPath = useStore((s) => s.pdfPath)
  const compileLog = useStore((s) => s.compileLog)
  const fileContent = useStore((s) => s.fileContent)
  const [showLog, setShowLog] = useState(false)
  const [zoom, setZoom] = useState(1.0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 4.0)), [])
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.25)), [])
  const resetZoom = useCallback(() => setZoom(1.0), [])

  const fitWidth = useCallback(() => {
    if (!pdfDoc || !containerRef.current) return
    pdfDoc.getPage(currentPage).then((page: pdfjsLib.PDFPageProxy) => {
      const viewport = page.getViewport({ scale: 1.0 })
      const containerWidth = containerRef.current!.clientWidth - 32 // padding
      const newScale = containerWidth / viewport.width
      setZoom(Math.round(newScale * 100) / 100)
    })
  }, [pdfDoc, currentPage])

  const prevPage = useCallback(() => setCurrentPage((p) => Math.max(p - 1, 1)), [])
  const nextPage = useCallback(() => setCurrentPage((p) => Math.min(p + 1, totalPages)), [])

  // Load PDF document when path changes
  useEffect(() => {
    if (!pdfPath) {
      setPdfDoc(null)
      return
    }

    let cancelled = false
    const loadTask = pdfjsLib.getDocument(`file://${pdfPath.replace(/\\/g, '/')}`)
    loadTask.promise.then((doc) => {
      if (cancelled) return
      setPdfDoc((prev) => {
        prev?.destroy()
        return doc
      })
      setTotalPages(doc.numPages)
      setCurrentPage(1)
    }).catch((err) => {
      if (!cancelled) console.error('PDF load error:', err)
    })

    return () => {
      cancelled = true
      loadTask.destroy()
    }
  }, [pdfPath])

  // Clean up PDF document on unmount
  useEffect(() => {
    return () => {
      pdfDoc?.destroy()
    }
  }, [])

  // Render current page — cancel previous render before starting new one
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return

    // Cancel any in-flight render
    renderTaskRef.current?.cancel()
    renderTaskRef.current = null

    let cancelled = false

    pdfDoc.getPage(currentPage).then((page: pdfjsLib.PDFPageProxy) => {
      if (cancelled) return

      const dpr = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: zoom * dpr })
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!

      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`

      const task = page.render({
        canvasContext: ctx,
        viewport
      })
      renderTaskRef.current = task

      task.promise.catch(() => {
        // Render was cancelled or failed — ignore
      })
    }).catch(() => {
      // Page fetch failed — ignore
    })

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
    }
  }, [pdfDoc, currentPage, zoom])

  if (showLog) {
    return (
      <div className="h-full flex flex-col bg-claude-bg">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-claude-border-subtle">
          <span className="text-2xs font-medium text-claude-text-tertiary">Compile Log</span>
          <button onClick={() => setShowLog(false)} className="text-2xs text-claude-accent hover:underline">
            Back to Preview
          </button>
        </div>
        <pre className="flex-1 overflow-auto p-3 text-2xs font-mono text-claude-text-secondary leading-relaxed">
          {compileLog || 'No compilation output yet.'}
        </pre>
      </div>
    )
  }

  // Live preview when no PDF
  if (!pdfPath) {
    return (
      <div className="h-full flex flex-col bg-claude-bg-preview">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-claude-border-subtle">
          <span className="text-2xs font-medium text-claude-text-tertiary">Live Preview</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLog(true)}
              className="text-2xs text-claude-text-tertiary hover:text-claude-text-secondary flex items-center gap-1"
            >
              <Terminal size={10} /> Log
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <LivePreviewContent content={fileContent} />
        </div>
      </div>
    )
  }

  // PDF view with canvas rendering
  return (
    <div className="h-full flex flex-col">
      {/* PDF Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-claude-border-subtle bg-claude-bg gap-1">
        {/* Page navigation */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-claude-surface text-claude-text-tertiary hover:text-claude-text-secondary disabled:opacity-20"
            title="Previous page"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-2xs text-claude-text-tertiary tabular-nums min-w-[60px] text-center">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-claude-surface text-claude-text-tertiary hover:text-claude-text-secondary disabled:opacity-20"
            title="Next page"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={zoomOut}
            className="p-1 rounded hover:bg-claude-surface text-claude-text-tertiary hover:text-claude-text-secondary"
            title="Zoom out"
          >
            <ZoomOut size={13} />
          </button>
          <span className="text-2xs text-claude-text-tertiary w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-1 rounded hover:bg-claude-surface text-claude-text-tertiary hover:text-claude-text-secondary"
            title="Zoom in"
          >
            <ZoomIn size={13} />
          </button>
          <button
            onClick={resetZoom}
            className="p-1 rounded hover:bg-claude-surface text-claude-text-tertiary hover:text-claude-text-secondary ml-0.5"
            title="Reset zoom"
          >
            <RotateCw size={11} />
          </button>
          <button
            onClick={fitWidth}
            className="p-1 rounded hover:bg-claude-surface text-claude-text-tertiary hover:text-claude-text-secondary"
            title="Fit width"
          >
            <Maximize2 size={11} />
          </button>
        </div>

        {/* Log toggle */}
        <button
          onClick={() => setShowLog(true)}
          className="text-2xs text-claude-text-tertiary hover:text-claude-accent flex items-center gap-1"
        >
          <Terminal size={10} /> Log
        </button>
      </div>

      {/* PDF Canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-claude-bg-canvas">
        <div className="flex justify-center p-4 min-h-full">
          <canvas
            ref={canvasRef}
            className="shadow-lg"
            style={{ background: '#fff' }}
          />
        </div>
      </div>
    </div>
  )
}

function LivePreviewContent({ content }: { content: string }) {
  const titleMatch = content.match(/\\title\{([^}]+)\}/)
  const authorMatch = content.match(/\\author\{([^}]*)\}/)
  const abstractMatch = content.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/)
  const sections: Array<{ level: string; title: string; content: string }> = []

  const sectionRegex = /\\(section|subsection)\{([^}]+)\}/g
  let match
  const allMatches: Array<{ level: string; title: string; index: number }> = []
  while ((match = sectionRegex.exec(content)) !== null) {
    allMatches.push({ level: match[1], title: match[2], index: match.index })
  }

  for (let i = 0; i < allMatches.length; i++) {
    const start = allMatches[i].index + allMatches[i].title.length + 10
    const end = i + 1 < allMatches.length ? allMatches[i + 1].index : content.length
    const sectionContent = content.substring(start, end)
      .replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, '')
      .replace(/[{}]/g, '')
      .trim()
      .substring(0, 500)
    sections.push({ level: allMatches[i].level, title: allMatches[i].title, content: sectionContent })
  }

  return (
    <div className="max-w-xl mx-auto text-claude-bg font-serif">
      {titleMatch && (
        <h1 className="text-xl font-bold text-center mb-1.5">{titleMatch[1]}</h1>
      )}
      {authorMatch && (
        <p className="text-xs text-claude-text-tertiary text-center mb-5">
          {authorMatch[1].replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, '').replace(/[{}\\]/g, '').trim()}
        </p>
      )}
      {abstractMatch && (
        <div className="mb-5 border-l-3 border-claude-accent/25 pl-3">
          <h3 className="text-xs font-bold text-claude-text-tertiary mb-0.5">Abstract</h3>
          <p className="text-xs text-claude-text-secondary leading-relaxed">
            {abstractMatch[1].replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, '').replace(/[{}]/g, '').trim()}
          </p>
        </div>
      )}
      {sections.map((s, i) => (
        <div key={i} className="mb-3">
          {s.level === 'section' ? (
            <h2 className="text-base font-bold mb-0.5">{s.title}</h2>
          ) : (
            <h3 className="text-sm font-semibold mb-0.5">{s.title}</h3>
          )}
          {s.content && <p className="text-xs text-claude-text-secondary leading-relaxed">{s.content}</p>}
        </div>
      ))}
      {!titleMatch && sections.length === 0 && (
        <p className="text-claude-text-tertiary text-center text-xs">Start writing to see a preview here</p>
      )}
    </div>
  )
}
