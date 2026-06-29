import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import { DocRow } from './DocRow'
import {
  MOCK_TYP_DOC,
  MOCK_DRAFT_PDF,
  MOCK_FINAL_PDF,
  MOCK_MISSING_TYP,
} from '@/test/mocks/handlers'

describe('DocRow', () => {
  it('renders the filename', () => {
    renderWithProviders(<DocRow doc={MOCK_TYP_DOC} applicationId={1} typstAvailable={true} />)
    expect(screen.getByText('resume_v1.typ')).toBeInTheDocument()
  })

  it('shows file-missing badge when file does not exist', () => {
    renderWithProviders(<DocRow doc={MOCK_MISSING_TYP} applicationId={1} typstAvailable={true} />)
    expect(screen.getByText(/File missing/)).toBeInTheDocument()
  })

  it('shows Final badge for finalized document', () => {
    renderWithProviders(<DocRow doc={MOCK_FINAL_PDF} applicationId={1} typstAvailable={true} />)
    expect(screen.getByText('Final')).toBeInTheDocument()
  })

  it('shows Edit and Download buttons for .typ file', () => {
    renderWithProviders(<DocRow doc={MOCK_TYP_DOC} applicationId={1} typstAvailable={true} />)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('shows Compile button for .typ when typstAvailable is true', () => {
    renderWithProviders(<DocRow doc={MOCK_TYP_DOC} applicationId={1} typstAvailable={true} />)
    expect(screen.getByRole('button', { name: 'Compile' })).toBeInTheDocument()
  })

  it('hides Compile button when typstAvailable is false', () => {
    renderWithProviders(<DocRow doc={MOCK_TYP_DOC} applicationId={1} typstAvailable={false} />)
    expect(screen.queryByRole('button', { name: 'Compile' })).not.toBeInTheDocument()
  })

  it('shows Open and Download buttons for .pdf file', () => {
    renderWithProviders(<DocRow doc={MOCK_FINAL_PDF} applicationId={1} typstAvailable={true} />)
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('shows Finalize button for DRAFT pdf', () => {
    renderWithProviders(<DocRow doc={MOCK_DRAFT_PDF} applicationId={1} typstAvailable={true} />)
    expect(screen.getByRole('button', { name: 'Finalize' })).toBeInTheDocument()
  })

  it('shows delete confirmation on Delete click', async () => {
    renderWithProviders(<DocRow doc={MOCK_TYP_DOC} applicationId={1} typstAvailable={true} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/Delete resume_v1\.typ\?/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('dismisses delete confirmation on Cancel', async () => {
    renderWithProviders(<DocRow doc={MOCK_TYP_DOC} applicationId={1} typstAvailable={true} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('shows rename input on Rename click', async () => {
    renderWithProviders(<DocRow doc={MOCK_TYP_DOC} applicationId={1} typstAvailable={true} />)
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(screen.getByPlaceholderText('new-filename')).toBeInTheDocument()
  })

  it('shows validation error for invalid rename value', async () => {
    renderWithProviders(<DocRow doc={MOCK_TYP_DOC} applicationId={1} typstAvailable={true} />)
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByPlaceholderText('new-filename')
    await userEvent.clear(input)
    await userEvent.type(input, 'invalid name!')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText(/1–64 chars/)).toBeInTheDocument())
  })

  it('shows no action buttons for a missing file except Rename and Delete', () => {
    renderWithProviders(<DocRow doc={MOCK_MISSING_TYP} applicationId={1} typstAvailable={true} />)
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compile' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
