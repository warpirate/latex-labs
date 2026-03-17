import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, resolve, sep } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, renameSync, rmSync, copyFileSync } from 'fs'
import { execSync, spawn, ChildProcess } from 'child_process'
import { homedir } from 'os'
import { createInterface } from 'readline'

let mainWindow: BrowserWindow | null = null

// ── Active project path (for path validation) ──
let currentProjectPath: string | null = null

// ── Active Claude processes (keyed by chatId) ──
const activeProcesses = new Map<string, ChildProcess>()

// ── Path validation: ensure target is within the active project ──
function isPathWithinProject(targetPath: string): boolean {
  if (!currentProjectPath) return false
  const resolved = resolve(targetPath)
  const projectRoot = resolve(currentProjectPath)
  return resolved === projectRoot || resolved.startsWith(projectRoot + sep)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#2B2A27',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  killAllClaudeProcesses()
  app.quit()
})

app.on('before-quit', () => {
  killAllClaudeProcesses()
})

// ── IPC Handlers ──

function registerIpcHandlers(): void {
  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())

  // Status checks
  ipcMain.handle('status:check', async () => {
    return {
      claude: checkClaudeCLI(),
      python: checkPython(),
      skills: countSkills()
    }
  })

  // File operations
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    const folderPath = result.filePaths[0]
    currentProjectPath = folderPath
    return folderPath
  })

  ipcMain.handle('project:create', async (_e, opts: { name: string; path: string; format: string }) => {
    const projectDir = createProject(opts)
    currentProjectPath = projectDir
    return projectDir
  })

  ipcMain.handle('project:readDir', async (_e, dirPath: string) => {
    if (!isPathWithinProject(dirPath)) return []
    return readDirectory(dirPath)
  })

  ipcMain.handle('file:read', async (_e, filePath: string) => {
    if (!isPathWithinProject(filePath)) return ''
    if (!existsSync(filePath)) return ''
    return readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle('file:write', async (_e, filePath: string, content: string) => {
    if (!isPathWithinProject(filePath)) throw new Error('Path outside project')
    writeFileSync(filePath, content, 'utf-8')
    return true
  })

  // Recent projects
  ipcMain.handle('projects:recent', async () => {
    return getRecentProjects()
  })

  ipcMain.handle('projects:addRecent', async (_e, projectPath: string) => {
    addRecentProject(projectPath)
  })

  // Set the active project (used when opening recent projects)
  ipcMain.handle('project:setActive', async (_e, projectPath: string) => {
    currentProjectPath = projectPath
  })

  // Read project config (format, etc.)
  ipcMain.handle('project:readConfig', async (_e, projectPath: string) => {
    const configPath = join(projectPath, '.latexlabs', 'config.json')
    try {
      if (!existsSync(configPath)) return null
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      return null
    }
  })

  // Claude CLI — streaming
  ipcMain.handle('claude:execute', async (_e, opts: {
    chatId: string; prompt: string; cwd: string;
    sessionId?: string; model?: string; effortLevel?: string
  }) => {
    return startClaudeStream(opts)
  })

  ipcMain.handle('claude:cancel', async (_e, chatId: string) => {
    killClaudeProcess(chatId)
  })

  // Legacy non-streaming (kept for simple one-shot calls)
  ipcMain.handle('claude:run', async (_e, prompt: string, cwd?: string) => {
    return runClaude(prompt, cwd)
  })

  // Tectonic compile
  ipcMain.handle('tectonic:compile', async (_e, texPath: string) => {
    return compileTex(texPath)
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    shell.openExternal(url)
  })

  // File management (all operations validated against project boundary)
  ipcMain.handle('file:createFile', async (_e, filePath: string) => {
    if (!isPathWithinProject(filePath)) throw new Error('Path outside project')
    writeFileSync(filePath, '', 'utf-8')
    return true
  })

  ipcMain.handle('file:createFolder', async (_e, folderPath: string) => {
    if (!isPathWithinProject(folderPath)) throw new Error('Path outside project')
    mkdirSync(folderPath, { recursive: true })
    return true
  })

  ipcMain.handle('file:rename', async (_e, oldPath: string, newPath: string) => {
    if (!isPathWithinProject(oldPath) || !isPathWithinProject(newPath)) throw new Error('Path outside project')
    renameSync(oldPath, newPath)
    return true
  })

  ipcMain.handle('file:delete', async (_e, targetPath: string) => {
    if (!isPathWithinProject(targetPath)) throw new Error('Path outside project')
    const isDir = existsSync(targetPath) && statSync(targetPath).isDirectory()
    if (isDir && mainWindow) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        title: 'Confirm Delete',
        message: `Delete folder "${targetPath.split(/[/\\]/).pop()}" and all its contents?`
      })
      if (response !== 0) return false
    }
    rmSync(targetPath, { recursive: true })
    return true
  })

  ipcMain.handle('file:copyInto', async (_e, srcPath: string, destDir: string) => {
    if (!isPathWithinProject(destDir)) throw new Error('Path outside project')
    const name = srcPath.replace(/.*[/\\]/, '')
    copyFileSync(srcPath, join(destDir, name))
    return join(destDir, name)
  })

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths
  })
}

