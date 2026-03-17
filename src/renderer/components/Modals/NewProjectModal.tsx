import { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { useStore } from '../../store'

const FORMAT_OPTIONS = [
  { id: 'ieee', name: 'IEEE', desc: 'Conference/journal paper — 2-column, numbered refs [1]', tag: 'Primary' },
  { id: 'apa', name: 'APA 7th', desc: 'Psychology/social science — single-column, author-date (Smith, 2024)', tag: 'Secondary' },
  { id: 'acm', name: 'ACM', desc: 'Computer science — 2-column, CCS concepts', tag: 'CS' }
]

export default function NewProjectModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState('ieee')
  const [location, setLocation] = useState('')
  const [creating, setCreating] = useState(false)
  const setProject = useStore((s) => s.setProject)

  async function handlePickLocation() {
    const path = await window.api.openFolder()
    if (path) setLocation(path)
  }

  async function handleCreate() {
    if (!name.trim() || !location) return
    setCreating(true)
    try {
      const projectPath = await window.api.createProject({ name: name.trim(), path: location, format })
      setProject(projectPath, format)
      onClose()
    } catch (err) {
      console.error('Failed to create project:', err)
    }
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-claude-bg-secondary border border-claude-border/50 rounded-xl w-[460px] shadow-2xl shadow-black/25"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-claude-border-subtle">
          <h2 className="text-sm font-semibold text-claude-text">New Project</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-claude-surface-hover transition-colors">
            <X size={14} className="text-claude-text-tertiary" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-claude-text">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-research-paper"
              className="w-full bg-claude-bg border border-claude-border/50 rounded-lg px-3 py-2 text-xs text-claude-text
                focus:outline-none focus:border-claude-accent/40 focus:ring-1 focus:ring-claude-accent/15
                placeholder:text-claude-text-tertiary transition-all"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-claude-text">Location</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={location}
                readOnly
                placeholder="Select a folder..."
                className="flex-1 bg-claude-bg border border-claude-border/50 rounded-lg px-3 py-2 text-xs
                  text-claude-text-secondary cursor-pointer placeholder:text-claude-text-tertiary"
                onClick={handlePickLocation}
              />
              <button onClick={handlePickLocation} className="btn-secondary px-2.5 py-2">
                <FolderOpen size={13} />
              </button>
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-claude-text">Citation Format</label>
            <div className="space-y-1.5">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFormat(opt.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                    format === opt.id
                      ? 'border-claude-accent/30 bg-claude-accent/6'
                      : 'border-claude-border-subtle hover:border-claude-text-tertiary/30 bg-claude-bg'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs text-claude-text">{opt.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-px rounded-full ${
                      format === opt.id
                        ? 'bg-claude-accent text-white'
                        : 'bg-claude-surface text-claude-text-tertiary'
                    }`}>
                      {opt.tag}
                    </span>
                  </div>
                  <p className="text-2xs text-claude-text-secondary mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-claude-border-subtle flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !location || creating}
            className="btn-primary"
          >
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
