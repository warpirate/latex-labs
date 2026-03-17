# OPEN-CLAUDEISM (LaTeX-Labs) — Full Code Review

**Reviewed**: 2026-03-17
**Codebase**: Electron 33 + Vite 6 + React 19 + TypeScript 5.7 + Tailwind 3.4
**Files reviewed**: 17 source files, 6 config files

---

## 1. Architecture & Structure

**Verdict: Clean and well-organized.**

- Main/preload/renderer separation is correct and properly enforced.
- IPC boundaries use `contextBridge.exposeInMainWorld()` — no direct Node.js exposure to renderer.
- `electron.vite.config.ts` correctly defines separate build targets with appropriate output directories.
- Zustand store is well-structured with clear state slices and proper type exports.

### Issues

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| A1 | `src/main/index.ts` | 501–506 | **`FileEntry` interface duplicated** — defined in main process AND in `src/renderer/env.d.ts:3–8`. These can drift out of sync silently. | Extract to a shared `src/shared/types.ts` imported by both main and renderer. | warning |

---

## 2. Security

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| S1 | `src/main/index.ts` | 26 | **`sandbox: false`** in `webPreferences`. Disables Chromium's OS-level process sandbox — the primary security boundary between renderer content and the host OS. | Change to `sandbox: true`. The preload already uses `contextBridge` correctly, so sandbox can be enabled without breaking the IPC bridge. | **critical** |
| S2 | `src/main/index.ts` | 686, 761, 793 | **`shell: true`** on all three `spawn()` calls (Claude streaming, Claude legacy, Tectonic). Enables shell metacharacter interpretation. While arguments are currently constructed programmatically, this is a dangerous default — any future change that passes user-influenced strings into args creates a command injection vector. | Remove `shell: true` from all spawn calls. On Windows, `claude.cmd` and `tectonic.exe` on PATH can be spawned directly without shell. If needed, use `cross-spawn` for cross-platform compatibility. | **critical** |
| S3 | `src/main/index.ts` | 150–153 | **Unguarded recursive delete**: `fs.rmSync(targetPath, { recursive: true, force: true })` with NO path validation and NO user confirmation. The `targetPath` comes directly from the renderer via IPC — a compromised or buggy renderer could delete any directory the user has access to. | 1) Validate `targetPath` is inside the active project directory. 2) Show a confirmation dialog via `dialog.showMessageBox()` for directories. 3) Remove `force: true` to let errors surface. | **critical** |
| S4 | `src/main/index.ts` | 88–96, 134–161 | **No path validation** on ANY file IPC handler: `file:read`, `file:write`, `file:createFile`, `file:createFolder`, `file:rename`, `file:copyInto`. All accept arbitrary absolute paths from the renderer with no boundary checks. | Add a `validatePath()` guard that resolves and normalizes the path, then confirms it starts with the active project directory. Apply to every file operation handler. Example: `function validatePath(target: string, projectRoot: string): boolean { return path.resolve(target).startsWith(path.resolve(projectRoot) + path.sep) }` | **critical** |
| S5 | `src/main/index.ts` | 669 | **`--dangerously-skip-permissions`** flag passed to every Claude CLI invocation. Grants Claude unrestricted file system and command execution. | Intentional for the app's workflow, but should be documented as an explicit security trade-off. Consider a user-facing notice or opt-in toggle in settings. | warning |
| S6 | `src/main/index.ts` | 145, 151, 157 | **Dynamic `require('fs')`** inside IPC handlers, despite `fs` functions already imported at line 3. Anti-pattern: uses CJS require in an ESM-style file and bypasses bundler static analysis. | Replace `const fs = require('fs')` with imports. Add `renameSync`, `rmSync`, `copyFileSync` to the existing import on line 3. | warning |
| S7 | `src/main/index.ts` | 541–550 | **Environment variable leakage**: `cleanEnv()` forwards ALL env vars (except two prefixes) to child processes. Could leak API keys, cloud credentials, or tokens. | Whitelist only required vars: `PATH`, `HOME`, `USERPROFILE`, `TEMP`, `TMP`, `LANG`, `SystemRoot`, `APPDATA`. | warning |
| S8 | `src/preload/index.ts` | 32–47 | **Untyped IPC boundary**: All 6 event listener callbacks use `(data: any)` and `(_e: any, data: any)`. The preload is the security boundary between main and renderer — losing type safety here means type errors at this boundary go undetected. | Type callbacks using the interfaces from `env.d.ts`: `ClaudeStreamMessage` for stream data, `{ chatId: string; error: string }` for errors, `{ chatId: string; success: boolean; exitCode: number }` for completion. | warning |