// ── Status Checks ──

function checkClaudeCLI(): { ok: boolean; version: string; user: string } {
  try {
    const version = execSync('claude --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim()
    let user = ''
    try {
      const whoami = execSync('claude config get user 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim()
      user = whoami
    } catch { /* ignore */ }
    return { ok: true, version, user }
  } catch {
    return { ok: false, version: '', user: '' }
  }
}

function checkPython(): { ok: boolean; version: string } {
  try {
    const version = execSync('python --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim()
    return { ok: true, version: version.replace('Python ', '') }
  } catch {
    return { ok: false, version: '' }
  }
}

function countSkills(): { ok: boolean; count: number } {
  const skillsDir = join(homedir(), '.claude', 'skills')
  try {
    if (!existsSync(skillsDir)) return { ok: false, count: 0 }
    const dirs = readdirSync(skillsDir).filter(f => {
      const full = join(skillsDir, f)
      return statSync(full).isDirectory()
    })
    return { ok: dirs.length > 0, count: dirs.length }
  } catch {
    return { ok: false, count: 0 }
  }
}

// ── Project Management ──

function getRecentProjects(): Array<{ name: string; path: string; lastOpened: string }> {
  const configPath = join(app.getPath('userData'), 'recent-projects.json')
  try {
    if (!existsSync(configPath)) return []
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return []
  }
}

function addRecentProject(projectPath: string): void {
  const configPath = join(app.getPath('userData'), 'recent-projects.json')
  let projects = getRecentProjects()
  projects = projects.filter(p => p.path !== projectPath)
  const name = projectPath.split(/[/\\]/).pop() || projectPath
  projects.unshift({ name, path: projectPath, lastOpened: new Date().toISOString() })
  projects = projects.slice(0, 10) // keep 10 max
  mkdirSync(join(app.getPath('userData')), { recursive: true })
  writeFileSync(configPath, JSON.stringify(projects, null, 2))
}

function createProject(opts: { name: string; path: string; format: string }): string {
  const projectDir = join(opts.path, opts.name)
  mkdirSync(projectDir, { recursive: true })
  mkdirSync(join(projectDir, 'figures'), { recursive: true })
  mkdirSync(join(projectDir, 'attachments'), { recursive: true })
  mkdirSync(join(projectDir, '.latexlabs'), { recursive: true })

  // Write project config
  writeFileSync(join(projectDir, '.latexlabs', 'config.json'), JSON.stringify({ format: opts.format }, null, 2))

  // Write main.tex from template
  const template = getTemplate(opts.format)
  writeFileSync(join(projectDir, 'main.tex'), template)
  writeFileSync(join(projectDir, 'references.bib'), getDefaultBib())
  writeFileSync(join(projectDir, 'CLAUDE.md'), generateClaudeMd(opts.format))

  addRecentProject(projectDir)
  return projectDir
}

function getTemplate(format: string): string {
  const templates: Record<string, string> = {
    ieee: `\\documentclass[conference]{IEEEtran}
\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}

\\begin{document}

\\title{Your Paper Title Here}
\\author{\\IEEEauthorblockN{Author Name}
\\IEEEauthorblockA{\\textit{Department} \\\\
\\textit{University Name}\\\\
City, Country \\\\
email@example.com}}

\\maketitle

\\begin{abstract}
Your abstract text goes here. This should be a concise summary of the paper's contributions, typically 150-250 words.
\\end{abstract}

\\begin{IEEEkeywords}
keyword1, keyword2, keyword3
\\end{IEEEkeywords}

\\section{Introduction}
Your introduction goes here.

\\section{Related Work}
Discuss related work here.

\\section{Methodology}
Describe your approach here.

\\section{Results}
Present your results here.

\\section{Discussion}
Discuss the implications of your results.

\\section{Conclusion}
Summarize your findings and contributions.

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`,
    apa: `\\documentclass[man,12pt]{apa7}
\\usepackage[american]{babel}
\\usepackage{csquotes}
\\usepackage[natbibapa]{apacite}
\\usepackage{graphicx}

\\title{Your Paper Title Here}
\\shorttitle{Short Title}
\\author{Author Name}
\\affiliation{University Name}

\\abstract{Your abstract text goes here. APA abstracts should be between 150-250 words. It should provide a brief, comprehensive summary of the contents of the paper.}
\\keywords{keyword1, keyword2, keyword3}

\\begin{document}
\\maketitle

\\section{Introduction}
Your introduction goes here.

\\section{Method}
\\subsection{Participants}
Describe participants here.

\\subsection{Materials}
Describe materials here.

\\subsection{Procedure}
Describe procedures here.

\\section{Results}
Present your results here.

\\section{Discussion}
Discuss the implications of your results.

\\bibliographystyle{apacite}
\\bibliography{references}

\\end{document}
`,
    acm: `\\documentclass[sigconf,screen]{acmart}
\\usepackage{graphicx}
\\usepackage{booktabs}

\\begin{document}

\\title{Your Paper Title Here}

\\author{Author Name}
\\email{email@example.com}
\\affiliation{%
  \\institution{University Name}
  \\city{City}
  \\country{Country}
}

\\begin{abstract}
Your abstract text goes here. Provide a concise summary of your work.
\\end{abstract}

\\begin{CCSXML}
<ccs2012>
<concept>
<concept_id>10003752</concept_id>
<concept_desc>Theory of computation</concept_desc>
<concept_significance>500</concept_significance>
</concept>
</ccs2012>
\\end{CCSXML}

\\ccsdesc[500]{Theory of computation}

\\keywords{keyword1, keyword2, keyword3}

\\maketitle

\\section{Introduction}
Your introduction goes here.

\\section{Related Work}
Discuss related work here.

\\section{Approach}
Describe your approach here.

\\section{Evaluation}
Present your evaluation here.

\\section{Conclusion}
Summarize your findings.

\\begin{acks}
Acknowledgments go here.
\\end{acks}

\\bibliographystyle{ACM-Reference-Format}
\\bibliography{references}

\\end{document}
`
  }
  return templates[format] || templates.ieee
}

function getDefaultBib(): string {
  return `% Bibliography file for LaTeX-Labs project
% Add your references here in BibTeX format

@article{example2024,
  author  = {Author, Example},
  title   = {An Example Reference},
  journal = {Journal of Examples},
  year    = {2024},
  volume  = {1},
  number  = {1},
  pages   = {1--10}
}
`
}

function generateClaudeMd(format: string): string {
  return `# LaTeX-Labs Project

Academic writing workspace powered by LaTeX-Labs. You are an AI research assistant with full file access.

## Environment

- **LaTeX Engine**: Tectonic (auto-installs packages and fonts on \\usepackage{})
- **Python**: Available. Use for data visualization (matplotlib, seaborn), computation, and data processing. Save outputs to figures/.
- **Format**: ${format.toUpperCase()}
- **Build**: Auto-compiled by LaTeX-Labs when user clicks Compile

## Project Structure

\`\`\`
.
├── main.tex              # Primary document
├── references.bib        # Bibliography (BibTeX format)
├── figures/              # Generated figures, diagrams, plots
├── attachments/          # Reference PDFs, raw data, images
└── .latexlabs/           # App config (do not modify)
\`\`\`

## Capabilities

### Writing & Revision
- Write, expand, condense, or restructure any section
- Maintain academic tone consistent with the format
- Fix grammar, improve clarity, strengthen arguments

### Literature Search
- Query Semantic Scholar API: \`curl -s "https://api.semanticscholar.org/graph/v1/paper/search?query=QUERY&limit=10&fields=title,authors,year,abstract,citationCount,url,externalIds"\`
- Query arXiv API: \`curl -s "http://export.arxiv.org/api/query?search_query=all:QUERY&max_results=10"\`
- Add BibTeX entries to references.bib and \\cite{} in the document

### Diagrams & Figures
- Create TikZ diagrams (flowcharts, architectures, state machines, neural networks)
- Generate matplotlib/seaborn plots via Python scripts
- Use PGFplots for data-driven charts
- Save all outputs to figures/ and reference with \\includegraphics{figures/name}
- Wrap in proper figure environment with \\caption and \\label

### Equations
- Write LaTeX equations using align, equation, gather, cases environments
- Verify mathematical notation
- Convert plain descriptions to LaTeX math

### Bibliography Management
- Scan \\cite{} refs and ensure all have .bib entries
- Search Semantic Scholar for missing references
- Format BibTeX entries consistently

## Format: ${format.toUpperCase()}

${format === 'ieee' ? `- Two-column layout, 10pt font (IEEEtran class)
- Figures: [t] or [b] float, span columns with figure*
- Captions below: "Fig. 1. Description"
- References: numbered [1], sorted by appearance
- Citations: \\cite{key}, \\bibliographystyle{IEEEtran}` : ''}${format === 'apa' ? `- Single-column, 12pt, double-spaced (apa7 class)
- Figures placed after first mention
- Captions: "Figure 1\\n*Description in italics*"
- References: author-date \\citep{key}, alphabetical
- Uses apacite package with natbibapa option` : ''}${format === 'acm' ? `- Two-column layout, 9pt font (acmart sigconf)
- Figures: [t] preferred
- Captions: "Figure 1: Description"
- Include CCS concepts XML block and keywords
- References: numbered [1], \\bibliographystyle{ACM-Reference-Format}` : ''}

## Rules
- Make incremental edits via the Edit tool. Never rewrite entire files.
- Plan before editing. State what you'll change and why.
- When generating figures, create the file first, then add the \\includegraphics reference.
- Preserve existing document structure and formatting conventions.
`
}

// ── File System ──
// Note: FileEntry is also declared in src/renderer/env.d.ts — keep in sync

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

function readDirectory(dirPath: string): FileEntry[] {
  try {
    const entries = readdirSync(dirPath)
    return entries
      .filter(name => !name.startsWith('.') && name !== 'node_modules' && name !== '.venv')
      .map(name => {
        const fullPath = join(dirPath, name)
        const isDir = statSync(fullPath).isDirectory()
        return {
          name,
          path: fullPath,
          isDirectory: isDir,
          children: isDir ? readDirectory(fullPath) : undefined
        }
      })
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return []
  }
}

// ── Claude CLI ──

// Strip ANSI escape codes from Claude output
function stripAnsi(str: string): string {
  if (!str.includes('\x1b')) return str
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
}

// Clean env vars — whitelist only what's needed to prevent leaking secrets
const ENV_WHITELIST = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LC_ALL', 'LANGUAGE', 'TERM',
  'SystemRoot', 'SYSTEMROOT', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'HOMEDRIVE', 'HOMEPATH', 'COMSPEC', 'OS', 'NUMBER_OF_PROCESSORS',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'SHELL',
  'ANTHROPIC_API_KEY' // needed for Claude CLI
])

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, val] of Object.entries(process.env)) {
    if (val === undefined) continue
    if (!ENV_WHITELIST.has(key)) continue
    env[key] = val
  }
  return env
}

