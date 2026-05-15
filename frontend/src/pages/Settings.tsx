import { useState } from 'react'
import type { LlmModel, SystemType } from '@/types/api'
import {
  useSettings,
  useLlmModels,
  useCreateModel,
  useUpdateModel,
  useSetDefaultModel,
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
  type CreateModelPayload,
} from '@/hooks/useSettings'
import { useAppSettings, usePatchAppSetting } from '@/hooks/useApplications'

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <h2 className="font-serif text-accent text-lg border-b border-surface2 pb-2 mb-4">
      {title}
    </h2>
  )
}

// ─── Model management ─────────────────────────────────────────────────────────

type ModelFormState = {
  model: string
  endpoint: string
  model_weight: string
  estimated_eval_time: string
}

const EMPTY_MODEL_FORM: ModelFormState = {
  model: '',
  endpoint: '',
  model_weight: '1',
  estimated_eval_time: '',
}

function ModelRow({
  model,
  onSetDefault,
  onDelete,
  onEdit,
  onToggleEnabled,
}: {
  model: LlmModel
  onSetDefault: (id: number) => void
  onDelete: (id: number) => void
  onEdit: (model: LlmModel) => void
  onToggleEnabled: (id: number, enabled: number) => void
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
              model.enabled === 0
                ? 'bg-surface2 text-muted border-surface2'
                : model.available === 1
                ? 'bg-green/10 text-green border-green/30'
                : 'bg-red/10 text-red border-red/30'
            }`}
          >
            {model.enabled === 0
              ? 'disabled'
              : model.available === 1
              ? 'available'
              : 'unreachable'}
          </span>
        </div>
        <p className="font-mono text-xs text-muted mt-0.5 truncate">{model.endpoint}</p>
        <p className="font-mono text-xs text-muted/60 mt-0.5">
          weight: {model.model_weight}
          {model.estimated_eval_time != null
            ? ` · est. ${model.estimated_eval_time}s`
            : ''}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(model)}
          className="px-2 py-1 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
        >
          Edit
        </button>
        {model.default_flag !== 1 && (
          <button
            onClick={() => onSetDefault(model.id)}
            className="px-2 py-1 text-xs font-mono text-muted border border-surface2 rounded hover:text-accent hover:border-accent/40 transition-colors"
          >
            Set default
          </button>
        )}
        <button
          onClick={() => onDelete(model.id)}
          className="px-2 py-1 text-xs font-mono text-muted border border-surface2 rounded hover:text-red hover:border-red/40 transition-colors"
        >
          Delete
        </button>
                <button
          onClick={() => onToggleEnabled(model.id, model.enabled === 1 ? 0 : 1)}
          className={`px-2 py-1 text-xs font-mono border rounded transition-colors ${
            model.enabled === 1
              ? 'text-muted border-surface2 hover:text-red hover:border-red/40'
              : 'text-accent border-accent/40 hover:bg-accent/10'
          }`}
        >
          {model.enabled === 1 ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  )
}

function ModelForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: ModelFormState
  onSave: (form: ModelFormState) => void
  onCancel: () => void
  saving: boolean
  error: string
}): React.JSX.Element {
  const [form, setForm] = useState<ModelFormState>(initial)
  const set = (k: keyof ModelFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="bg-surface2 border border-surface2 rounded-lg p-4 space-y-3 mt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Model name</label>
          <input
            value={form.model}
            onChange={set('model')}
            placeholder="llama3.1:8b"
            className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Endpoint</label>
          <input
            value={form.endpoint}
            onChange={set('endpoint')}
            placeholder="http://localhost:11434 (optional for external models)"
            className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Weight</label>
          <input
            type="number"
            value={form.model_weight}
            onChange={set('model_weight')}
            min="1"
            className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Est. eval time (s)
          </label>
          <input
            type="number"
            value={form.estimated_eval_time}
            onChange={set('estimated_eval_time')}
            placeholder="leave blank if unknown"
            className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>
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
          disabled={saving}
          className="px-3 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

type OllamaModel = { name: string }

function QueryEndpointModal({
  existingModels,
  onAdd,
  onClose,
}: {
  existingModels: LlmModel[]
  onAdd: (model: string, endpoint: string) => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [querying, setQuerying] = useState(false)
  const [queryError, setQueryError] = useState('')
  const [results, setResults] = useState<OllamaModel[] | null>(null)
  const [adding, setAdding] = useState<Record<string, boolean>>({})
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})

  const normalizedUrl = url.trim().replace(/\/$/, '')

  function isAlreadyAdded(modelName: string): boolean {
    return existingModels.some(
      (m) => m.model === modelName && m.endpoint === normalizedUrl,
    )
  }

  async function handleQuery(): Promise<void> {
    if (!normalizedUrl) return
    setQuerying(true)
    setQueryError('')
    setResults(null)
    try {
      const res = await fetch(`${normalizedUrl}/api/tags`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { models?: OllamaModel[] }
      const found = data.models ?? []
      if (found.length === 0) {
        setQueryError('No models found at this endpoint.')
      } else {
        setResults(found)
      }
    } catch {
      setQueryError('Could not reach an Ollama service at this endpoint.')
    } finally {
      setQuerying(false)
    }
  }

  async function handleAdd(modelName: string): Promise<void> {
    setAdding((prev) => ({ ...prev, [modelName]: true }))
    setAddErrors((prev) => ({ ...prev, [modelName]: '' }))
    try {
      await onAdd(modelName, normalizedUrl)
    } catch (e) {
      setAddErrors((prev) => ({ ...prev, [modelName]: (e as Error).message }))
    } finally {
      setAdding((prev) => ({ ...prev, [modelName]: false }))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-surface2 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif text-accent text-base">Query Endpoint</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition-colors font-mono text-sm px-2 py-0.5 border border-surface2 rounded hover:border-accent/40"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleQuery() }}
            placeholder="http://localhost:11434"
            className="flex-1 bg-surface2 border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={() => void handleQuery()}
            disabled={querying || !url.trim()}
            className="px-3 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50 shrink-0"
          >
            {querying ? 'Querying…' : 'Query'}
          </button>
        </div>

        {queryError && (
          <p className="text-xs font-mono text-red mb-3">{queryError}</p>
        )}

        {results !== null && (
          <div className="border border-surface2 rounded-lg overflow-hidden">
            <p className="text-[10px] font-mono text-muted uppercase tracking-wider px-3 py-2 bg-surface2/50 border-b border-surface2">
              {results.length} model{results.length !== 1 ? 's' : ''} found
            </p>
            <div className="divide-y divide-surface2 max-h-64 overflow-y-auto">
              {results.map((m) => {
                const added = isAlreadyAdded(m.name)
                return (
                  <div key={m.name} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="font-mono text-sm text-text flex-1 truncate">{m.name}</span>
                    {addErrors[m.name] && (
                      <span className="text-xs font-mono text-red">{addErrors[m.name]}</span>
                    )}
                    {added ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface2 text-muted border border-surface2">
                        added
                      </span>
                    ) : (
                      <button
                        onClick={() => void handleAdd(m.name)}
                        disabled={adding[m.name]}
                        className="text-xs font-mono px-2 py-0.5 rounded border border-accent/40 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                      >
                        {adding[m.name] ? '…' : '+'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ModelsSection(): React.JSX.Element {
  const { data: models = [], isLoading, error } = useLlmModels()
  const createModel = useCreateModel()
  const updateModel = useUpdateModel()
  const setDefault = useSetDefaultModel()
  const deleteModel = useDeleteModel()
  const checkAvailability = useCheckAvailability()

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingModel, setEditingModel] = useState<LlmModel | null>(null)
  const [formError, setFormError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [showQueryModal, setShowQueryModal] = useState(false)

  function formToPayload(form: ModelFormState): CreateModelPayload {
    return {
      model: form.model.trim(),
      endpoint: form.endpoint.trim(),
      model_weight: parseInt(form.model_weight, 10) || 1,
      estimated_eval_time: form.estimated_eval_time.trim()
        ? parseInt(form.estimated_eval_time, 10)
        : null,
    }
  }

  async function handleCreate(form: ModelFormState): Promise<void> {
    if (!form.model.trim()) {
      setFormError('Model name is required.')
      return
    }
    setFormError('')
    try {
      await createModel.mutateAsync(formToPayload(form))
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
        updates: formToPayload(form),
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
        endpoint: editingModel.endpoint,
        model_weight: String(editingModel.model_weight),
        estimated_eval_time:
          editingModel.estimated_eval_time != null
            ? String(editingModel.estimated_eval_time)
            : '',
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
              onSetDefault={(id) => void setDefault.mutateAsync(id)}
              onDelete={(id) => void handleDelete(id)}
              onEdit={(m) => {
                setEditingModel(m)
                setShowAddForm(false)
                setFormError('')
              }}
              onToggleEnabled={(id, enabled) =>
                void updateModel.mutateAsync({ modelId: id, updates: { enabled } })
              }
            />
          ))}
        </div>
      )}
      {deleteError && <p className="text-xs font-mono text-red mb-2">{deleteError}</p>}
      {editingModel && (
        <ModelForm
          initial={editInitial}
          onSave={(form) => void handleUpdate(form)}
          onCancel={() => { setEditingModel(null); setFormError('') }}
          saving={updateModel.isPending}
          error={formError}
        />
      )}
      {!editingModel && (
        showAddForm ? (
          <ModelForm
            initial={EMPTY_MODEL_FORM}
            onSave={(form) => void handleCreate(form)}
            onCancel={() => { setShowAddForm(false); setFormError('') }}
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
              onClick={() => setShowQueryModal(true)}
              className="text-sm font-mono text-muted border border-dashed border-surface2 rounded px-3 py-1.5 hover:text-accent hover:border-accent/40 transition-colors"
            >
              Query Endpoint
            </button>
            <button
              onClick={() => void checkAvailability.mutateAsync()}
              disabled={checkAvailability.isPending}
              className="text-sm font-mono text-muted border border-dashed border-surface2 rounded px-3 py-1.5 hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {checkAvailability.isPending ? 'Checking…' : 'Check Availability'}
            </button>
          </div>
        )
      )}
      {showQueryModal && (
        <QueryEndpointModal
          existingModels={models}
          onAdd={async (modelName, endpoint) => {
            await createModel.mutateAsync({
              model: modelName,
              endpoint,
              model_weight: 1,
              estimated_eval_time: null,
            })
          }}
          onClose={() => setShowQueryModal(false)}
        />
      )}
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
        {/* Add form */}
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
                <option key={name} value={name}>{name}</option>
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
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
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

        {/* Type lists */}
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

// ─── My Data editors ─────────────────────────────────────────────────────────

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
            onClick={() => void handleToggle('allow_audit_timestamp_edit', auditSetting?.value ?? '0')}
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

// ─── Info section ─────────────────────────────────────────────────────────────

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
          <p className={`font-mono text-sm ${settings.anthropic_api_key_configured ? 'text-green' : 'text-muted'}`}>
            {settings.anthropic_api_key_configured ? 'configured' : 'not set'}
          </p>
        </div>
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'app-settings' | 'system-types' | 'models' | 'my-data' | 'info'

const TABS: { id: Tab; label: string }[] = [
  { id: 'app-settings', label: 'App Settings' },
  { id: 'system-types', label: 'System Types' },
  { id: 'models', label: 'Models' },
  { id: 'my-data', label: 'My Data' },
  { id: 'info', label: 'System Info' },
]

export default function Settings(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('app-settings')

  return (
    <div className="flex h-full overflow-hidden">
      {/* Tab sidebar */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activeTab === 'app-settings' && <AppSettingsSection />}
        {activeTab === 'system-types' && <SystemTypesSection />}
        {activeTab === 'models' && <ModelsSection />}
        {activeTab === 'my-data' && (
          <>
            <JobsearchSection />
            <hr className="border-surface2 my-8" />
            <ResumeTemplateSection />
          </>
        )}
        {activeTab === 'info' && <InfoSection />}
      </div>
    </div>
  )
}
