import { Outlet, useLocation, matchPath } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const titleRoutes: { pattern: string; title: string }[] = [
	{ pattern: '/', title: 'Dashboard' },
	{ pattern: '/jobs', title: 'Jobs' },
	{ pattern: '/jobs/new', title: 'Create Job' },
	{ pattern: '/jobs/archived', title: 'Archived Jobs' },
	{ pattern: '/candidates', title: 'Candidates' },
	{ pattern: '/applications', title: 'Applications' },
	{ pattern: '/notifications', title: 'Notifications' },
	{ pattern: '/interviews', title: 'Interviews' },
	{ pattern: '/evaluations', title: 'Evaluations' },
	{ pattern: '/attendance', title: 'Attendance' },
	{ pattern: '/settings', title: 'Settings' },
	{ pattern: '/help', title: 'Help Center' },
]

function resolveTitle(pathname: string): string {
	const exact = titleRoutes.find((r) => r.pattern === pathname)
	if (exact) return exact.title
	const matched = titleRoutes.find((r) => matchPath({ path: r.pattern, end: true }, pathname))
	return matched?.title ?? 'Dashboard'
}

export function DashboardLayout() {
	const { pathname } = useLocation()
	const title = resolveTitle(pathname)

	return (
		<div className="flex h-screen w-screen overflow-hidden bg-[#f7f7f9]">
			<Sidebar />
			<div className="flex min-w-0 flex-1 flex-col">
				<TopBar title={title} />
				<main className="flex-1 overflow-y-auto">
					<Outlet />
				</main>
			</div>
		</div>
	)
}
