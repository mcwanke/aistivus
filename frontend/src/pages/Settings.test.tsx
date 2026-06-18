import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import Settings from './Settings'

describe('Settings page', () => {
  it('renders the Settings label', () => {
    renderWithProviders(<Settings />)
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0)
  })

  it('renders tab navigation', () => {
    renderWithProviders(<Settings />)
    expect(screen.getByRole('button', { name: 'Models' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'System Types' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My Data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'System Info' })).toBeInTheDocument()
  })

  it('shows App Settings section by default', async () => {
    renderWithProviders(<Settings />)
    await waitFor(() => expect(screen.getByText('Application Settings')).toBeInTheDocument())
    expect(screen.getByText('Allow Audit Timestamp Edit')).toBeInTheDocument()
  })

  it('switches to System Types tab on click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'System Types' }))
    await waitFor(() => expect(screen.getByText('general')).toBeInTheDocument())
  })

  it('switches to My Data tab on click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'My Data' }))
    await waitFor(() => expect(screen.getByText(/My Job Search/)).toBeInTheDocument())
  })
})

describe('Settings page — AI Servers tab', () => {
  async function openServersTab() {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'AI Servers' }))
    return user
  }

  it('renders the AI Servers tab button', () => {
    renderWithProviders(<Settings />)
    expect(screen.getByRole('button', { name: 'AI Servers' })).toBeInTheDocument()
  })

  it('shows server table with column headers after switching to tab', async () => {
    await openServersTab()
    await waitFor(() => expect(screen.getByText('Server Name')).toBeInTheDocument())
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Endpoint')).toBeInTheDocument()
  })

  it('renders server names from API response', async () => {
    await openServersTab()
    await waitFor(() => expect(screen.getByText('Local Ollama')).toBeInTheDocument())
    expect(screen.getByText('Anthropic Claude')).toBeInTheDocument()
  })

  it('renders Ollama and Anthropic type badges', async () => {
    await openServersTab()
    await waitFor(() => expect(screen.getByText('Ollama')).toBeInTheDocument())
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
  })

  it('delete button is disabled when model_count > 0', async () => {
    await openServersTab()
    // Local Ollama has model_count: 1 — its Delete button must be disabled
    await waitFor(() => expect(screen.getByText('Local Ollama')).toBeInTheDocument())
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    // First row is Local Ollama with model_count: 1
    expect(deleteButtons[0]).toBeDisabled()
  })

  it('delete button is enabled when model_count is 0', async () => {
    await openServersTab()
    // Anthropic Claude has model_count: 0
    await waitFor(() => expect(screen.getByText('Anthropic Claude')).toBeInTheDocument())
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    // Second row is Anthropic Claude with model_count: 0
    expect(deleteButtons[1]).not.toBeDisabled()
  })

  it('anthropic row shows API key status indicator', async () => {
    await openServersTab()
    await waitFor(() => expect(screen.getByText('Anthropic Claude')).toBeInTheDocument())
    // anthropic_key_present: false in default mock → "Not set"
    expect(screen.getByText(/Not set/)).toBeInTheDocument()
  })

  it('anthropic row shows key set indicator when key is present', async () => {
    server.use(
      http.get('/api/v1/settings/llm-servers', () =>
        HttpResponse.json({
          servers: [
            {
              id: 2,
              server_name: 'Anthropic Claude',
              endpoint: null,
              server_type: 'anthropic',
              created_at: '2024-01-01T00:00:00',
              model_count: 0,
              anthropic_key_present: true,
            },
          ],
        }),
      ),
      http.get('/api/v1/settings/anthropic-key', () =>
        HttpResponse.json({ anthropic_key_present: true }),
      ),
    )
    await openServersTab()
    await waitFor(() => expect(screen.getByText('Anthropic Claude')).toBeInTheDocument())
    expect(screen.getByText(/✓ Set/)).toBeInTheDocument()
  })

  it('"+ Add AI/Server" button is present', async () => {
    await openServersTab()
    await waitFor(() => expect(screen.getByText('Local Ollama')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument()
  })

  it('clicking "+ Add AI/Server" opens the modal', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByText('Add AI Server')).toBeInTheDocument())
  })

  it('add server modal shows Local tab with name and endpoint fields', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByText('Add AI Server')).toBeInTheDocument())
    expect(screen.getByPlaceholderText(/192\.168/)).toBeInTheDocument()
  })

  it('add server modal has Anthropic option in type dropdown', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByText('Add AI Server')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'Anthropic' })).toBeInTheDocument()
  })

  it('switching to Anthropic in type dropdown shows API key status', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByText('Add AI Server')).toBeInTheDocument())
    const typeSelect = screen.getByRole('combobox')
    await user.selectOptions(typeSelect, 'anthropic')
    await waitFor(() =>
      expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument()
    )
  })

  it('"Detect & Test" button is present for ollama server type', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByText('Add AI Server')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Detect & Test' })).toBeInTheDocument()
  })

  it('detect & test shows detected type inline after click', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Detect & Test' })).toBeInTheDocument())
    const nameInput = screen.getByPlaceholderText('Home Lab')
    const endpointInput = screen.getByPlaceholderText('http://192.168.1.10:11434')
    await user.type(nameInput, 'Test Lab')
    await user.type(endpointInput, 'http://localhost:11434')
    await user.click(screen.getByRole('button', { name: 'Detect & Test' }))
    await waitFor(() =>
      expect(screen.getByText(/Detected:/)).toBeInTheDocument()
    )
  })
})

