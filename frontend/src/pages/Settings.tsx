import { useState } from 'react'
import AppHeader from '@/components/AppHeader'
import { useQueryClient } from '@tanstack/react-query'
import type { LlmModel, LlmServer, SystemType } from '@/types/api'
import {
  useSettings,
  useLlmModels,
  useCreateModel,
  useUpdateModel,
  useDeleteModel,
  useCheckAvailability,
  useSystemTypes,
  useAddSystemType,
  useDeleteSystemType,
  useJobsearch,
  useSaveJobsearch,
  useJobsearchBackup,
  useResumeTemplate,
  useSaveResumeTemplate,
  useResumeTemplateBackup,
} from '@/hooks/useSettings'
import { useDocumentsStorage } from '@/hooks/useDocuments'
import {
  useServers,
  useCreateServer,
  useUpdateServer,
  useDeleteServer,
  useTestConnection,
  useAvailableModels,
  useAnthropicKeyStatus,
} from '@/hooks/useServers'
import { useAppSettings, usePatchAppSetting } from '@/hooks/useApplications'
import {
  useProfileVersions,
  useProfileVersionContent,
  useRestoreVersion,
} from '@/hooks/useProfileVersions'

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <h2 className="font-serif text-accent text-lg border-b border-surface2 pb-2 mb-4">
      {title}
    </h2>
  )
}

// ─── Server modals ────────────────────────────────────────────────────────────

type TestStatus = { success: boolean; message: string } | null

function AddServerModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [tab, setTab] = useState<'local' | 'anthropic'>('local')
  const [serverName, setServerName] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>(null)
  const [formError, setFormError] = useState('')
  const [step, setStep] = useState<'form' | 'import'>('form')
  const [importServerId, setImportServerId] = useState<number | null>(null)
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [importError, setImportError] = useState('')

  const { data: keyStatus } = useAnthropicKeyStatus()
  const { data: servers = [] } = useServers()
  const { data: existingModels = [] } = useLlmModels()
  const testConn = useTestConnection()
  const createServer = useCreateServer()
  const createModel = useCreateModel()
  const availableModels = useAvailableModels(importServerId)

  const anthropicExists = servers.some((s) => s.server_type === 'anthropic')

  function handleTabChange(t: 'local' | 'anthropic'): void {
    setTab(t)
    setTestStatus(null)
    setFormError('')
    if (t === 'anthropic' && (serverName === '' || serverName === 'Local Ollama')) {
      setServerName('Anthropic Claude')
    } else if (t === 'local' && serverName === 'Anthropic Claude') {
      setServerName('')
    }
  }

  async function handleTestConnection(): Promise<void> {
    setTestStatus(null)
    try {
      const result = await testConn.mutateAsync({
        server_type: tab,
        endpoint: tab === 'local' ? endpoint.trim().replace(/\/$/, '') : undefined,
      })
      if (result.success) {
        const msg =
          tab === 'local' && result.model_count !== undefined
            ? `Connected — ${result.model_count} model${result.model_count !== 1 ? 's' : ''} found`
            : 'Connected'
        setTestStatus({ success: true, message: msg })
      } else {
        setTestStatus({ success: false, message: result.error ?? 'Connection failed' })
      }
    } catch (e) {
      setTestStatus({ success: false, message: (e as Error).message })
    }
  }

  async function handleSave(): Promise<void> {
    setFormError('')
    const name = serverName.trim()
    if (!name) {
      setFormError('Server name is required.')
      return
    }
    if (tab === 'local') {
      const ep = endpoint.trim().replace(/\/$/, '')
      if (!ep) {
        setFormError('Endpoint is required for local servers.')
        return
      }
      if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
        setFormError('Endpoint must start with http:// or https://')
        return
      }
    }
    try {
      const created = await createServer.mutateAsync({
        server_name: name,
        server_type: tab,
        endpoint: tab === 'local' ? endpoint.trim().replace(/\/$/, '') : null,
      })
      setImportServerId(created.id)
      setStep('import')
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  async function handleImport(): Promise<void> {
    if (!importServerId || selectedModels.size === 0) {
      onClose()
      return
    }
    setImportError('')
    const selectedArray = Array.from(selectedModels)
    const isFirstEver = existingModels.length === 0

    try {
      for (let i = 0; i < selectedArray.length; i++) {
        const setAsDefault = isFirstEver && selectedArray.length === 1 && i === 0
        await createModel.mutateAsync({
          model: selectedArray[i],
          server_id: importServerId,
          model_weight: 1,
          default_flag: setAsDefault ? 1 : 0,
        })
      }
      onClose()
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  function toggleModel(name: string): void {
    setSelectedModels((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const localEndpointClean = endpoint.trim().replace(/\/$/, '')
  const canTest =
    tab === 'local' ? localEndpointClean.length > 0 : (keyStatus?.anthropic_key_present ?? false)
  const formValid =
    serverName.trim().length > 0 && (tab === 'anthropic' || localEndpointClean.length > 0)
  const blocked = tab === 'anthropic' && anthropicExists

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-surface2 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h3 className="font-serif text-accent text-base">
            {step === 'form' ? 'Add AI Server' : 'Import Models'}
          </h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition-colors font-mono text-sm px-2 py-0.5 border border-surface2 rounded hover:border-accent/40"
          >
            ×
          </button>
        </div>

        {step === 'form' && (
          <>
            <div className="flex border-b border-surface2 px-6">
              {(['local', 'anthropic'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  className={`px-4 py-2 text-sm font-mono border-b-2 transition-colors ${
                    tab === t
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted hover:text-text'
                  }`}
                >
                  {t === 'local' ? 'Local' : 'Remote (Anthropic)'}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 space-y-4">
              {blocked && (
                <div className="bg-surface2 rounded-lg px-4 py-3 text-sm font-mono text-muted">
                  Anthropic server already configured — use Edit to update.
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
                  Server Name
                </label>
                <input
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder={tab === 'local' ? 'Home Lab' : 'Anthropic Claude'}
                  disabled={blocked}
                  className="bg-surface2 border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50"
                />
              </div>

              {tab === 'local' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
                    Endpoint
                  </label>
                  <input
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="http://192.168.1.10:11434"
                    className="bg-surface2 border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
                  />
                </div>
              )}

              {tab === 'anthropic' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
                    API Key
                  </label>
                  <p
                    className={`text-sm font-mono ${keyStatus?.anthropic_key_present ? 'text-green' : 'text-muted'}`}
                  >
                    {keyStatus?.anthropic_key_present
                      ? '✓ Set'
                      : 'Not set — add ANTHROPIC_API_KEY to your .env file'}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => void handleTestConnection()}
                  disabled={!canTest || testConn.isPending || blocked}
                  title={
                    tab === 'anthropic' && !keyStatus?.anthropic_key_present
                      ? 'Set ANTHROPIC_API_KEY in .env first'
                      : undefined
                  }
                  className="px-3 py-1.5 text-sm font-mono text-muted border border-surface2 rounded hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-40"
                >
                  {testConn.isPending ? 'Testing…' : 'Test Connection'}
                </button>
                {testStatus && (
                  <span
                    className={`text-xs font-mono ${testStatus.success ? 'text-green' : 'text-red'}`}
                  >
                    {testStatus.success ? `✓ ${testStatus.message}` : `✗ ${testStatus.message}`}
                  </span>
                )}
              </div>

              {formError && <p className="text-xs font-mono text-red">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 px-6 pb-5">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-sans text-muted bg-surface border border-surface2 rounded hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!formValid || createServer.isPending || blocked}
                className="px-3 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {createServer.isPending
                  ? 'Saving…'
                  : testStatus?.success
                    ? 'Save'
                    : 'Save (untested)'}
              </button>
            </div>
          </>
        )}

        {step === 'import' && (
          <>
            <div className="px-6 py-5">
              <p className="text-sm font-sans text-muted mb-4">
                Would you like to add models from this server?
              </p>
              {availableModels.isLoading ? (
                <p className="text-sm font-mono text-muted">Loading models…</p>
              ) : availableModels.error ? (
                <p className="text-sm font-mono text-red">
                  {(availableModels.error as Error).message}
                </p>
              ) : (availableModels.data?.models ?? []).length === 0 ? (
                <p className="text-sm font-mono text-muted">No models found.</p>
              ) : (
                <div className="border border-surface2 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  {(availableModels.data?.models ?? []).map((name) => (
                    <label
                      key={name}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface2/50 border-b border-surface2 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModels.has(name)}
                        onChange={() => toggleModel(name)}
                        className="accent-accent"
                      />
                      <span className="font-mono text-sm text-text">{name}</span>
                    </label>
                  ))}
                </div>
              )}
              {importError && <p className="text-xs font-mono text-red mt-2">{importError}</p>}
            </div>

            <div className="flex justify-end gap-2 px-6 pb-5">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-sans text-muted bg-surface border border-surface2 rounded hover:text-text transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => void handleImport()}
                disabled={selectedModels.size === 0 || createModel.isPending}
                className="px-3 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {createModel.isPending
                  ? 'Importing…'
                  : `Import Selected (${selectedModels.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EditServerModal({
  server,
  onClose,
}: {
  server: LlmServer
  onClose: () => void
}): React.JSX.Element {
  const [serverName, setServerName] = useState(server.server_name)
  const [endpoint, setEndpoint] = useState(server.endpoint ?? '')
  const [testStatus, setTestStatus] = useState<TestStatus>(null)
  const [formError, setFormError] = useState('')

  const { data: keyStatus } = useAnthropicKeyStatus()
  const testConn = useTestConnection()
  const updateServer = useUpdateServer()

  async function handleTestConnection(): Promise<void> {
    setTestStatus(null)
    try {
      const result = await testConn.mutateAsync({
        server_type: server.server_type,
        endpoint:
          server.server_type === 'local' ? endpoint.trim().replace(/\/$/, '') : undefined,
      })
      if (result.success) {
        const msg =
          server.server_type === 'local' && result.model_count !== undefined
            ? `Connected — ${result.model_count} model${result.model_count !== 1 ? 's' : ''} found`
            : 'Connected'
        setTestStatus({ success: true, message: msg })
      } else {
        setTestStatus({ success: false, message: result.error ?? 'Connection failed' })
      }
    } catch (e) {
      setTestStatus({ success: false, message: (e as Error).message })
    }
  }

  async function handleSave(): Promise<void> {
    setFormError('')
    const name = serverName.trim()
    if (!name) {
      setFormError('Server name is required.')
      return
    }
    if (server.server_type === 'local') {
      const ep = endpoint.trim().replace(/\/$/, '')
      if (!ep) {
        setFormError('Endpoint is required for local servers.')
        return
      }
    }
    try {
      await updateServer.mutateAsync({
        serverId: server.id,
        updates: {
          server_name: name,
          endpoint: server.server_type === 'local' ? endpoint.trim().replace(/\/$/, '') : null,
        },
      })
      onClose()
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  const canTest =
    server.server_type === 'local'
      ? endpoint.trim().length > 0
      : (keyStatus?.anthropic_key_present ?? false)
  const formValid =
    serverName.trim().length > 0 &&
    (server.server_type === 'anthropic' || endpoint.trim().length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-surface2 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h3 className="font-serif text-accent text-base">Edit Server</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition-colors font-mono text-sm px-2 py-0.5 border border-surface2 rounded hover:border-accent/40"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
              Type
            </label>
            <p className="text-sm font-mono text-muted">
              {server.server_type === 'local' ? 'Local (Ollama)' : 'Remote (Anthropic)'}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
              Server Name
            </label>
            <input
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              className="bg-surface2 border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
            />
          </div>

          {server.server_type === 'local' && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
                Endpoint
              </label>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="bg-surface2 border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
              />
            </div>
          )}

          {server.server_type === 'anthropic' && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
                API Key
              </label>
              <p
                className={`text-sm font-mono ${keyStatus?.anthropic_key_present ? 'text-green' : 'text-muted'}`}
              >
                {keyStatus?.anthropic_key_present
                  ? '✓ Set'
                  : 'Not set — add ANTHROPIC_API_KEY to your .env file'}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleTestConnection()}
              disabled={!canTest || testConn.isPending}
              className="px-3 py-1.5 text-sm font-mono text-muted border border-surface2 rounded hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-40"
            >
              {testConn.isPending ? 'Testing…' : 'Test Connection'}
            </button>
            {testStatus && (
              <span
                className={`text-xs font-mono ${testStatus.success ? 'text-green' : 'text-red'}`}
              >
                {testStatus.success ? `✓ ${testStatus.message}` : `✗ ${testStatus.message}`}
              </span>
            )}
          </div>

          {formError && <p className="text-xs font-mono text-red">{formError}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-sans text-muted bg-surface border border-surface2 rounded hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!formValid || updateServer.isPending}
            className="px-3 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {updateServer.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Servers section ──────────────────────────────────────────────────────────

function ServersSection(): React.JSX.Element {
  const { data: servers = [], isLoading, error } = useServers()
  const { data: keyStatus } = useAnthropicKeyStatus()
  const deleteServer = useDeleteServer()

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingServer, setEditingServer] = useState<LlmServer | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({})

  async function handleDelete(server: LlmServer): Promise<void> {
    if (!confirm(`Delete server "${server.server_name}"? This cannot be undone.`)) return
    setDeleteErrors((prev) => ({ ...prev, [server.id]: '' }))
    try {
      await deleteServer.mutateAsync(server.id)
    } catch (e) {
      setDeleteErrors((prev) => ({ ...prev, [server.id]: (e as Error).message }))
    }
  }

  if (isLoading) return <p className="text-sm text-muted">Loading servers…</p>
  if (error) return <p className="text-sm text-red">{(error as Error).message}</p>

  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 border-b border-surface2 pb-2 mb-4">
        <h2 className="font-serif text-accent text-lg flex-1">AI Servers</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-sm font-mono text-muted border border-dashed border-surface2 rounded px-3 py-1 hover:text-accent hover:border-accent/40 transition-colors shrink-0"
        >
          + Add AI/Server
        </button>
      </div>

      {servers.length === 0 ? (
        <p className="text-sm text-muted">No servers configured.</p>
      ) : (
        <div className="border border-surface2 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1.5fr)_80px_minmax(0,1.5fr)_52px_140px] border-b border-surface2 bg-surface2/40">
            {['Server Name', 'Type', 'Endpoint', 'IN USE', 'Actions'].map((h) => (
              <div
                key={h}
                className="px-3 py-2 text-[10px] font-mono text-muted uppercase tracking-wider"
              >
                {h}
              </div>
            ))}
          </div>

          {servers.map((server) => (
            <div key={server.id} className="border-b border-surface2 last:border-0">
              <div className="grid grid-cols-[minmax(0,1.5fr)_80px_minmax(0,1.5fr)_52px_140px] items-center">
                <div className="px-3 py-3 min-w-0">
                  <p className="font-mono text-sm text-text truncate">{server.server_name}</p>
                  {server.server_type === 'anthropic' && (
                    <p
                      className={`text-[10px] font-mono mt-0.5 ${keyStatus?.anthropic_key_present ? 'text-green' : 'text-red'}`}
                    >
                      API Key: {keyStatus?.anthropic_key_present ? '✓ Set' : 'Not set'}
                    </p>
                  )}
                </div>
                <div className="px-3 py-3">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      server.server_type === 'anthropic'
                        ? 'bg-accent/10 text-accent border-accent/30'
                        : 'bg-surface2 text-muted border-surface2'
                    }`}
                  >
                    {server.server_type === 'local' ? 'Local' : 'Anthropic'}
                  </span>
                </div>
                <div className="px-3 py-3 min-w-0">
                  <span className="font-mono text-xs text-muted truncate block">
                    {server.endpoint ?? '—'}
                  </span>
                </div>
                <div className="px-3 py-3">
                  <span className="font-mono text-sm text-muted">{server.model_count}</span>
                </div>
                <div className="px-3 py-3 flex items-center gap-1">
                  <button
                    onClick={() => setEditingServer(server)}
                    className="px-2 py-1 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleDelete(server)}
                    disabled={server.model_count > 0 || deleteServer.isPending}
                    title={
                      server.model_count > 0
                        ? 'Delete all models on this server first'
                        : undefined
                    }
                    className="px-2 py-1 text-xs font-mono text-muted border border-surface2 rounded hover:text-red hover:border-red/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {deleteErrors[server.id] && (
                <p className="px-3 pb-2 text-xs font-mono text-red">{deleteErrors[server.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && <AddServerModal onClose={() => setShowAddModal(false)} />}
      {editingServer && (
        <EditServerModal server={editingServer} onClose={() => setEditingServer(null)} />
      )}
    </section>
  )
}

// ─── Model management ─────────────────────────────────────────────────────────

type ModelFormState = {
  model: string
  server_id: number | null
  model_weight: string
  default_flag: boolean
}

const EMPTY_MODEL_FORM: ModelFormState = {
  model: '',
  server_id: null,
  model_weight: '1',
  default_flag: false,
}

function ModelRow({
  model,
  onDelete,
  onEdit,
}: {
  model: LlmModel
  onDelete: (id: number) => void
  onEdit: (model: LlmModel) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-surface2 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm text-text truncate">{model.model}</span>
          {model.default_flag === 1 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
              default
            </span>
          )}
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              model.available === 1
                ? 'bg-green/10 text-green border-green/30'
                : 'bg-red/10 text-red border-red/30'
            }`}
          >
            {model.available === 1 ? 'available' : 'unreachable'}
          </span>
        </div>
        <p className="font-mono text-xs text-muted mt-0.5">↳ {model.server_name}</p>
        <p className="font-mono text-xs text-muted/60 mt-0.5">
          weight: {model.model_weight}
          {model.estimated_eval_time != null ? ` · est. ${model.estimated_eval_time}s` : ''}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(model)}
          className="px-2 py-1 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(model.id)}
          className="px-2 py-1 text-xs font-mono text-muted border border-surface2 rounded hover:text-red hover:border-red/40 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function ModelForm({
  initial,
  isEdit,
  editServerName,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: ModelFormState
  isEdit?: boolean
  editServerName?: string
  onSave: (form: ModelFormState) => void
  onCancel: () => void
  saving: boolean
  error: string
}): React.JSX.Element {
  const [form, setForm] = useState<ModelFormState>(initial)
  const { data: servers = [] } = useServers()
  const { data: models = [] } = useLlmModels()
  const availableModels = useAvailableModels(form.server_id)

  const currentDefault = models.find((m) => m.default_flag === 1)
  // Warn only when we're newly requesting default (wasn't default before)
  const willReplaceDefault = form.default_flag && !initial.default_flag && currentDefault != null

  const existingModelNames = new Set(
    models.filter((m) => m.server_id === form.server_id).map((m) => m.model)
  )
  const filteredOptions = (availableModels.data?.models ?? []).filter(
    (name) => !existingModelNames.has(name)
  )

  const saveDisabled =
    saving ||
    (!isEdit &&
      (availableModels.isError ||
        form.model === '' ||
        (form.server_id !== null && !availableModels.isLoading && filteredOptions.length === 0)))

  const selectClass =
    'bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50 disabled:opacity-50'

  function renderModelNameField(): React.JSX.Element {
    if (form.server_id === null) {
      return (
        <select disabled className={selectClass}>
          <option>— select a server first —</option>
        </select>
      )
    }
    if (availableModels.isLoading) {
      return (
        <select disabled className={selectClass}>
          <option>Loading models…</option>
        </select>
      )
    }
    if (availableModels.isError) {
      return <></>
    }
    if (filteredOptions.length === 0) {
      return (
        <select disabled className={selectClass}>
          <option>All available models already added</option>
        </select>
      )
    }
    return (
      <select
        value={form.model}
        onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
        className={selectClass}
      >
        <option value="">— select a model —</option>
        {filteredOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div className="bg-surface2 border border-surface2 rounded-lg p-4 space-y-3 mt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Model name
          </label>
          {isEdit ? (
            <input
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="llama3.1:8b"
              className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
            />
          ) : (
            renderModelNameField()
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
              Server
            </label>
            {!isEdit && form.server_id !== null && (
              <button
                type="button"
                onClick={() => void availableModels.refetch()}
                disabled={availableModels.isFetching}
                className="text-[10px] font-mono text-muted hover:text-accent transition-colors disabled:opacity-40"
              >
                {availableModels.isFetching ? '…' : '↺ Refresh'}
              </button>
            )}
          </div>
          {isEdit ? (
            <p className="text-sm font-mono text-muted py-1.5">{editServerName ?? '—'}</p>
          ) : (
            <select
              value={form.server_id?.toString() ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  server_id: e.target.value === '' ? null : parseInt(e.target.value, 10),
                  model: '',
                }))
              }
              className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
            >
              <option value="">— select server —</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.server_name} ({s.server_type === 'local' ? 'Local' : 'Anthropic'})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Weight
          </label>
          <input
            type="number"
            value={form.model_weight}
            onChange={(e) => setForm((f) => ({ ...f, model_weight: e.target.value }))}
            min="1"
            className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          />
        </div>

        <div className="flex flex-col gap-1 justify-center">
          <label className="flex items-center gap-2 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={form.default_flag}
              onChange={(e) => setForm((f) => ({ ...f, default_flag: e.target.checked }))}
              className="accent-accent"
            />
            <span className="text-sm font-mono text-muted">Set as default model</span>
          </label>
          {willReplaceDefault && (
            <p className="text-[10px] font-mono text-muted/60">
              This will replace {currentDefault.model} as the default.
            </p>
          )}
        </div>
      </div>

      {!isEdit && availableModels.isError && (
        <p className="text-xs font-mono text-red">
          Could not reach this server — fix the connection in AI Servers settings.
        </p>
      )}

      {error && <p className="text-xs font-mono text-red">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-sans text-muted bg-surface border border-surface2 rounded hover:text-text transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saveDisabled}
          className="px-3 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function ModelsSection(): React.JSX.Element {
  const { data: models = [], isLoading, error } = useLlmModels()
  const createModel = useCreateModel()
  const updateModel = useUpdateModel()
  const deleteModel = useDeleteModel()
  const checkAvailability = useCheckAvailability()

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingModel, setEditingModel] = useState<LlmModel | null>(null)
  const [formError, setFormError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  async function handleCreate(form: ModelFormState): Promise<void> {
    if (!form.model.trim()) {
      setFormError('Model name is required.')
      return
    }
    if (form.server_id === null) {
      setFormError('Select a server.')
      return
    }
    setFormError('')
    try {
      await createModel.mutateAsync({
        model: form.model.trim(),
        server_id: form.server_id,
        model_weight: parseInt(form.model_weight, 10) || 1,
        default_flag: form.default_flag ? 1 : 0,
      })
      setShowAddForm(false)
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  async function handleUpdate(form: ModelFormState): Promise<void> {
    if (!editingModel) return
    if (!form.model.trim()) {
      setFormError('Model name is required.')
      return
    }
    setFormError('')
    try {
      await updateModel.mutateAsync({
        modelId: editingModel.id,
        updates: {
          model: form.model.trim(),
          model_weight: parseInt(form.model_weight, 10) || 1,
          default_flag: form.default_flag ? 1 : 0,
        },
      })
      setEditingModel(null)
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  async function handleDelete(modelId: number): Promise<void> {
    setDeleteError('')
    try {
      await deleteModel.mutateAsync(modelId)
    } catch (e) {
      setDeleteError((e as Error).message)
    }
  }

  if (isLoading) return <p className="text-sm text-muted">Loading models…</p>
  if (error) return <p className="text-sm text-red">{(error as Error).message}</p>

  const editInitial: ModelFormState = editingModel
    ? {
        model: editingModel.model,
        server_id: editingModel.server_id,
        model_weight: String(editingModel.model_weight),
        default_flag: editingModel.default_flag === 1,
      }
    : EMPTY_MODEL_FORM

  return (
    <section className="mb-10">
      <SectionHeader title="LLM Models" />
      {models.length === 0 ? (
        <p className="text-sm text-muted mb-3">No models configured.</p>
      ) : (
        <div className="mb-3">
          {models.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              onDelete={(id) => void handleDelete(id)}
              onEdit={(m) => {
                setEditingModel(m)
                setShowAddForm(false)
                setFormError('')
              }}
            />
          ))}
        </div>
      )}
      {deleteError && <p className="text-xs font-mono text-red mb-2">{deleteError}</p>}
      {editingModel && (
        <ModelForm
          initial={editInitial}
          isEdit
          editServerName={editingModel.server_name}
          onSave={(form) => void handleUpdate(form)}
          onCancel={() => {
            setEditingModel(null)
            setFormError('')
          }}
          saving={updateModel.isPending}
          error={formError}
        />
      )}
      {!editingModel &&
        (showAddForm ? (
          <ModelForm
            initial={EMPTY_MODEL_FORM}
            onSave={(form) => void handleCreate(form)}
            onCancel={() => {
              setShowAddForm(false)
              setFormError('')
            }}
            saving={createModel.isPending}
            error={formError}
          />
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="text-sm font-mono text-muted border border-dashed border-surface2 rounded px-3 py-1.5 hover:text-accent hover:border-accent/40 transition-colors"
            >
              + Add model
            </button>
            <button
              onClick={() => void checkAvailability.mutateAsync()}
              disabled={checkAvailability.isPending}
              className="text-sm font-mono text-muted border border-dashed border-surface2 rounded px-3 py-1.5 hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {checkAvailability.isPending ? 'Checking…' : 'Check Availability'}
            </button>
          </div>
        ))}
    </section>
  )
}

// ─── System types ─────────────────────────────────────────────────────────────

function SystemTypesSection(): React.JSX.Element {
  const { data: types = [], isLoading, error } = useSystemTypes()
  const addType = useAddSystemType()
  const deleteType = useDeleteSystemType()

  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeValue, setNewTypeValue] = useState('')
  const [addError, setAddError] = useState('')
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({})

  const grouped = types.reduce<Record<string, SystemType[]>>((acc, t) => {
    if (!acc[t.type_name]) acc[t.type_name] = []
    acc[t.type_name].push(t)
    return acc
  }, {})

  const typeNames = Object.keys(grouped)
  const selectedTypeName = newTypeName || typeNames[0] || ''

  async function handleAdd(): Promise<void> {
    if (!selectedTypeName || !newTypeValue.trim()) {
      setAddError('Both type name and value are required.')
      return
    }
    setAddError('')
    try {
      await addType.mutateAsync({
        type_name: selectedTypeName,
        type_value: newTypeValue.trim(),
      })
      setNewTypeValue('')
    } catch (e) {
      setAddError((e as Error).message)
    }
  }

  async function handleDelete(typeId: number): Promise<void> {
    setDeleteErrors((prev) => ({ ...prev, [typeId]: '' }))
    try {
      await deleteType.mutateAsync(typeId)
    } catch (e) {
      setDeleteErrors((prev) => ({ ...prev, [typeId]: (e as Error).message }))
    }
  }

  if (isLoading) return <p className="text-sm text-muted">Loading system types…</p>
  if (error) return <p className="text-sm text-red">{(error as Error).message}</p>

  return (
    <section className="mb-10">
      <SectionHeader title="System Types" />
      <div className="flex gap-8">
        <div className="w-52 shrink-0 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
              Type name
            </label>
            <select
              value={selectedTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
            >
              {typeNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
              Type value
            </label>
            <input
              value={newTypeValue}
              onChange={(e) => setNewTypeValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd()
              }}
              placeholder="custom_note"
              className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={() => void handleAdd()}
            disabled={addType.isPending}
            className="px-3 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            Add
          </button>
          {addError && <p className="text-xs font-mono text-red">{addError}</p>}
        </div>

        <div className="flex-1 space-y-5">
          {Object.entries(grouped).map(([typeName, entries]) => (
            <div key={typeName}>
              <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1.5">
                {typeName}
              </p>
              <div className="space-y-1">
                {entries.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="font-mono text-sm text-text flex-1">{t.type_value}</span>
                    {deleteErrors[t.id] && (
                      <span className="text-xs font-mono text-red">{deleteErrors[t.id]}</span>
                    )}
                    <button
                      onClick={() => void handleDelete(t.id)}
                      className="text-xs font-mono text-muted hover:text-red transition-colors px-1.5 py-0.5 border border-surface2 rounded hover:border-red/40"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Version history ──────────────────────────────────────────────────────────

function VersionHistorySection(): React.JSX.Element {
  const qc = useQueryClient()
  const { data: versions = [], isLoading } = useProfileVersions()
  const restoreVersion = useRestoreVersion()
  const [expanded, setExpanded] = useState(false)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [confirmRestoreId, setConfirmRestoreId] = useState<number | null>(null)
  const [restoreToast, setRestoreToast] = useState('')
  const [restoreError, setRestoreError] = useState('')

  const previewContent = useProfileVersionContent(previewId)

  async function handleRestore(versionId: number, savedAt: string): Promise<void> {
    setRestoreError('')
    try {
      await restoreVersion.mutateAsync(versionId)
      void qc.invalidateQueries({ queryKey: ['jobsearch'] })
      setConfirmRestoreId(null)
      const ts = savedAt.slice(0, 16).replace('T', ' ')
      setRestoreToast(`Restored to ${ts}`)
      setTimeout(() => setRestoreToast(''), 4000)
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Restore failed')
    }
  }

  if (isLoading) return <p className="text-xs font-mono text-muted">Loading version history…</p>

  return (
    <div className="border border-surface2 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-sans text-text hover:bg-surface2/40 transition-colors"
      >
        <span>Version History</span>
        <span className="text-xs font-mono text-muted">
          {expanded ? '▲' : `${versions.length} version${versions.length !== 1 ? 's' : ''} ▼`}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-surface2">
          {restoreToast && (
            <p className="text-xs font-mono text-green px-4 py-2 border-b border-surface2">
              {restoreToast}
            </p>
          )}
          {restoreError && (
            <p className="text-xs font-mono text-red px-4 py-2 border-b border-surface2">
              {restoreError}
            </p>
          )}
          {versions.length === 0 ? (
            <p className="text-xs font-mono text-muted px-4 py-4">No versions saved yet.</p>
          ) : (
            <div className="divide-y divide-surface2 max-h-72 overflow-y-auto">
              {versions.map((v) => (
                <div key={v.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-muted">
                      {v.saved_at.slice(0, 16).replace('T', ' ')}
                    </p>
                    <p className="text-xs font-sans text-text truncate">{v.note || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setPreviewId(v.id)}
                      className="text-xs font-mono px-2 py-0.5 border border-surface2 rounded text-muted hover:text-accent hover:border-accent/40 transition-colors"
                    >
                      Preview
                    </button>
                    {confirmRestoreId === v.id ? (
                      <>
                        <button
                          onClick={() => void handleRestore(v.id, v.saved_at)}
                          disabled={restoreVersion.isPending}
                          className="text-xs font-mono px-2 py-0.5 border border-accent/40 rounded text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                        >
                          {restoreVersion.isPending ? '…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmRestoreId(null)}
                          className="text-xs font-mono px-2 py-0.5 border border-surface2 rounded text-muted hover:text-text transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmRestoreId(v.id)}
                        className="text-xs font-mono px-2 py-0.5 border border-surface2 rounded text-muted hover:text-text hover:border-accent/40 transition-colors"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {previewId !== null && (
        <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-surface2 rounded-lg w-full max-w-2xl flex flex-col gap-4 max-h-[80vh] p-6">
            <div className="flex items-center justify-between">
              <p className="font-serif text-accent text-base">Version Preview</p>
              <button
                onClick={() => setPreviewId(null)}
                className="text-xs font-mono text-muted hover:text-text px-2 py-0.5 border border-surface2 rounded hover:border-accent/40 transition-colors"
              >
                Close
              </button>
            </div>
            {previewContent.isLoading ? (
              <p className="text-xs font-mono text-muted">Loading…</p>
            ) : (
              <pre className="flex-1 overflow-y-auto text-xs font-mono text-text bg-surface2 rounded p-4 whitespace-pre-wrap break-words leading-relaxed">
                {previewContent.data?.content ?? ''}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── My Data editors ──────────────────────────────────────────────────────────

function JobsearchSection(): React.JSX.Element {
  const { data: current, isLoading } = useJobsearch()
  const saveJobsearch = useSaveJobsearch()
  const { refetch: loadBackup, isFetching: loadingBackup } = useJobsearchBackup()

  const [content, setContent] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [savedMsg, setSavedMsg] = useState(false)

  const displayContent = content ?? current?.content ?? ''

  async function handleSave(): Promise<void> {
    setSaveError('')
    setSavedMsg(false)
    try {
      await saveJobsearch.mutateAsync({ content: displayContent })
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 3000)
      setContent(null)
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }

  async function handleLoadBackup(): Promise<void> {
    const result = await loadBackup()
    if (result.data) setContent(result.data.content)
  }

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <section className="mb-8">
      <SectionHeader title="Job Search Context" />
      <div className="flex flex-col gap-3">
        <textarea
          value={displayContent}
          onChange={(e) => setContent(e.target.value)}
          rows={24}
          spellCheck={false}
          className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 resize-y w-full"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => void handleSave()}
            disabled={saveJobsearch.isPending}
            className="px-4 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {saveJobsearch.isPending ? 'Saving…' : 'Save'}
          </button>
          {current?.has_backup && (
            <button
              onClick={() => void handleLoadBackup()}
              disabled={loadingBackup}
              className="px-3 py-1.5 text-sm font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {loadingBackup ? 'Loading…' : 'Load backup'}
            </button>
          )}
          {savedMsg && <span className="text-xs font-mono text-green">Saved.</span>}
          {saveError && <span className="text-xs font-mono text-red">{saveError}</span>}
        </div>
        <VersionHistorySection />
      </div>
    </section>
  )
}

function ResumeTemplateSection(): React.JSX.Element {
  const { data: current, isLoading, error } = useResumeTemplate()
  const saveTemplate = useSaveResumeTemplate()
  const { refetch: loadBackup, isFetching: loadingBackup } = useResumeTemplateBackup()

  const [content, setContent] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [savedMsg, setSavedMsg] = useState(false)

  const displayContent = content ?? current?.content ?? ''

  async function handleSave(): Promise<void> {
    setSaveError('')
    setSavedMsg(false)
    try {
      await saveTemplate.mutateAsync({ content: displayContent })
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 3000)
      setContent(null)
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }

  async function handleLoadBackup(): Promise<void> {
    const result = await loadBackup()
    if (result.data) setContent(result.data.content)
  }

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>
  if (error) return <p className="text-sm text-red">{(error as Error).message}</p>

  return (
    <section className="mb-8">
      <SectionHeader title="Resume Template" />
      <div className="flex flex-col gap-3">
        <textarea
          value={displayContent}
          onChange={(e) => setContent(e.target.value)}
          rows={24}
          spellCheck={false}
          className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 resize-y w-full"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => void handleSave()}
            disabled={saveTemplate.isPending}
            className="px-4 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {saveTemplate.isPending ? 'Saving…' : 'Save'}
          </button>
          {current?.has_backup && (
            <button
              onClick={() => void handleLoadBackup()}
              disabled={loadingBackup}
              className="px-3 py-1.5 text-sm font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {loadingBackup ? 'Loading…' : 'Load backup'}
            </button>
          )}
          {savedMsg && <span className="text-xs font-mono text-green">Saved.</span>}
          {saveError && <span className="text-xs font-mono text-red">{saveError}</span>}
        </div>
      </div>
    </section>
  )
}

// ─── App settings ─────────────────────────────────────────────────────────────

function AppSettingsSection(): React.JSX.Element {
  const { data: settings = [], isLoading, error } = useAppSettings()
  const patch = usePatchAppSetting()
  const [patchError, setPatchError] = useState('')

  async function handleToggle(key: string, current: string): Promise<void> {
    setPatchError('')
    try {
      await patch.mutateAsync({ key, value: current === '1' ? '0' : '1' })
    } catch (e) {
      setPatchError((e as Error).message)
    }
  }

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>
  if (error) return <p className="text-sm text-red">{(error as Error).message}</p>

  const auditSetting = settings.find((s) => s.key === 'allow_audit_timestamp_edit')
  const auditEnabled = auditSetting?.value === '1'

  return (
    <section className="mb-10">
      <SectionHeader title="Application Settings" />
      <div className="space-y-4">
        <div className="flex items-center justify-between max-w-sm bg-surface2 rounded-lg px-4 py-3">
          <div>
            <p className="text-sm font-sans text-text">Allow Audit Timestamp Edit</p>
            <p className="text-xs font-mono text-muted mt-0.5">
              Enables editing timestamps on system audit log entries
            </p>
          </div>
          <button
            onClick={() =>
              void handleToggle('allow_audit_timestamp_edit', auditSetting?.value ?? '0')
            }
            disabled={patch.isPending || !auditSetting}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              auditEnabled ? 'bg-accent' : 'bg-surface'
            }`}
            role="switch"
            aria-checked={auditEnabled}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
                auditEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        {patchError && <p className="text-xs font-mono text-red">{patchError}</p>}
      </div>
    </section>
  )
}

// ─── System info ──────────────────────────────────────────────────────────────

function InfoSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  if (!settings) return <></>

  return (
    <section className="mb-10">
      <SectionHeader title="System Info" />
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <div className="bg-surface2 rounded p-3">
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Version</p>
          <p className="font-mono text-sm text-text">{settings.app_version}</p>
        </div>
        <div className="bg-surface2 rounded p-3">
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Schema</p>
          <p className="font-mono text-sm text-text">{settings.schema_version}</p>
        </div>
        <div className="bg-surface2 rounded p-3">
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">
            Anthropic key
          </p>
          <p
            className={`font-mono text-sm ${settings.anthropic_api_key_configured ? 'text-green' : 'text-muted'}`}
          >
            {settings.anthropic_api_key_configured ? 'configured' : 'not set'}
          </p>
        </div>
      </div>
    </section>
  )
}

// ─── Document storage ─────────────────────────────────────────────────────────

function DocumentStorageSection(): React.JSX.Element {
  const { data, isLoading, error } = useDocumentsStorage()

  return (
    <section className="mb-10">
      <SectionHeader title="Document Storage" />
      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-red">{(error as Error).message}</p>}
      {data && (
        <div className="space-y-4 max-w-sm">
          <div className="bg-surface2 rounded-lg px-4 py-3 space-y-1">
            <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">Typst</p>
            {data.typst_available ? (
              <>
                <p className="text-sm font-mono text-green">● Available</p>
                <p className="text-xs font-mono text-muted">
                  Binary: <span className="text-text">{data.typst_binary}</span>
                </p>
              </>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-mono text-red">✗ Not found — compile disabled</p>
                <p className="text-xs font-mono text-muted">
                  Install: <span className="text-text">brew install typst</span> (macOS)
                </p>
                <p className="text-xs font-mono text-muted">
                  {'         '}<span className="text-text">snap install typst</span> (Linux)
                </p>
                <p className="text-xs font-mono text-muted">
                  Restart the server after installing.
                </p>
              </div>
            )}
          </div>

          <div className="bg-surface2 rounded-lg px-4 py-3 space-y-1">
            <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">
              Generated files
            </p>
            {data.file_count === 0 && data.total_bytes === 0 ? (
              <p className="text-sm font-mono text-muted">No generated files yet.</p>
            ) : (
              <>
                <p className="text-sm font-mono text-text">
                  {data.file_count} {data.file_count === 1 ? 'file' : 'files'} · {data.total_mb} MB
                </p>
                <p className="text-xs font-mono text-muted">{data.generated_dir}</p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'app-settings' | 'system-types' | 'servers' | 'models' | 'my-data' | 'storage' | 'info'

const TABS: { id: Tab; label: string }[] = [
  { id: 'app-settings', label: 'App Settings' },
  { id: 'system-types', label: 'System Types' },
  { id: 'servers', label: 'AI Servers' },
  { id: 'models', label: 'Models' },
  { id: 'my-data', label: 'My Data' },
  { id: 'storage', label: 'Storage' },
  { id: 'info', label: 'System Info' },
]

export default function Settings(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('app-settings')

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Settings" />
      <div className="flex flex-1 overflow-hidden">
      <div className="w-44 shrink-0 border-r border-surface2 flex flex-col py-4 px-3 gap-0.5">
        <p className="font-serif text-accent text-base mb-3 px-2">Settings</p>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-2 py-1.5 rounded text-sm text-left transition-colors ${
              activeTab === id
                ? 'bg-surface2 text-accent'
                : 'text-muted hover:text-text hover:bg-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activeTab === 'app-settings' && <AppSettingsSection />}
        {activeTab === 'system-types' && <SystemTypesSection />}
        {activeTab === 'servers' && <ServersSection />}
        {activeTab === 'models' && <ModelsSection />}
        {activeTab === 'my-data' && (
          <>
            <JobsearchSection />
            <hr className="border-surface2 my-8" />
            <ResumeTemplateSection />
          </>
        )}
        {activeTab === 'storage' && <DocumentStorageSection />}
        {activeTab === 'info' && <InfoSection />}
      </div>
      </div>
    </div>
  )
}
