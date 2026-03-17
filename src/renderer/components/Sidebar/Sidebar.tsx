import { useEffect, useState, useRef, useCallback } from 'react'
import { Files, List, BookOpen, ChevronRight, ChevronDown, FilePlus, FolderPlus, Trash2, Pencil, Import, MoreHorizontal } from 'lucide-react'
import { useStore } from '../../store'

const TABS = [
  { id: 'files' as const, icon: Files, label: 'Files' },
  { id: 'outline' as const, icon: List, label: 'Outline' },
  { id: 'citations' as const, icon: BookOpen, label: 'Citations' }
]

export default function Sidebar({ onFileSelect }: { onFileSelect: (path: string) => void }) {
  const sidebarTab = useStore((s) => s.sidebarTab)
  const setSidebarTab = useStore((s) => s.setSidebarTab)

  return (
    <div className="h-full flex flex-col bg-claude-bg-secondary">
      {/* Tab bar */}
      <div className="flex border-b border-claude-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSidebarTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors
              ${sidebarTab === tab.id
                ? 'text-claude-accent border-b border-claude-accent'
                : 'text-claude-text-tertiary hover:text-claude-text-secondary'
              }`}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-1.5">
        {sidebarTab === 'files' && <FileTree onFileSelect={onFileSelect} />}
        {sidebarTab === 'outline' && <OutlineView />}
        {sidebarTab === 'citations' && <CitationsView />}
      </div>
    </div>
  )
}

// ── File Tree ──

function FileTree({ onFileSelect }: { onFileSelect: (path: string) => void }) {
  const projectPath = useStore((s) => s.projectPath)
  const activeFile = useStore((s) => s.activeFile)
  const fileTreeVersion = useStore((s) => s.fileTreeVersion)
  const bumpFileTree = useStore((s) => s.bumpFileTree)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry; parentPath: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creating, setCreating] = useState<{ parentPath: string; type: 'file' | 'folder' } | null>(null)
  const [createValue, setCreateValue] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const treeRef = useRef<HTMLDivElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (projectPath) {
      window.api.readDir(projectPath).then(setFiles)
    }
  }, [projectPath, fileTreeVersion])

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  // Focus create input when it appears
  useEffect(() => {
    if (creating) {
      // Small delay to ensure the input is mounted
      const timer = setTimeout(() => createInputRef.current?.focus(), 30)
      return () => clearTimeout(timer)
    }
  }, [creating])

  function toggleCollapse(path: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // ── Context menu actions ──

  function handleCreateFile(parentPath: string) {
    setContextMenu(null)
    // Expand parent folder so the input is visible
    setCollapsed(prev => { const next = new Set(prev); next.delete(parentPath); return next })
    // Use requestAnimationFrame to ensure DOM is settled before showing input
    setCreating(null)
    requestAnimationFrame(() => {
      setCreating({ parentPath, type: 'file' })
      setCreateValue('')
    })
  }

  function handleCreateFolder(parentPath: string) {
    setContextMenu(null)
    setCollapsed(prev => { const next = new Set(prev); next.delete(parentPath); return next })
    setCreating(null)
    requestAnimationFrame(() => {
      setCreating({ parentPath, type: 'folder' })
      setCreateValue('')
    })
  }

  async function handleDelete(entry: FileEntry) {
    setContextMenu(null)
    if (!confirm(`Delete "${entry.name}"${entry.isDirectory ? ' and all its contents' : ''}?`)) return
    try {
      await window.api.deleteFile(entry.path)
      bumpFileTree()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  function handleStartRename(entry: FileEntry) {
    setContextMenu(null)
    setRenaming(entry.path)
    setRenameValue(entry.name)
  }

  async function handleRenameSubmit(entry: FileEntry) {
    if (!renameValue.trim() || renameValue === entry.name) {
      setRenaming(null)
      return
    }
    const parentDir = entry.path.replace(/[/\\][^/\\]+$/, '')
    const sep = entry.path.includes('\\') ? '\\' : '/'
    const newPath = parentDir + sep + renameValue.trim()
    try {
      await window.api.renameFile(entry.path, newPath)
      bumpFileTree()
    } catch (err) {
      console.error('Rename failed:', err)
    }
    setRenaming(null)
  }

  async function handleCreateSubmit() {
    if (!creating) return
    if (!createValue.trim()) {
      setCreating(null)
      return
    }
    const sep = creating.parentPath.includes('\\') ? '\\' : '/'
    const newPath = creating.parentPath + sep + createValue.trim()
    try {
      if (creating.type === 'folder') {
        await window.api.createFolder(newPath)
      } else {
        await window.api.createFile(newPath)
      }
      bumpFileTree()
      // Auto-expand parent
      setCollapsed(prev => {
        const next = new Set(prev)
        next.delete(creating.parentPath)
        return next
      })
    } catch (err) {
      console.error('Create failed:', err)
    }
    setCreating(null)
  }

  async function handleImportFiles(targetDir: string) {
    setContextMenu(null)
    const filePaths = await window.api.openFileDialog()
    for (const src of filePaths) {
      await window.api.copyFileInto(src, targetDir)
    }
    if (filePaths.length > 0) bumpFileTree()
  }

  // ── Drag & Drop ──

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (!projectPath) return

    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = (file as File & { path: string }).path
      if (filePath) {
        await window.api.copyFileInto(filePath, projectPath)
      }
    }
    if (files.length > 0) bumpFileTree()
  }

  // ── File icon helper ──

  function getFileIcon(entry: FileEntry): string {
    if (entry.isDirectory) return ''
    const ext = entry.name.split('.').pop()?.toLowerCase()
    if (ext === 'tex' || ext === 'sty' || ext === 'cls') return '📄'
    if (ext === 'bib') return '📚'
    if (ext === 'pdf') return '📕'
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'svg') return '🖼️'
    if (ext === 'py') return '🐍'
    if (ext === 'md') return '📝'
    if (ext === 'csv' || ext === 'json' || ext === 'xml') return '📊'
    return '📎'
  }

  // ── Render tree entry ──

  function renderEntry(entry: FileEntry, depth: number = 0, parentPath: string = '') {
    const isActive = entry.path === activeFile
    const isCollapsed = collapsed.has(entry.path)
    const isRenaming = renaming === entry.path

    return (
      <div key={entry.path}>
        <div
          className={`group flex items-center h-[26px] cursor-pointer transition-colors relative
            ${isActive ? 'bg-claude-accent/10 text-claude-accent' : 'hover:bg-claude-surface-hover text-claude-text-secondary hover:text-claude-text'}
          `}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => {
            if (entry.isDirectory) toggleCollapse(entry.path)
            else onFileSelect(entry.path)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setContextMenu({ x: e.clientX, y: e.clientY, entry, parentPath: parentPath || projectPath || '' })
          }}
        >
          {/* Tree indent lines */}
          {depth > 0 && Array.from({ length: depth }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-claude-border-subtle/50"
              style={{ left: `${i * 16 + 12}px` }}
            />
          ))}

          {/* Chevron for folders */}
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            {entry.isDirectory ? (
              isCollapsed
                ? <ChevronRight size={12} className="text-claude-text-tertiary" />
                : <ChevronDown size={12} className="text-claude-text-tertiary" />
            ) : null}
          </span>

          {/* Icon */}
          <span className="text-xs mr-1.5 shrink-0 leading-none">
            {entry.isDirectory
              ? (isCollapsed ? '📁' : '📂')
              : getFileIcon(entry)
            }
          </span>

          {/* Name or rename input */}
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(entry)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit(entry)
                if (e.key === 'Escape') setRenaming(null)
              }}
              className="flex-1 min-w-0 bg-claude-bg border border-claude-accent/40 rounded px-1 py-0 text-xs text-claude-text outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate text-xs">{entry.name}</span>
          )}

          {/* Hover action: more button */}
          {!isRenaming && (
            <button
              className="ml-auto mr-1 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-claude-surface transition-all"
              onClick={(e) => {
                e.stopPropagation()
                setContextMenu({ x: e.clientX, y: e.clientY, entry, parentPath: parentPath || projectPath || '' })
              }}
            >
              <MoreHorizontal size={12} />
            </button>
          )}
        </div>

        {/* Children */}
        {entry.isDirectory && !isCollapsed && (
          <>
            {/* Inline create input */}
            {creating && creating.parentPath === entry.path && (
              <div className="flex items-center h-[26px]" style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}>
                <span className="w-4 h-4 shrink-0" />
                <span className="text-xs mr-1.5">{creating.type === 'folder' ? '📁' : '📄'}</span>
                <input
                  ref={createInputRef}
                  autoFocus
                  value={createValue}
                  onChange={(e) => setCreateValue(e.target.value)}
                  onBlur={handleCreateSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSubmit()
                    if (e.key === 'Escape') setCreating(null)
                  }}
                  placeholder={creating.type === 'folder' ? 'folder name' : 'filename.tex'}
                  className="flex-1 min-w-0 bg-claude-bg border border-claude-accent/40 rounded px-1 py-0 text-xs text-claude-text outline-none placeholder:text-claude-text-tertiary"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            {entry.children?.map((child) => renderEntry(child, depth + 1, entry.path))}
          </>
        )}
      </div>
    )
  }

  return (
    <div
      ref={treeRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`min-h-full ${dragOver ? 'bg-claude-accent/5 ring-1 ring-claude-accent/20 ring-inset rounded' : ''}`}
    >
      {/* Root-level toolbar */}
      <div className="flex items-center justify-end gap-0.5 px-1 py-1 border-b border-claude-border-subtle/50">
        <button
          onClick={() => projectPath && handleCreateFile(projectPath)}
          className="p-1 rounded hover:bg-claude-surface-hover text-claude-text-tertiary hover:text-claude-text-secondary transition-colors"
          title="New File"
        >
          <FilePlus size={13} />
        </button>
        <button
          onClick={() => projectPath && handleCreateFolder(projectPath)}
          className="p-1 rounded hover:bg-claude-surface-hover text-claude-text-tertiary hover:text-claude-text-secondary transition-colors"
          title="New Folder"
        >
          <FolderPlus size={13} />
        </button>
        <button
          onClick={() => projectPath && handleImportFiles(projectPath)}
          className="p-1 rounded hover:bg-claude-surface-hover text-claude-text-tertiary hover:text-claude-text-secondary transition-colors"
          title="Import Files"
        >
          <Import size={13} />
        </button>
      </div>

      {/* Inline create at root */}
      {creating && creating.parentPath === projectPath && (
        <div className="flex items-center h-[26px] px-1">
          <span className="w-4 h-4 shrink-0" />
          <span className="text-xs mr-1.5">{creating.type === 'folder' ? '📁' : '📄'}</span>
          <input
            ref={createInputRef}
            autoFocus
            value={createValue}
            onChange={(e) => setCreateValue(e.target.value)}
            onBlur={handleCreateSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSubmit()
              if (e.key === 'Escape') setCreating(null)
            }}
            placeholder={creating.type === 'folder' ? 'folder name' : 'filename.tex'}
            className="flex-1 min-w-0 bg-claude-bg border border-claude-accent/40 rounded px-1 py-0 text-xs text-claude-text outline-none placeholder:text-claude-text-tertiary"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {files.map((f) => renderEntry(f, 0, projectPath || ''))}

      {files.length === 0 && (
        <p className="text-xs text-claude-text-tertiary p-3 text-center">No files yet</p>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          parentPath={contextMenu.parentPath}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onRename={handleStartRename}
          onDelete={handleDelete}
          onImport={handleImportFiles}
        />
      )}

      {/* Drop overlay hint */}
      {dragOver && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <p className="text-xs text-claude-accent font-medium bg-claude-bg/80 px-3 py-1.5 rounded-lg">
            Drop files to import
          </p>
        </div>
      )}
    </div>
  )
}

// ── Context Menu ──

function ContextMenu({ x, y, entry, parentPath, onCreateFile, onCreateFolder, onRename, onDelete, onImport }: {
  x: number; y: number; entry: FileEntry; parentPath: string
  onCreateFile: (dir: string) => void
  onCreateFolder: (dir: string) => void
  onRename: (entry: FileEntry) => void
  onDelete: (entry: FileEntry) => void
  onImport: (dir: string) => void
}) {
  const dir = entry.isDirectory ? entry.path : parentPath

  return (
    <div
      className="fixed z-50 bg-claude-bg-secondary border border-claude-border rounded-lg shadow-xl shadow-black/20 py-1 min-w-[160px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {entry.isDirectory && (
        <>
          <CtxItem icon={<FilePlus size={13} />} label="New File" onClick={() => onCreateFile(dir)} />
          <CtxItem icon={<FolderPlus size={13} />} label="New Folder" onClick={() => onCreateFolder(dir)} />
          <CtxItem icon={<Import size={13} />} label="Import Files..." onClick={() => onImport(dir)} />
          <div className="h-px bg-claude-border-subtle mx-2 my-1" />
        </>
      )}
      <CtxItem icon={<Pencil size={13} />} label="Rename" onClick={() => onRename(entry)} />
      <CtxItem icon={<Trash2 size={13} />} label="Delete" danger onClick={() => onDelete(entry)} />
    </div>
  )
}

function CtxItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
        danger
          ? 'text-claude-error hover:bg-claude-error/10'
          : 'text-claude-text-secondary hover:bg-claude-surface-hover hover:text-claude-text'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Outline View ──

function OutlineView() {
  const fileContent = useStore((s) => s.fileContent)

  const sections = fileContent
    .split('\n')
    .map((line, i) => {
      const match = line.match(/\\(section|subsection|subsubsection)\{(.+?)\}/)
      if (match) return { level: match[1], title: match[2], line: i }
      return null
    })
    .filter(Boolean) as Array<{ level: string; title: string; line: number }>

  if (sections.length === 0) {
    return <p className="text-xs text-claude-text-tertiary p-3">No sections found</p>
  }

  const indent: Record<string, number> = { section: 0, subsection: 1, subsubsection: 2 }

  return (
    <div className="space-y-px">
      {sections.map((s, i) => (
        <button
          key={i}
          className="w-full text-left px-3 py-1.5 rounded-md text-xs text-claude-text-secondary hover:text-claude-text hover:bg-claude-surface-hover transition-colors"
          style={{ paddingLeft: `${(indent[s.level] || 0) * 16 + 8}px` }}
        >
          {s.title}
        </button>
      ))}
    </div>
  )
}

// ── Citations View ──

function CitationsView() {
  const fileContent = useStore((s) => s.fileContent)

  const cites = new Set<string>()
  const regex = /\\cite\{([^}]+)\}/g
  let match
  while ((match = regex.exec(fileContent)) !== null) {
    match[1].split(',').forEach((key) => cites.add(key.trim()))
  }

  const citeList = Array.from(cites)

  return (
    <div className="space-y-0.5">
      <p className="text-xs text-claude-text-tertiary px-2 mb-2">{citeList.length} citation(s) found</p>
      {citeList.map((key) => (
        <div key={key} className="px-3 py-1.5 rounded-md text-xs text-claude-text-secondary hover:bg-claude-surface-hover transition-colors">
          <span className="text-claude-accent font-mono text-2xs">{key}</span>
        </div>
      ))}
      {citeList.length === 0 && (
        <p className="text-xs text-claude-text-tertiary/60 px-2">Use \cite&#123;key&#125; to add citations</p>
      )}
    </div>
  )
}
