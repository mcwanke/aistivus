import { useState, useRef, useEffect } from 'react'
import {
  useCompileDocument,
  useFinalizeDocument,
  useDeleteDocument,
  useSaveDocumentContent,
  useRenameDocument,
  useDocumentContent,
} from '@/hooks/useDocuments'
import type { ApplicationDocument } from '@/types/documents'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.split('T')[0] ?? iso.slice(0, 10)
}

export interface DocRowProps {
  doc: ApplicationDocument
  applicationId: number
  typstAvailable: boolean
}

export function DocRow({ doc, applicationId, typstAvailable }: DocRowProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editError, setEditError] = useState('')
  const [compileError, setCompileError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const contentInitRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)

  function handleEditorScroll(): void {
    if (lineNumRef.current && textareaRef.current) {
      lineNumRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const isTyp = doc.extension === '.typ'
  const isPdf = doc.extension === '.pdf'
  const isDraft = isPdf && doc.filename.startsWith('DRAFT_')
  const isFinal = doc.is_final === 1
  const isMissing = !doc.file_exists

  const compile = useCompileDocument(applicationId)
  const finalize = useFinalizeDocument(applicationId)
  const del = useDeleteDocument(applicationId)
  const saveContent = useSaveDocumentContent(applicationId)
  const rename = useRenameDocument(applicationId)
  const { data: contentData, isLoading: contentLoading } = useDocumentContent(
    applicationId,
    editing ? doc.id : null
  )

  useEffect(() => {
    if (contentData?.content != null && editing && !contentInitRef.current) {
      setEditContent(contentData.content)
      contentInitRef.current = true
    }
  }, [contentData, editing])

  async function handleCompile(): Promise<void> {
    setCompileError('')
    const result = await compile.mutateAsync(doc.id)
    if (!result.success) {
      setCompileError(result.detail ?? result.error ?? 'Compilation failed')
    }
  }

  async function handleSaveContent(): Promise<void> {
    setEditError('')
    if (!editContent.trim()) {
      setEditError('Content cannot be empty.')
      return
    }
    if (new TextEncoder().encode(editContent).length > 5 * 1024 * 1024) {
      setEditError('Content exceeds 5 MB limit.')
      return
    }
    try {
      await saveContent.mutateAsync({ docId: doc.id, content: editContent })
      setEditing(false)
      setEditContent('')
    } catch (e) {
      setEditError((e as Error).message)
    }
  }

  function handleOpenEditor(): void {
    contentInitRef.current = false
    setEditing(true)
    setEditContent('')
    setEditError('')
    setCompileError('')
  }

  function handleCancelEdit(): void {
    setEditing(false)
    setEditContent('')
    setEditError('')
  }

  function handleOpenRename(): void {
    const stem = doc.filename.replace(/\.[^.]+$/, '')
    setRenameValue(stem)
    setRenameError('')
    setRenaming(true)
  }

  function handleCancelRename(): void {
    setRenaming(false)
    setRenameValue('')
    setRenameError('')
  }

  async function handleSaveRename(): Promise<void> {
    setRenameError('')
    const trimmed = renameValue.trim()
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
      setRenameError('1–64 chars: letters, digits, underscores, hyphens only.')
      return
    }
    try {
      await rename.mutateAsync({ docId: doc.id, new_name: trimmed })
      setRenaming(false)
      setRenameValue('')
    } catch (e) {
      setRenameError((e as Error).message)
    }
  }

  return (
    <div className="bg-surface2 rounded mb-1 last:mb-0">
      {/* Row header */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        {/* Filename + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className={`text-sm font-mono truncate ${isMissing ? 'text-red/70' : isFinal ? 'text-accent' : 'text-muted'}`}>
              {doc.filename}
            </span>
            {isMissing && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red/15 text-red shrink-0">
                ⚠ File missing
              </span>
            )}
            {isFinal && !isMissing && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green/15 text-green border border-green/30 shrink-0">
                Final
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-mono text-muted shrink-0">{fmtDate(doc.created_at)}</span>
            <span className="text-[10px] font-mono text-muted/50 truncate">{doc.file_path}</span>
          </div>
        </div>

        {/* Buttons — normal state */}
        {!deleteConfirm ? (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {isTyp && !isMissing && (
              <>
                <button
                  onClick={handleOpenEditor}
                  className="text-xs font-mono text-muted hover:text-text border border-surface2 rounded px-2 py-0.5 transition-colors hover:border-accent/40"
                >
                  Edit
                </button>
                <button
                  onClick={() => { window.open(`/api/v1/documents/file/${doc.id}?download=true`, '_blank') }}
                  className="text-xs font-mono text-muted hover:text-text border border-surface2 rounded px-2 py-0.5 transition-colors hover:border-accent/40"
                >
                  Download
                </button>
              </>
            )}
            {isTyp && typstAvailable && !isMissing && (
              <button
                onClick={() => void handleCompile()}
                disabled={compile.isPending}
                className="text-xs font-mono text-muted hover:text-text border border-surface2 rounded px-2 py-0.5 transition-colors hover:border-accent/40 disabled:opacity-50"
              >
                {compile.isPending ? 'Compiling…' : 'Compile'}
              </button>
            )}
            {isDraft && !isMissing && (
              <button
                onClick={() => finalize.mutate(doc.id)}
                disabled={finalize.isPending}
                className="text-xs font-mono text-muted hover:text-accent border border-surface2 rounded px-2 py-0.5 transition-colors hover:border-accent/40 disabled:opacity-50"
              >
                {finalize.isPending ? 'Finalizing…' : 'Finalize'}
              </button>
            )}
            {isPdf && !isMissing && (
              <>
                <button
                  onClick={() => { window.open(`/api/v1/documents/file/${doc.id}`, '_blank') }}
                  className="text-xs font-mono text-muted hover:text-text border border-surface2 rounded px-2 py-0.5 transition-colors hover:border-accent/40"
                >
                  Open
                </button>
                <button
                  onClick={() => { window.open(`/api/v1/documents/file/${doc.id}?download=true`, '_blank') }}
                  className="text-xs font-mono text-muted hover:text-text border border-surface2 rounded px-2 py-0.5 transition-colors hover:border-accent/40"
                >
                  Download
                </button>
              </>
            )}
            <button
              onClick={handleOpenRename}
              className="text-xs font-mono text-muted hover:text-text border border-surface2 rounded px-2 py-0.5 transition-colors hover:border-accent/40"
            >
              Rename
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="text-xs font-mono text-muted hover:text-red border border-surface2 rounded px-2 py-0.5 transition-colors hover:border-red/40"
            >
              Delete
            </button>
          </div>
        ) : (
          /* Delete confirmation */
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-muted">Delete {doc.filename}?</span>
            <button
              onClick={() => del.mutate(doc.id)}
              disabled={del.isPending}
              className="text-xs font-mono text-red border border-red/40 rounded px-2 py-0.5 transition-colors hover:bg-red/10 disabled:opacity-50"
            >
              {del.isPending ? '…' : 'Confirm'}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="text-xs font-mono text-muted border border-surface2 rounded px-2 py-0.5 transition-colors hover:text-text"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Compile error */}
      {compileError && !editing && (
        <div className="px-3 pb-2">
          <pre className="text-xs font-mono text-red bg-red/5 rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
            {compileError}
          </pre>
        </div>
      )}

      {/* Inline rename */}
      {renaming && (
        <div className="px-3 pb-3 border-t border-surface pt-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => { setRenameValue(e.target.value); setRenameError('') }}
              className="flex-1 text-xs font-mono bg-surface border border-surface2 rounded px-2 py-1 text-text focus:outline-none focus:border-accent/50"
              placeholder="new-filename"
              autoFocus
            />
            <span className="text-xs font-mono text-muted shrink-0">{doc.extension}</span>
            <button
              onClick={() => void handleSaveRename()}
              disabled={rename.isPending}
              className="text-xs font-mono text-accent border border-accent/40 rounded px-2 py-0.5 transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {rename.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancelRename}
              className="text-xs font-mono text-muted border border-surface2 rounded px-2 py-0.5 transition-colors hover:text-text"
            >
              Cancel
            </button>
          </div>
          {renameError && (
            <p className="text-xs font-mono text-red">{renameError}</p>
          )}
        </div>
      )}

      {/* Inline .typ editor */}
      {editing && (
        <div className="px-3 pb-3 border-t border-surface pt-2 space-y-2">
          {contentLoading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : (
            <>
              <div className="flex border border-surface2 rounded overflow-hidden focus-within:border-accent/50" style={{ height: 'calc(25 * 1.5rem + 1rem)' }}>
                <div
                  ref={lineNumRef}
                  className="bg-surface2 text-muted text-xs font-mono py-2 px-2 text-right select-none overflow-y-hidden leading-[1.5rem] shrink-0"
                  style={{ minWidth: '2.5rem' }}
                >
                  {editContent.split('\n').map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onScroll={handleEditorScroll}
                  className="flex-1 h-full bg-surface px-3 py-2 text-xs font-mono text-text focus:outline-none resize-none overflow-y-auto leading-[1.5rem]"
                />
              </div>
              {editError && <p className="text-xs font-mono text-red">{editError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleSaveContent()}
                  disabled={saveContent.isPending}
                  className="px-3 py-1.5 text-xs bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {saveContent.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-xs text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
