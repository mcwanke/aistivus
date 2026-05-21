import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { queryClient } from '@/queryClient'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Jobs from '@/pages/Jobs'
import JobDetailPage from '@/pages/JobDetail'
import Evaluate from '@/pages/Evaluate'
import Applications from '@/pages/Applications'
import ApplicationDetailPage from '@/pages/ApplicationDetailPage'
import Settings from '@/pages/Settings'
import LLMUsage from '@/pages/LLMUsage'
import JobSearchProfile from '@/pages/JobSearchProfile'
import '@/index.css'

const router = createBrowserRouter([
  // Dashboard — standalone full-page route, no sidebar
  { path: '/', element: <Dashboard /> },

  // Standalone pages — AppHeader top-nav, no sidebar
  { path: '/evaluate',   element: <Evaluate /> },
  { path: '/settings',   element: <Settings /> },
  { path: '/llm-usage',  element: <LLMUsage /> },
  { path: '/profile',    element: <JobSearchProfile /> },
  { path: '/jobs',       element: <Jobs /> },
  { path: '/jobs/:jobId', element: <JobDetailPage /> },
  { path: '/applications',                      element: <Applications /> },
  { path: '/applications/:applicationId',       element: <Applications /> },

  // Legacy route — retired in Phase 1.5 P14
  {
    element: <Layout />,
    children: [
      { path: '/application-detail/:applicationId', element: <ApplicationDetailPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
