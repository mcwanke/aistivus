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
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders tab navigation', () => {
    renderWithProviders(<Settings />)
    expect(screen.getByRole('button', { name: 'Models' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'System Types' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'jobsearch.md' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'System Info' })).toBeInTheDocument()
  })

  it('shows LLM Models section by default', async () => {
    renderWithProviders(<Settings />)
    await waitFor(() => expect(screen.getByText('LLM Models')).toBeInTheDocument())
    expect(screen.getByText('llama3')).toBeInTheDocument()
  })

  it('switches to System Types tab on click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'System Types' }))
    await waitFor(() => expect(screen.getByText('general')).toBeInTheDocument())
  })

  it('switches to jobsearch.md tab on click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'jobsearch.md' }))
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

  it('renders Local and Anthropic type badges', async () => {
    await openServersTab()
    await waitFor(() => expect(screen.getByText('Local')).toBeInTheDocument())
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

  it('add server modal has Remote (Anthropic) tab', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByText('Add AI Server')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Anthropic/i })).toBeInTheDocument()
  })

  it('switching to Remote tab shows key status', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByText('Add AI Server')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Anthropic/i }))
    await waitFor(() =>
      expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument()
    )
  })

  it('"Test Connection" button is present in local tab', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByText('Add AI Server')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument()
  })

  it('test connection shows result inline after click', async () => {
    const user = await openServersTab()
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add AI/Server' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add AI/Server' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument())
    // Fill in required fields first (placeholders match Settings.tsx modal)
    const nameInput = screen.getByPlaceholderText('Home Lab')
    const endpointInput = screen.getByPlaceholderText('http://192.168.1.10:11434')
    await user.type(nameInput, 'Test Lab')
    await user.type(endpointInput, 'http://localhost:11434')
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))
    await waitFor(() =>
      expect(screen.getByText(/Connected/)).toBeInTheDocument()
    )
  })
})

describe('Settings page — Models tab server selector', () => {
  it('Add Model form renders a server selector with server names as options', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'Models' }))
    await waitFor(() => expect(screen.getByText('LLM Models')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add model' }))
    await waitFor(() => {
      // Server selector should appear with server name options
      expect(screen.getAllByRole('option', { name: /Local Ollama/ }).length).toBeGreaterThan(0)
    })
  })

  it('Add Model form includes both local and anthropic server options', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />)
    await user.click(screen.getByRole('button', { name: 'Models' }))
    await waitFor(() => expect(screen.getByText('LLM Models')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Add model' }))
    await waitFor(() => {
      expect(screen.getAllByRole('option', { name: /Anthropic Claude/ }).length).toBeGreaterThan(0)
    })
  })
})