---

## 3. React Components

### Bugs

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| R3 | `src/renderer/components/LandingScreen.tsx` | 38, 44 | **Project format always hardcoded to `'ieee'`**: Both `handleOpenFolder()` and `handleOpenRecent()` call `setProject(path, 'ieee')` regardless of the actual project format. Opening an APA or ACM project always misidentifies it — affecting the system prompt, CLAUDE.md generation, and format badge display. | Read the format from a config file that `createProject()` writes (e.g., `.latexlabs/config.json`), or detect from `\documentclass` in `main.tex`. | **critical** |
| R1 | `src/renderer/components/Preview/PDFPreview.tsx` | 102–111 | **Dead code**: The keyboard shortcut `useEffect` defines a handler but never attaches it. The cleanup returns `() => {}` (empty). The handler function exists but `addEventListener` is never called. | Either wire it up properly (`window.addEventListener('keydown', handler)` + `return () => window.removeEventListener(...)`) or delete the dead effect. | warning |
| R8 | `src/renderer/components/Preview/PDFPreview.tsx` | 64–99 | **Render race condition**: The `if (rendering) return` guard prevents concurrent PDF renders, but if deps (`pdfDoc`, `currentPage`, `zoom`) change while a render is in progress, the new render is silently dropped. React won't re-run the effect because the deps already changed during the current execution. | Replace the boolean gate with a render task ref. Cancel the previous `renderTask` before starting a new one. | warning |

### Missing Error Handling

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| R4 | `src/renderer/components/Sidebar/Sidebar.tsx` | 118–128 | **No confirmation before delete**: `handleDelete()` immediately calls `window.api.deleteFile()` which uses `rmSync({ recursive: true, force: true })` on the backend. Line 121 comment: `"could add confirm dialog later"`. | Add `if (!confirm('Delete ' + entry.name + '?')) return` or show a custom modal. | warning |

### Memory Leaks

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| R2 | `src/renderer/components/Preview/PDFPreview.tsx` | 43–61 | **PDF document never destroyed**: When `pdfPath` changes, a new document is loaded but the old `pdfDoc` is never cleaned up via `doc.destroy()`. PDF.js documents hold canvas memory, web worker references, and internal buffers that aren't garbage collected automatically. | In the cleanup: call `pdfDoc?.destroy()` and `loadTask.destroy()` to cancel any in-flight loading. | warning |

### Stale Closures / Hook Issues

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| R5 | `src/renderer/components/Sidebar/AIChat.tsx` | 96–103 | **Stale closure in quick action effect**: `sendMessage` is called inside a `useEffect` but is NOT in the dependency array. `sendMessage` closes over `tab`, `activeFile`, `projectPath`, `projectFormat`, `effortLevel` — these can be stale when the effect fires. | Use a ref for `sendMessage` (`const sendRef = useRef(sendMessage); sendRef.current = sendMessage`) and call `sendRef.current(action)` in the effect. | warning |
| R7 | `src/renderer/components/Sidebar/Sidebar.tsx` | 210 | **Unsafe `(file as any).path`** for drag-drop. Electron File objects have `.path` but standard browser File objects don't. | Type as `(file as File & { path: string }).path` or define an `ElectronFile` interface. | warning |
| R9 | `src/renderer/components/Workspace.tsx` | 105–111 | **`activeFile` read in effect but missing from deps**: Effect depends on `[projectPath]` but checks `!activeFile`. Works in practice (activeFile starts null) but violates exhaustive-deps. | Add `activeFile` to deps or suppress with eslint comment explaining the intent. | nitpick |
| R6 | `src/renderer/components/Sidebar/AIChat.tsx` | 111–165 | **O(n) IPC listener fan-out**: Each `ChatView` registers global listeners and filters by `tab.id`. Every message fires every tab's handler. | Works correctly. For many tabs, consider a single parent listener that dispatches by chatId. | nitpick |

---

## 4. TypeScript Quality

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| T1 | `src/preload/index.ts` | 32–47 | 6 `any` types in IPC event callbacks | Type with proper interfaces from `env.d.ts` | warning |
| T2 | `src/renderer/env.d.ts` | 42 | `input?: any` in `ClaudeStreamMessage` content block | `input?: Record<string, unknown>` | warning |
| T3 | `src/renderer/components/Preview/PDFPreview.tsx` | 20 | `useState<any>(null)` for PDF document | `useState<pdfjsLib.PDFDocumentProxy \| null>(null)` | warning |
| T4 | `src/renderer/components/Preview/PDFPreview.tsx` | 31, 71 | `(page: any)` in getPage callback | `(page: pdfjsLib.PDFPageProxy)` | warning |
| T7 | `src/renderer/components/Sidebar/Sidebar.tsx` | 210 | `(file as any).path` | `(file as File & { path: string }).path` | warning |
| T5 | `src/renderer/components/Toolbar/MainToolbar.tsx` | 33 | `catch (err: any)` | `catch (err: unknown)` + type narrow | nitpick |
| T6 | `src/renderer/components/Sidebar/AIChat.tsx` | 192 | `catch (err: any)` | `catch (err: unknown)` + type narrow | nitpick |

