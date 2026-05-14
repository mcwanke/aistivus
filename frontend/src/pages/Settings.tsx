import { useState } from 'react'
import type { LlmModel, SystemType, JobsearchVersion } from '@/types/api'
import {
  useSettings,
  useLlmModels,
  useCreateModel,
  useUpdateModel,
  useSetDefaultModel,
  useDeleteModel,
  useSystemTypes,
  useAddSystemType,
  useDeleteSystemType,
  useJobsearch,
  useSaveJobsearch,
  useJobsearchVersions,
  useJobsearchVersionContent,
  type CreateModelPayload,
} from '@/hooks/useSettings'

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
}: {
  model: LlmModel
  onSetDefault: (id: number) => void
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
            {model.available === 1 ? 'available' : 'unavailable'}
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
            placeholder="http://localhost:11434"
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

function ModelsSection(): React.JSX.Element {
  const { data: models = [], isLoading, error } = useLlmModels()
  const createModel = useCreateModel()
  const updateModel = useUpdateModel()
  const setDefault = useSetDefaultModel()
  const deleteModel = useDeleteModel()

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingModel, setEditingModel] = useState<LlmModel | null>(null)
  const [formError, setFormError] = useState('')
  const [deleteError, setDeleteError] = useState('')

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
    if (!form.model.trim() || !form.endpoint.trim()) {
      setFormError('Model name and endpoint are required.')
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
    if (!form.model.trim() || !form.endpoint.trim()) {
      setFormError('Model name and endpoint are required.')
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
          <button
            onClick={() => setShowAddForm(true)}
            className="text-sm font-mono text-muted border border-dashed border-surface2 rounded px-3 py-1.5 hover:text-accent hover:border-accent/40 transition-colors"
          >
            + Add model
          </button>
        )
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

  async function handleAdd(): Promise<void> {
    if (!newTypeName.trim() || !newTypeValue.trim()) {
      setAddError('Both type name and value are required.')
      return
    }
    setAddError('')
    try {
      await addType.mutateAsync({
        type_name: newTypeName.trim(),
        type_value: newTypeValue.trim(),
      })
      setNewTypeName('')
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
      <div className="space-y-5 mb-5">
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

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Type name
          </label>
          <input
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="application_log"
            className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50 w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
            Type value
          </label>
          <input
            value={newTypeValue}
            onChange={(e) => setNewTypeValue(e.target.value)}
            placeholder="custom_note"
            className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-mono text-text focus:outline-none focus:border-accent/50 w-44"
          />
        </div>
        <button
          onClick={() => void handleAdd()}
          disabled={addType.isPending}
          className="px-3 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {addError && <p className="text-xs font-mono text-red mt-2">{addError}</p>}
    </section>
  )
}

// ─── jobsearch.md editor ──────────────────────────────────────────────────────

function JobsearchSection(): React.JSX.Element {
  const { data: current, isLoading } = useJobsearch()
  const { data: versions = [] } = useJobsearchVersions()
  const saveJobsearch = useSaveJobsearch()

  const [content, setContent] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedMsg, setSavedMsg] = useState(false)

  const [previewVersionId, setPreviewVersionId] = useState<number | null>(null)
  const { data: previewData } = useJobsearchVersionContent(previewVersionId)

  const displayContent = content ?? current?.content ?? ''

  async function handleSave(): Promise<void> {
    setSaveError('')
    setSavedMsg(false)
    try {
      await saveJobsearch.mutateAsync({ content: displayContent, note: saveNote || undefined })
      setSaveNote('')
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 3000)
      setContent(null)
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }

  async function handleRestore(): Promise<void> {
    if (!previewData) return
    setContent(previewData.content)
    setPreviewVersionId(null)
  }

  if (isLoading) return <p className="text-sm text-muted">Loading jobsearch.md…</p>

  return (
    <section className="mb-10">
      <SectionHeader title="jobsearch.md" />

      <div className="flex gap-4">
        {/* Editor */}
        <div className="flex-1 flex flex-col gap-3">
          <textarea
            value={displayContent}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            spellCheck={false}
            className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50 resize-y w-full"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={saveNote}
              onChange={(e) => setSaveNote(e.target.value)}
              placeholder="Version note (optional)"
              className="bg-surface border border-surface2 rounded px-3 py-1.5 text-sm font-sans text-text focus:outline-none focus:border-accent/50 flex-1 min-w-0 max-w-xs"
            />
            <button
              onClick={() => void handleSave()}
              disabled={saveJobsearch.isPending}
              className="px-4 py-1.5 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {saveJobsearch.isPending ? 'Saving…' : 'Save'}
            </button>
            {savedMsg && (
              <span className="text-xs font-mono text-green">Saved.</span>
            )}
            {saveError && (
              <span className="text-xs font-mono text-red">{saveError}</span>
            )}
          </div>
        </div>

        {/* Version history */}
        <div className="w-52 shrink-0 flex flex-col gap-2">
          <p className="text-[10px] font-mono text-muted uppercase tracking-wider">Version history</p>
          {versions.length === 0 ? (
            <p className="text-xs text-muted">No saved versions.</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() =>
                    setPreviewVersionId(previewVersionId === v.id ? null : v.id)
                  }
                  className={`w-full text-left px-2 py-1.5 rounded text-xs border transition-colors ${
                    previewVersionId === v.id
                      ? 'border-accent/50 text-accent bg-accent/5'
                      : 'border-surface2 text-muted hover:text-text hover:border-accent/30'
                  }`}
                >
                  <p className="font-mono">{v.saved_at.slice(0, 16).replace('T', ' ')}</p>
                  {v.note && <p className="text-muted/70 truncate mt-0.5">{v.note}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Version preview panel */}
      {previewVersionId !== null && previewData && (
        <div className="mt-4 border border-accent/30 rounded-lg p-4 bg-accent/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-mono text-accent uppercase tracking-wider">
              Version preview
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void handleRestore()}
                className="text-xs font-mono text-accent border border-accent/40 px-2 py-1 rounded hover:bg-accent/10 transition-colors"
              >
                Restore this version
              </button>
              <button
                onClick={() => setPreviewVersionId(null)}
                className="text-xs font-mono text-muted border border-surface2 px-2 py-1 rounded hover:text-text transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono text-muted whitespace-pre-wrap max-h-64 overflow-y-auto">
            {previewData.content}
          </pre>
        </div>
      )}
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

type Tab = 'models' | 'system-types' | 'jobsearch' | 'info'

const TABS: { id: Tab; label: string }[] = [
  { id: 'models', label: 'Models' },
  { id: 'system-types', label: 'System Types' },
  { id: 'jobsearch', label: 'jobsearch.md' },
  { id: 'info', label: 'System Info' },
]

export default function Settings(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('models')

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
        {activeTab === 'models' && <ModelsSection />}
        {activeTab === 'system-types' && <SystemTypesSection />}
        {activeTab === 'jobsearch' && <JobsearchSection />}
        {activeTab === 'info' && <InfoSection />}
      </div>
    </div>
  )
}
