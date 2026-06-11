// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppHeader from './AppHeader'

function renderHeader(pageName?: string, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppHeader pageName={pageName} />
    </MemoryRouter>,
  )
}

describe('AppHeader', () => {
  describe('Dashboard mode (no pageName)', () => {
    it('renders the wordmark', () => {
      renderHeader()
      expect(screen.getByText('AIstivus')).toBeInTheDocument()
    })

    it('renders the tagline', () => {
      renderHeader()
      expect(screen.getByText(/AI Job Search Helper/)).toBeInTheDocument()
    })

    it('renders all three nav links', () => {
      renderHeader()
      expect(screen.getByRole('link', { name: 'Career' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Job Search' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    })

    it('Career link points to /career', () => {
      renderHeader()
      expect(screen.getByRole('link', { name: 'Career' })).toHaveAttribute('href', '/career')
    })

    it('Job Search link points to /jobs', () => {
      renderHeader()
      expect(screen.getByRole('link', { name: 'Job Search' })).toHaveAttribute('href', '/jobs')
    })

    it('Settings link points to /settings', () => {
      renderHeader()
      expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    })

    it('does not render a ← Home link', () => {
      renderHeader()
      expect(screen.queryByText('← Home')).not.toBeInTheDocument()
    })

    it('highlights the active nav link', () => {
      renderHeader(undefined, '/settings')
      const settingsLink = screen.getByRole('link', { name: 'Settings' })
      expect(settingsLink).toHaveClass('text-accent')
    })
  })

  describe('Page mode (with pageName)', () => {
    it('renders the ← Home link', () => {
      renderHeader('Jobs')
      expect(screen.getByText('← Home')).toBeInTheDocument()
    })

    it('renders the wordmark', () => {
      renderHeader('Jobs')
      expect(screen.getByText('AIstivus')).toBeInTheDocument()
    })

    it('renders the pageName', () => {
      renderHeader('Jobs')
      expect(screen.getByText('Jobs')).toBeInTheDocument()
    })

    it('renders all three nav links', () => {
      renderHeader('Settings')
      expect(screen.getByRole('link', { name: 'Career' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Job Search' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    })

    it('does not render the tagline', () => {
      renderHeader('Settings')
      expect(screen.queryByText(/AI Job Search Helper/)).not.toBeInTheDocument()
    })

    it('renders correct pageName for different pages', () => {
      renderHeader('LLM Usage')
      expect(screen.getByText('LLM Usage')).toBeInTheDocument()
    })
  })
})
