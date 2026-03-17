# Contributing to LaTeX-Labs

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/warpirate/latex-labs.git
cd latex-labs
npm install
npm run dev
```

The app runs with hot reload — changes to renderer code update instantly, main process changes require a restart.

## Project Layout

- **`src/main/`** — Electron main process. Handles IPC, file system, Claude CLI spawning, Tectonic compilation.
- **`src/preload/`** — Security bridge between main and renderer. All `window.api` methods are defined here.
- **`src/renderer/`** — React UI. Components, Zustand store, styles.

## Code Style

- TypeScript strict mode — no `any` types
- Tailwind CSS — use `claude.*` tokens from `tailwind.config.js`, avoid hardcoded hex colors
- Catch blocks use `catch (err: unknown)` with proper type narrowing
- File operations in main process must call `isPathWithinProject()` before any fs access

## Making Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run `npx tsc --noEmit` to verify no type errors
4. Run `npm run build` to verify the production build passes
5. Open a pull request with a clear description of the change

## Reporting Issues

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- OS and Electron version (`Help > About` or `process.versions`)
