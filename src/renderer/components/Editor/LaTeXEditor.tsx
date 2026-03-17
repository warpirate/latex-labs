import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { useStore } from '../../store'

// Simple LaTeX highlighting via tag system
import { StreamLanguage } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { HighlightStyle } from '@codemirror/language'

// Minimal LaTeX stream parser
const latexStreamParser = StreamLanguage.define({
  token(stream) {
    // Comments
    if (stream.match('%')) {
      stream.skipToEnd()
      return 'comment'
    }
    // Commands
    if (stream.match(/\\[a-zA-Z@]+/)) {
      return 'keyword'
    }
    // Braces
    if (stream.match(/[{}]/)) {
      return 'bracket'
    }
    // Math delimiters
    if (stream.match('$$') || stream.match('$')) {
      return 'string'
    }
    // Square brackets
    if (stream.match(/[\[\]]/)) {
      return 'meta'
    }
    stream.next()
    return null
  }
})

// Claude-themed syntax highlighting — warm, muted palette
const claudeHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: '#D97757' },
  { tag: tags.comment, color: '#5C5955', fontStyle: 'italic' },
  { tag: tags.string, color: '#4BA67C' },
  { tag: tags.bracket, color: '#E49578' },
  { tag: tags.meta, color: '#8B8680' },
])

// Dark warm theme matching Claude Desktop
const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1E1D1B',
    color: '#E8E5E0'
  },
  '.cm-cursor': {
    borderLeftColor: '#D97757'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(217, 119, 87, 0.12) !important'
  },
  '.cm-gutters': {
    backgroundColor: '#1E1D1B',
    borderRight: '1px solid #32302D',
    color: '#5C5955',
    fontSize: '12px'
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#333130'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(217, 119, 87, 0.03)'
  },
  '.cm-foldGutter': {
    color: '#5C5955'
  }
}, { dark: true })

export default function LaTeXEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const fileContent = useStore((s) => s.fileContent)
  const activeFile = useStore((s) => s.activeFile)
  const setFileContent = useStore((s) => s.setFileContent)
  const setDirty = useStore((s) => s.setDirty)

  const handleUpdate = useRef(
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString()
        setFileContent(content)
        setDirty(true)
      }
    })
  )

  // Save on Ctrl+S
  const saveKeymap = keymap.of([{
    key: 'Mod-s',
    run: () => {
      const state = useStore.getState()
      if (state.activeFile && state.isDirty) {
        window.api.writeFile(state.activeFile, state.fileContent)
        state.setDirty(false)
      }
      return true
    }
  }])

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: fileContent,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        latexStreamParser,
        syntaxHighlighting(claudeHighlighting),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        darkTheme,
        handleUpdate.current,
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
        EditorView.lineWrapping
      ]
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [activeFile]) // Re-create on file change

  // Sync editor when fileContent changes externally (e.g., AI modifies the file)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== fileContent) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: fileContent }
      })
    }
  }, [fileContent])

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center bg-claude-bg-editor">
        <p className="text-claude-text-tertiary text-xs">Select a file to start editing</p>
      </div>
    )
  }

  return <div ref={containerRef} className="h-full overflow-auto bg-claude-bg-editor" />
}
