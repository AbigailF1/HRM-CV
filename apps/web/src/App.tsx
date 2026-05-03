import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

const queryClient = new QueryClient()

const router = createBrowserRouter([
	{
		path: '/',
		element: <div>HRM Web</div>,
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