// Kill a running Claude process by chatId
function killClaudeProcess(chatId: string): void {
  const proc = activeProcesses.get(chatId)
  if (proc && !proc.killed) {
    proc.kill('SIGTERM')
    setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL') }, 3000)
  }
  activeProcesses.delete(chatId)
}

// Kill all Claude processes (on app quit)
function killAllClaudeProcesses(): void {
  for (const [, proc] of activeProcesses) {
    if (!proc.killed) proc.kill('SIGTERM')
  }
  activeProcesses.clear()
}

// ── System Prompt ──

const SYSTEM_PROMPT = `You are an expert AI research assistant embedded in LaTeX-Labs, a desktop academic writing workspace. You have full file system access to the user's project.

## Writing Process

Use a two-stage process for writing manuscript sections:
1. **Outline**: Create section outlines with key points, using research-lookup to gather evidence
2. **Prose**: Convert outlines into flowing academic prose with smooth transitions and integrated citations

CRITICAL: Always write in full paragraphs with flowing prose. Never leave bullet points in the final manuscript. Academic papers demand connected, well-structured paragraphs.

## Manuscript Structure (IMRAD)

Follow the appropriate structure for the paper type:
- **Research papers**: Introduction, Methods, Results, Discussion (IMRAD)
- **Reviews**: Introduction, Search Strategy, Thematic Sections, Discussion
- **Case reports**: Introduction, Case Presentation, Discussion
- **Meta-analyses**: PRISMA flow, Forest plots, Heterogeneity analysis

### Section Guidelines
- **Abstract**: 150-250 words, structured (Background/Methods/Results/Conclusion)
- **Introduction**: Establish context → identify gap → state objective. Funnel from broad to specific.
- **Methods**: Ensure full reproducibility. Include study design, participants, procedures, analysis.
- **Results**: Present findings objectively. Lead with most important findings. Use tables/figures.
- **Discussion**: Summarize key findings → compare with literature → acknowledge limitations → state implications.

## Core Capabilities

### 1. Literature Search & Citations
When asked to find papers, search literature, or add references:
- Use the Bash tool to query Semantic Scholar API: curl -s "https://api.semanticscholar.org/graph/v1/paper/search?query=QUERY&limit=10&fields=title,authors,year,abstract,citationCount,url,externalIds"
- For arXiv: curl -s "http://export.arxiv.org/api/query?search_query=all:QUERY&max_results=10"
- Present results with title, authors, year, citation count
- When the user picks papers, add proper BibTeX entries to references.bib
- Auto-generate \\cite{key} in the appropriate location. Prefer primary sources. Verify citations.

### 2. Diagram & Figure Creation
Every good paper should include figures. When asked to create diagrams/figures/visualizations:
- Generate TikZ/PGFplots code directly in the .tex file or as a separate file in figures/
- For data plots, write a Python script using matplotlib/seaborn and save to figures/ as PDF/PNG
- Common types: flowcharts, block diagrams, architectures, neural networks, state machines, timelines, methodology diagrams, pathway illustrations
- Always wrap in figure environment with \\caption and \\label
- Design for clarity: self-explanatory, high contrast, readable at print size

### 3. Equation Assistance
- Write, debug, and refactor LaTeX equations
- Convert plain-text math descriptions to proper LaTeX
- Use align, equation, gather, cases environments as appropriate

### 4. Bibliography Management
- Parse existing \\cite{} references and ensure all have matching .bib entries
- Auto-format BibTeX entries consistently. Add DOI links when available.
- Detect and fix missing or malformed citations

### 5. Reporting Guidelines
Apply the appropriate guideline when relevant:
- **CONSORT** for randomized trials
- **STROBE** for observational studies
- **PRISMA** for systematic reviews
- **STARD** for diagnostic accuracy
- **ARRIVE** for animal research
- **CARE** for case reports

### 6. Error Fixing
- Read compile logs and fix LaTeX errors
- Fix missing packages, unmatched braces, bad float placement
- Tectonic auto-installs packages — just add \\usepackage{pkg}

## Field-Specific Language
Use discipline-appropriate terminology and conventions. Adapt nomenclature for biomedical, molecular biology, chemistry, ecology, physics, neuroscience, computer science, and behavioral sciences as needed.

## Rules
- Make incremental edits. Use the Edit tool for small changes, not wholesale file rewrites.
- Always plan before making changes. State what you'll do, then do it.
- When adding figures, create the file first, then add the \\includegraphics reference.
- Preserve the document's existing formatting style and citation format.
- For Python scripts, run them and save outputs to figures/.
`

