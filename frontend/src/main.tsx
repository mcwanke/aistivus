import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { queryClient } from '@/queryClient'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Jobs from '@/pages/Jobs'
import Evaluate from '@/pages/Evaluate'
import Applications from '@/pages/Applications'
import ApplicationDetailPage from '@/pages/ApplicationDetailPage'
import Settings from '@/pages/Settings'
import LLMUsage from '@/pages/LLMUsage'
import '@/index.css'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/',                              element: <Dashboard /> },
      { path: '/jobs',                          element: <Jobs /> },
      { path: '/jobs/:jobId',                   element: <Jobs /> },
      { path: '/evaluate',                      element: <Evaluate /> },
      { path: '/applications',                  element: <Applications /> },
      { path: '/applications/:applicationId',   element: <Applications /> },
      { path: '/application-detail/:applicationId', element: <ApplicationDetailPage /> },
      { path: '/settings',                      element: <Settings /> },
      { path: '/llm-usage',                     element: <LLMUsage /> },
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
