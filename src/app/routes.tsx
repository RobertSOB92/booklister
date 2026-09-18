import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './Layout'
import { ScannerPage } from '../pages/ScannerPage'
import { SettingsPage } from '../pages/SettingsPage'
import { BookDetailsPage } from '../pages/BookDetailsPage'

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <ScannerPage />,
      },
      {
        path: "/settings",
        element: <SettingsPage />,
      },
      {
        path: "/book/:id",
        element: <BookDetailsPage />,
      }
    ],
  },
])
