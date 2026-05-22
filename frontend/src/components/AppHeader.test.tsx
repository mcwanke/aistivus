// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppHeader from './AppHeader'

function renderHeader(pageName?: string) {
  return render(
    <MemoryRouter>
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

    it('renders Settings link', () => {
      renderHeader()
      expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    })

    it('does not render a ← Home link', () => {
      renderHeader()
      expect(screen.queryByText('← Home')).not.toBeInTheDocument()
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

    it('renders Settings link', () => {
      renderHeader('Jobs')
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