// Start a streaming Claude session
function startClaudeStream(opts: {
  chatId: string; prompt: string; cwd: string;
  sessionId?: string; model?: string; effortLevel?: string
}): { started: boolean } {
  // Kill any existing process for this chat
  killClaudeProcess(opts.chatId)

  const args: string[] = []

  // Session mode
  if (opts.sessionId) {
    args.push('--resume', opts.sessionId)
  }

  // Core flags
  args.push('-p') // prompt mode (reads from stdin)
  args.push('--output-format', 'stream-json')
  args.push('--verbose')
  args.push('--dangerously-skip-permissions')

  // Model selection
  if (opts.model) {
    args.push('--model', opts.model)
  }

  // System prompt — comprehensive LaTeX research assistant
  args.push('--append-system-prompt', SYSTEM_PROMPT)

  const env = cleanEnv()
  if (opts.effortLevel) {
    env['CLAUDE_CODE_EFFORT_LEVEL'] = opts.effortLevel
  }

  // shell: true is required on Windows to resolve claude.cmd from PATH.
  // All arguments are programmatically constructed — no user input in args (prompt goes via stdin).
  const proc = spawn('claude', args, {
    cwd: opts.cwd,
    shell: process.platform === 'win32',
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })

  activeProcesses.set(opts.chatId, proc)

  // Stream stdout line by line
  const rl = createInterface({ input: proc.stdout })
  rl.on('line', (rawLine) => {
    const line = stripAnsi(rawLine).trim()
    if (!line) return

    try {
      const msg = JSON.parse(line)
      // Send to renderer
      mainWindow?.webContents.send('claude:stream', {
        chatId: opts.chatId,
        message: msg
      })
    } catch {
      // Non-JSON output (rare) — send as raw text
      mainWindow?.webContents.send('claude:stream', {
        chatId: opts.chatId,
        message: { type: 'assistant', subtype: 'raw', text: line }
      })
    }
  })

  // Stderr
  proc.stderr.on('data', (data: Buffer) => {
    const text = stripAnsi(data.toString()).trim()
    if (text) {
      mainWindow?.webContents.send('claude:error', {
        chatId: opts.chatId,
        error: text
      })
    }
  })

  // Completion
  proc.on('close', (code) => {
    activeProcesses.delete(opts.chatId)
    mainWindow?.webContents.send('claude:complete', {
      chatId: opts.chatId,
      success: code === 0,
      exitCode: code
    })
  })

  proc.on('error', (err) => {
    activeProcesses.delete(opts.chatId)
    mainWindow?.webContents.send('claude:error', {
      chatId: opts.chatId,
      error: err.message
    })
    mainWindow?.webContents.send('claude:complete', {
      chatId: opts.chatId,
      success: false,
      exitCode: -1
    })
  })

  // Write prompt to stdin
  proc.stdin.write(opts.prompt)
  proc.stdin.end()

  return { started: true }
}