describe('Settings page — Models tab server selector', () => {
  async function openAddModelForm() {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'Models' }))
    await waitFor(() => expect(screen.getByText('LLM Models')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add model' }))
    return user
  }

  it('Add Model form renders a server selector with server names as options', async () => {
    await openAddModelForm()
    await waitFor(() => {
      expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0)
    })
  })

  it('Add Model form includes both local and anthropic server options', async () => {
    await openAddModelForm()
    await waitFor(() => {
      expect(screen.getAllByRole('option', { name: /Anthropic Claude/ }).length).toBeGreaterThan(0)
    })
  })

  it('model name dropdown shows "select a server first" when no server is selected', async () => {
    await openAddModelForm()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '— select a server first —' })).toBeInTheDocument()
    })
  })

  it('model name dropdown populates with available models after selecting a server', async () => {
    const user = await openAddModelForm()
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0))
    const serverSelect = screen.getAllByRole('combobox')[1]
    await user.selectOptions(serverSelect, '1')
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'llama3:8b' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'mistral:7b' })).toBeInTheDocument()
    })
  })

  it('refresh button appears after selecting a server', async () => {
    const user = await openAddModelForm()
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0))
    const serverSelect = screen.getAllByRole('combobox')[1]
    await user.selectOptions(serverSelect, '1')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '↺ Refresh' })).toBeInTheDocument()
    })
  })

  it('refresh button is absent when no server is selected', async () => {
    await openAddModelForm()
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: '↺ Refresh' })).not.toBeInTheDocument()
  })

  it('Save button is disabled until a model is selected', async () => {
    const user = await openAddModelForm()
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0))
    const serverSelect = screen.getAllByRole('combobox')[1]
    await user.selectOptions(serverSelect, '1')
    await waitFor(() => expect(screen.getByRole('option', { name: 'llama3:8b' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Save button is enabled after selecting a model', async () => {
    const user = await openAddModelForm()
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0))
    const serverSelect = screen.getAllByRole('combobox')[1]
    await user.selectOptions(serverSelect, '1')
    await waitFor(() => expect(screen.getByRole('option', { name: 'llama3:8b' })).toBeInTheDocument())
    const modelSelect = screen.getAllByRole('combobox')[0]
    await user.selectOptions(modelSelect, 'llama3:8b')
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('shows error message and disables Save when server is unreachable', async () => {
    server.use(
      http.get('/api/v1/settings/llm-servers/:id/available-models', () =>
        HttpResponse.error(),
      ),
    )
    const user = await openAddModelForm()
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0))
    const serverSelect = screen.getAllByRole('combobox')[1]
    await user.selectOptions(serverSelect, '1')
    await waitFor(() => {
      expect(screen.getByText(/Could not reach this server/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('clearing model on server change resets the model dropdown', async () => {
    const user = await openAddModelForm()
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0))
    const serverSelect = screen.getAllByRole('combobox')[1]
    await user.selectOptions(serverSelect, '1')
    await waitFor(() => expect(screen.getByRole('option', { name: 'llama3:8b' })).toBeInTheDocument())
    const modelSelect = screen.getAllByRole('combobox')[0]
    await user.selectOptions(modelSelect, 'llama3:8b')
    // Now switch server — model should reset
    await user.selectOptions(serverSelect, '')
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '— select a server first —' })).toBeInTheDocument()
    })
  })
})

describe('Settings page — AI Servers column header', () => {
  it('AI Servers table shows "IN USE" column header', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'AI Servers' }))
    await waitFor(() => expect(screen.getByText('Server Name')).toBeInTheDocument())
    expect(screen.getByText('IN USE')).toBeInTheDocument()
  })
})
