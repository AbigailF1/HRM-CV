import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { DashboardLayout } from './layouts/DashboardLayout'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

const queryClient = new QueryClient()

const router = createBrowserRouter([
	{
		path: '/',
		element: <DashboardLayout />,
		children: [
			{ index: true, element: <DashboardPage /> },
			{ path: 'jobs', element: <PlaceholderPage title="All Jobs" /> },
			{ path: 'jobs/new', element: <PlaceholderPage title="Create Job" /> },
			{ path: 'jobs/archived', element: <PlaceholderPage title="Archived Jobs" /> },
			{ path: 'candidates', element: <PlaceholderPage title="Candidates" /> },
			{ path: 'applications', element: <PlaceholderPage title="Applications" /> },
			{ path: 'notifications', element: <PlaceholderPage title="Notifications" /> },
			{ path: 'interviews', element: <PlaceholderPage title="Interviews" /> },
			{ path: 'evaluations', element: <PlaceholderPage title="Evaluations" /> },
			{ path: 'attendance', element: <PlaceholderPage title="Attendance" /> },
			{ path: 'settings', element: <PlaceholderPage title="Settings" /> },
			{ path: 'help', element: <PlaceholderPage title="Help Center" /> },
		],
	},
])

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	)
}

export default App
