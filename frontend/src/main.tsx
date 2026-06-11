import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { queryClient } from '@/queryClient'
import Dashboard from '@/pages/Dashboard'
import Jobs from '@/pages/Jobs'
import JobDetailPage from '@/pages/JobDetail'
import Evaluate from '@/pages/Evaluate'
import Applications from '@/pages/Applications'
import Settings from '@/pages/Settings'
import LLMUsage from '@/pages/LLMUsage'
import JobSearchProfile from '@/pages/JobSearchProfile'
import Career from '@/pages/Career'
import '@/index.css'

const router = createBrowserRouter([
  // Dashboard — standalone full-page route, no sidebar
  { path: '/', element: <Dashboard /> },

  // Standalone pages — AppHeader top-nav, no sidebar
  { path: '/career',     element: <Career /> },
  { path: '/evaluate',   element: <Evaluate /> },
  { path: '/settings',   element: <Settings /> },
  { path: '/llm-usage',  element: <LLMUsage /> },
  { path: '/profile',    element: <JobSearchProfile /> },
  { path: '/jobs',       element: <Jobs /> },
  { path: '/jobs/:jobId', element: <JobDetailPage /> },
  { path: '/applications',                      element: <Applications /> },
  { path: '/applications/:applicationId',       element: <Applications /> },

])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
)