**Config assessment**: `tsconfig.json` and `tsconfig.node.json` are well-configured — strict mode enabled, path aliases set up, proper extends chain. No issues.

---

## 5. Styling & Tailwind

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| ST5 | `tailwind.config.js` | — | **Missing semantic color tokens**: `success` (`#4BA67C`), `error` (`#D4564A`), `warning` (`#C9963A`) are defined as CSS variables in `theme.css` but NOT in `tailwind.config.js`. This forces hardcoded hex values across components. | Add to `tailwind.config.js` under `claude`: `success: '#4BA67C'`, `error: '#D4564A'`, `warning: '#C9963A'` | warning |
| ST1 | `src/renderer/components/Preview/PDFPreview.tsx` | 132–224 | **Hardcoded hex colors** bypass theme: `bg-[#F5F4F0]`, `border-[#E0DDD8]`, `text-[#8B8680]`, `bg-[#525659]`, `text-[#6B6560]`, `text-[#B5B0AB]`, `text-[#2B2A27]` | Add preview-specific tokens to Tailwind config (e.g., `claude.preview-bg`, `claude.preview-text`) or reuse existing tokens where colors match. | warning |
| ST2 | `src/renderer/components/Sidebar/AIChat.tsx` | 244 | `hover:bg-[#D4564A]/10`, `hover:text-[#D4564A]` | Use `hover:bg-claude-error/10` after adding ST5 fix | warning |
| ST3 | `src/renderer/components/Sidebar/Sidebar.tsx` | 470–473 | `text-[#D4564A]`, `hover:bg-[#D4564A]/10` for danger context menu items | Same — use `text-claude-error` | warning |
| ST4 | `src/renderer/components/LandingScreen.tsx` | 140–142 | `text-[#4BA67C]` and `text-[#D4564A]` for status icons | Use `text-claude-success` and `text-claude-error` | warning |

---

## 6. Build & Config

| # | File | Line | Issue | Fix | Severity |
|---|------|------|-------|-----|----------|
| B1 | `package.json` | 13 | **`@anthropic-ai/sdk`** (v0.39.0) listed as production dependency but never imported anywhere. The app uses Claude CLI via `spawn()`, not the SDK. | Remove from `dependencies`. | warning |
| B2 | `package.json` | 21 | **`katex`** (v0.16.21) listed as dependency but never imported in any source file. | Remove unless there's a planned KaTeX rendering feature. | warning |
| B3 | `package.json` | 14, 19, 20 | **Unused CodeMirror packages**: `@codemirror/lang-javascript`, `@lezer/lr`, and `codemirror` (meta-package) are listed but never imported. Only `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, `@codemirror/autocomplete`, and `@lezer/highlight` are actually used. | Remove the three unused packages. | warning |
| B4 | — | — | **No electron-builder config** for production packaging. `electron-builder` is in devDependencies and `postinstall` runs `install-app-deps`, but there's no `electron-builder.yml` or `build` config in `package.json` for producing distributable installers (`.exe`, `.dmg`, `.AppImage`). | Add `electron-builder.yml` with app ID, platform targets, file globs, and signing config. | warning |

**No issues**: `electron.vite.config.ts` (correct), `postcss.config.js` (standard), `tsconfig.json` (well-configured).

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| **Critical** | 5 | S1, S2, S3, S4, R3 |
| **Warning** | 19 | A1, S5–S8, R1, R2, R4, R5, R7, R8, T1–T4, T7, ST1–ST5, B1–B4 |
| **Nitpick** | 4 | R6, R9, T5, T6 |

### Priority Fix Order

1. **S4** — Add path validation to all file IPC handlers (blocks S3 fix)
2. **S3** — Add confirmation dialog + remove `force: true` on delete
3. **S1** — Enable sandbox
4. **S2** — Remove `shell: true` from all spawn calls
5. **R3** — Persist and read project format instead of hardcoding `'ieee'`
6. **ST5** — Add semantic tokens to Tailwind config (unblocks ST1–ST4)
7. Everything else in severity order
