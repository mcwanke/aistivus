import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { queryClient } from '@/queryClient'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Jobs from '@/pages/Jobs'
import '@/index.css'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/',          element: <Dashboard /> },
      { path: '/jobs',      element: <Jobs /> },
      { path: '/jobs/:jobId', element: <Jobs /> },
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
