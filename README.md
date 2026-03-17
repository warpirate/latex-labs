# LaTeX-Labs

AI-powered academic writing workspace. Write, compile, and refine LaTeX papers with an integrated Claude assistant — all in one desktop app.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- **LaTeX Editor** — CodeMirror 6 with custom syntax highlighting, bracket matching, and a warm dark theme
- **Live PDF Preview** — Compile with [Tectonic](https://tectonic-typesetting.github.io/) and preview instantly, or see a live text preview while writing
- **AI Assistant** — Multi-tab chat with Claude (streaming responses, thinking blocks, tool use tracking)
- **File Explorer** — Create, rename, delete, import files with drag-and-drop support
- **Citation Formats** — IEEE, APA 7th, and ACM templates with auto-generated project scaffolding
- **Quick Actions** — One-click literature search, diagram creation, equation help, and bibliography fixing
- **Document Outline** — Auto-extracted section hierarchy from `\section{}` commands
- **Citation Tracker** — Parses `\cite{}` references across your document

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- [Tectonic](https://tectonic-typesetting.github.io/) (for LaTeX compilation)
- Python 3 (optional, for matplotlib/seaborn figure generation)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/warpirate/latex-labs.git
cd latex-labs

# Install dependencies
npm install

# Start in development mode
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the app in development mode with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build |

## Project Structure

```
latex-labs/
├── src/
│   ├── main/               # Electron main process
│   │   └── index.ts        # IPC handlers, window setup, Claude CLI integration
│   ├── preload/             # Context bridge (IPC security boundary)
│   │   └── index.ts
│   └── renderer/            # React UI
│       ├── components/
│       │   ├── Editor/      # CodeMirror LaTeX editor
│       │   ├── Preview/     # PDF.js preview + live preview
│       │   ├── Sidebar/     # File tree, outline, citations, AI chat
│       │   ├── Toolbar/     # Compile, save, quick actions
│       │   └── Modals/      # New project dialog
│       ├── store/           # Zustand state management
│       └── styles/          # Tailwind theme + CSS variables
├── electron.vite.config.ts  # Electron-Vite build config
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 |
| UI | React 19 + TypeScript 5.7 |
| Styling | Tailwind CSS 3.4 |
| Editor | CodeMirror 6 |
| PDF | pdf.js |
| State | Zustand 5 |
| Build | Vite 6 + electron-vite 3 |
| AI | Claude Code CLI (streaming JSON) |
| LaTeX | Tectonic engine |

## How It Works

1. **Create a project** — Pick a citation format (IEEE / APA / ACM) and LaTeX-Labs scaffolds the directory with `main.tex`, `references.bib`, and a `CLAUDE.md` context file.
2. **Write in the editor** — Full LaTeX syntax highlighting with the warm Claude-inspired dark theme.
3. **Compile** — Hit the Compile button to run Tectonic. The PDF preview updates instantly.
4. **Ask the AI** — Open the AI panel to search literature, generate diagrams, fix equations, or manage citations. Claude has full read/write access to your project files.

## Security

The app follows Electron security best practices:

- `contextIsolation: true` — renderer cannot access Node.js directly
- `sandbox: true` — Chromium sandbox enabled
- `nodeIntegration: false` — no Node.js in renderer
- Path validation on all file IPC handlers — operations confined to project directory
- Delete confirmation dialogs for directories
- Environment variable whitelist for child processes

> **Note**: The AI assistant runs with `--dangerously-skip-permissions` to enable file editing. This is by design — Claude needs project file access to assist with writing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
