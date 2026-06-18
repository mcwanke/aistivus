import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModelSelect from './ModelSelect'
import type { LlmModel } from '@/types/api'

const makeModel = (overrides: Partial<LlmModel>): LlmModel => ({
  id: 1,
  model: 'llama3',
  server_id: 1,
  server_name: 'Local Ollama',
  server_type: 'ollama',
  endpoint: 'http://localhost:11434',
  available: 1,
  default_flag: 0,
  model_weight: 1,
  estimated_eval_time: 30,
  created_at: '2024-01-01T00:00:00',
  ...overrides,
})

const MODEL_A = makeModel({ id: 1, model: 'llama3', server_name: 'Server A' })
const MODEL_B = makeModel({ id: 2, model: 'mistral', server_name: 'Server B' })
const MODEL_UNAVAIL = makeModel({ id: 3, model: 'big-model', server_name: 'Server A', available: 0 })

describe('ModelSelect', () => {
  it('renders all model options', () => {
    render(
      <ModelSelect models={[MODEL_A, MODEL_B]} value={1} onChange={vi.fn()} />
    )
    expect(screen.getByRole('option', { name: 'llama3' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'mistral' })).toBeInTheDocument()
  })

  it('groups options by server name', () => {
    render(
      <ModelSelect models={[MODEL_A, MODEL_B]} value={1} onChange={vi.fn()} />
    )
    expect(screen.getByRole('group', { name: 'Server A' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Server B' })).toBeInTheDocument()
  })

  it('disables unavailable models', () => {
    render(
      <ModelSelect models={[MODEL_A, MODEL_UNAVAIL]} value={1} onChange={vi.fn()} />
    )
    const unavailOption = screen.getByRole('option', { name: /big-model/ })
    expect(unavailOption).toBeDisabled()
  })

  it('calls onChange with model id on select', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ModelSelect models={[MODEL_A, MODEL_B]} value={1} onChange={onChange} />
    )
    await user.selectOptions(screen.getByRole('combobox'), '2')
    expect(onChange).toHaveBeenCalledWith(2)
  })
})