// Legacy non-streaming runner (simple one-shot)
function runClaude(prompt: string, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--dangerously-skip-permissions'], {
      cwd: cwd || undefined,
      shell: process.platform === 'win32',
      env: cleanEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    let error = ''

    proc.stdout.on('data', (data: Buffer) => {
      output += stripAnsi(data.toString())
    })
    proc.stderr.on('data', (data: Buffer) => {
      error += stripAnsi(data.toString())
    })

    proc.on('close', (code: number) => {
      if (code === 0) resolve(output)
      else reject(new Error(error || `Claude exited with code ${code}`))
    })
    proc.on('error', (err: Error) => reject(err))

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

// ── Tectonic Compilation ──

function compileTex(texPath: string): Promise<{ success: boolean; pdfPath: string; log: string }> {
  return new Promise((resolve) => {
    const dir = texPath.replace(/[/\\][^/\\]+$/, '')
    const proc = spawn('tectonic', [texPath, '--outdir', dir], {
      shell: process.platform === 'win32',
      env: { ...process.env }
    })

    let log = ''

    proc.stdout.on('data', (data: Buffer) => {
      log += data.toString()
    })
    proc.stderr.on('data', (data: Buffer) => {
      log += data.toString()
    })

    proc.on('close', (code: number) => {
      const pdfPath = texPath.replace(/\.tex$/, '.pdf')
      resolve({
        success: code === 0,
        pdfPath: existsSync(pdfPath) ? pdfPath : '',
        log
      })
    })

    proc.on('error', () => {
      resolve({ success: false, pdfPath: '', log: 'Tectonic not found. Install from https://tectonic-typesetting.github.io/' })
    })
  })
}
