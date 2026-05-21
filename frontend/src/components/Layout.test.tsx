// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Layout from './Layout'

function renderLayout(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout />
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  it('renders the app name', () => {
    renderLayout()
    expect(screen.getByText('AIstivus')).toBeInTheDocument()
  })

  it('renders all nav links', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Jobs' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Applications' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Evaluate' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'LLM Usage' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('nav links have correct hrefs', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs')
    expect(screen.getByRole('link', { name: 'Applications' })).toHaveAttribute('href', '/applications')
    expect(screen.getByRole('link', { name: 'Evaluate' })).toHaveAttribute('href', '/evaluate')
    expect(screen.getByRole('link', { name: 'LLM Usage' })).toHaveAttribute('href', '/llm-usage')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })
})
