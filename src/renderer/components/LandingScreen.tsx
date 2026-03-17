import { useEffect, useState } from 'react'
import { CheckCircle, Loader, FolderOpen, Plus, Clock, AlertCircle } from 'lucide-react'
import { useStore } from '../store'
import NewProjectModal from './Modals/NewProjectModal'

export default function LandingScreen() {
  const [status, setStatus] = useState<StatusResult | null>(null)
  const [checking, setChecking] = useState(true)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [showNewProject, setShowNewProject] = useState(false)
  const setProject = useStore((s) => s.setProject)

  useEffect(() => {
    runChecks()
    loadRecentProjects()
  }, [])

  async function runChecks() {
    setChecking(true)
    try {
      const result = await window.api.checkStatus()
      setStatus(result)
    } catch {
      setStatus({ claude: { ok: false, version: '', user: '' }, python: { ok: false, version: '' }, skills: { ok: false, count: 0 } })
    }
    setChecking(false)
  }

  async function loadRecentProjects() {
    const projects = await window.api.getRecentProjects()
    setRecentProjects(projects)
  }

  async function handleOpenFolder() {
    const path = await window.api.openFolder()
    if (path) {
      await window.api.addRecentProject(path)
      const config = await window.api.readProjectConfig(path)
      setProject(path, config?.format || 'ieee')
    }
  }

  async function handleOpenRecent(path: string) {
    await window.api.addRecentProject(path)
    await window.api.setActiveProject(path)
    const config = await window.api.readProjectConfig(path)
    setProject(path, config?.format || 'ieee')
  }

  const allReady = status?.claude.ok

  return (
    <div className="flex-1 flex items-center justify-center bg-claude-bg">
      <div className="w-[420px] flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-claude-accent to-claude-accent-light flex items-center justify-center glow-pulse shadow-lg shadow-claude-accent/8">
            <svg viewBox="0 0 48 48" className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M24 4L4 14l20 10 20-10L24 4z" />
              <path d="M4 34l20 10 20-10" />
              <path d="M4 24l20 10 20-10" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-claude-text tracking-tight">LaTeX-Labs</h1>
          <p className="text-2xs text-claude-text-tertiary">v1.0.0</p>
          <p className="text-xs text-claude-accent/70 font-medium">AI-powered academic writing workspace</p>
        </div>

        {/* Status Checks */}
        <div className="w-full bg-claude-surface/50 rounded-xl border border-claude-border-subtle p-4 space-y-3">
          <StatusRow
            checking={checking}
            ok={status?.claude.ok}
            label="Claude Code"
            detail={status?.claude.ok ? `${status.claude.version}${status.claude.user ? ` · "${status.claude.user}"` : ''}` : 'Not found'}
          />
          <StatusRow
            checking={checking}
            ok={status?.python.ok}
            label="Python"
            detail={status?.python.ok ? `v${status.python.version}` : 'Not found'}
          />
          <StatusRow
            checking={checking}
            ok={status?.skills.ok}
            label="Scientific Skills"
            detail={status?.skills.ok ? `${status.skills.count} skills` : 'None found'}
          />
        </div>

        {/* Action Buttons */}
        <div className="w-full flex gap-2.5">
          <button
            disabled={!allReady && !checking}
            onClick={() => setShowNewProject(true)}
            className="btn-secondary flex-1 justify-center"
          >
            <Plus size={15} />
            New Project
          </button>
          <button onClick={handleOpenFolder} className="btn-primary flex-1 justify-center">
            <FolderOpen size={15} />
            Open Document
          </button>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className="w-full">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={11} className="text-claude-text-tertiary" />
              <span className="text-xs font-medium text-claude-text-tertiary">Recent Projects</span>
            </div>
            <div className="space-y-0.5">
              {recentProjects.map((project) => (
                <button
                  key={project.path}
                  onClick={() => handleOpenRecent(project.path)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-claude-surface-hover transition-colors group"
                >
                  <div className="font-medium text-xs text-claude-text group-hover:text-claude-accent transition-colors">
                    {project.name}
                  </div>
                  <div className="text-2xs text-claude-text-tertiary mt-0.5 truncate">{project.path}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
    </div>
  )
}

function StatusRow({ checking, ok, label, detail }: { checking: boolean; ok?: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {checking ? (
        <Loader size={14} className="text-claude-accent animate-spin-slow shrink-0" />
      ) : ok ? (
        <CheckCircle size={14} className="text-claude-success shrink-0" />
      ) : (
        <AlertCircle size={14} className="text-claude-error shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-claude-text">{label}</span>
        {!checking && (
          <span className="text-2xs text-claude-text-secondary ml-2">{detail}</span>
        )}
      </div>
      {checking && <span className="text-2xs text-claude-text-tertiary">Checking...</span>}
    </div>
  )
}
