import { useState } from 'react'
import { CalendarDays, ChevronDown, Download } from 'lucide-react'
import { mockApplications, mockStats, mockTimeTracker, mockUser } from './mockData'
import { useClickOutside, useDisclosure } from '../../layouts/hooks'

const dateRanges = [
	'Last 7 days',
	'Last 30 days',
	'This month',
	'01 June – 31 July 2026',
	'Year to date',
]

function DateRangePicker() {
	const { open, toggle, close } = useDisclosure()
	const [selected, setSelected] = useState(dateRanges[3])
	const ref = useClickOutside<HTMLDivElement>(close)
	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={toggle}
				className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
			>
				<CalendarDays className="h-4 w-4 text-gray-500" />
				{selected}
				<ChevronDown
					className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
				/>
			</button>
			{open && (
				<div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
					{dateRanges.map((r) => (
						<button
							key={r}
							type="button"
							onClick={() => {
								setSelected(r)
								close()
							}}
							className={[
								'block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50',
								r === selected ? 'font-medium text-gray-900' : 'text-gray-700',
							].join(' ')}
						>
							{r}
						</button>
					))}
				</div>
			)}
		</div>
	)
}

function Card({
	children,
	className = '',
}: {
	children: React.ReactNode
	className?: string
}) {
	return (
		<div
			className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}
		>
			{children}
		</div>
	)
}

function formatDuration(totalSeconds: number) {
	const h = Math.floor(totalSeconds / 3600)
		.toString()
		.padStart(2, '0')
	const m = Math.floor((totalSeconds % 3600) / 60)
		.toString()
		.padStart(2, '0')
	const s = (totalSeconds % 60).toString().padStart(2, '0')
	return `${h}:${m}:${s}`
}

export function DashboardPage() {
	return (
		<div className="p-6">
			{/* Welcome + controls */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold text-gray-900">
						Welcome back, {mockUser.name} !
					</h2>
					<p className="text-sm text-gray-500">Here is what is happening across your team today.</p>
				</div>
				<div className="flex items-center gap-3">
					<DateRangePicker />
					<button className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
						<Download className="h-4 w-4" />
						Export
					</button>
				</div>
			</div>

			{/* Grid */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				<Card>
					<div className="text-sm font-medium text-gray-500">Job Levels</div>
					<div className="mt-2 flex items-baseline gap-2">
						<span className="text-3xl font-semibold text-gray-900">
							{mockStats.jobLevels.toLocaleString()}
						</span>
						<span className="text-xs font-medium text-emerald-600">
							+{mockStats.jobLevelsChangePct}%
						</span>
					</div>
					<div className="mt-4 text-xs text-gray-500">Success rate</div>
					<div className="mt-1 flex items-center gap-2">
						<div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
							<div
								className="h-full rounded-full bg-brand-500"
								style={{ width: `${mockStats.successRatePct}%` }}
							/>
						</div>
						<span className="text-sm font-medium text-gray-700">
							{mockStats.successRatePct}%
						</span>
					</div>
				</Card>

				<Card className="lg:col-span-2">
					<div className="flex items-center justify-between">
						<div className="text-sm font-medium text-gray-700">Team Performance</div>
						<button className="text-xs text-brand-600 hover:underline">View Report</button>
					</div>
					<div className="mt-4 space-y-3">
						{[
							{ label: 'Product Design Team', pct: 60 },
							{ label: 'Development Team', pct: 70 },
							{ label: 'Marketing Team', pct: 45 },
						].map((row) => (
							<div key={row.label} className="flex items-center gap-3">
								<span className="w-44 text-sm text-gray-600">{row.label}</span>
								<div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
									<div
										className="h-full rounded-full bg-brand-500"
										style={{ width: `${row.pct}%` }}
									/>
								</div>
								<span className="w-10 text-right text-sm font-medium text-gray-700">
									{row.pct}%
								</span>
							</div>
						))}
					</div>
				</Card>

				<Card>
					<div className="flex items-center justify-between">
						<div className="text-sm font-medium text-gray-700">Time Tracker</div>
						<button className="text-xs text-gray-500 hover:underline">History</button>
					</div>
					<div className="mt-4 font-mono text-3xl font-semibold text-gray-900">
						{formatDuration(mockTimeTracker.currentSessionSeconds)}
					</div>
					<div className="mt-3 flex gap-2">
						<button className="flex-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white">
							Pause
						</button>
						<button className="flex-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600">
							Stop
						</button>
					</div>
				</Card>

				<Card className="lg:col-span-2">
					<div className="flex items-center justify-between">
						<div className="text-sm font-medium text-gray-700">Total Time Worked</div>
						<span className="text-xs text-gray-500">829 h 45 m · +6% last week</span>
					</div>
					<div className="mt-6 flex h-32 items-end gap-2">
						{[40, 55, 38, 70, 52, 80, 65, 90, 60, 75, 50, 85].map((h, i) => (
							<div
								key={i}
								className="flex-1 rounded-t bg-brand-200"
								style={{ height: `${h}%` }}
							/>
						))}
					</div>
				</Card>

				<Card className="lg:col-span-3">
					<div className="mb-3 flex items-center justify-between">
						<div className="text-sm font-medium text-gray-700">Payroll List</div>
						<button className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
							Add New
						</button>
					</div>
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs uppercase tracking-wider text-gray-400">
								<th className="py-2 font-medium">ID</th>
								<th className="py-2 font-medium">Candidate</th>
								<th className="py-2 font-medium">Role</th>
								<th className="py-2 font-medium">Submitted</th>
								<th className="py-2 font-medium">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-100 text-gray-700">
							{mockApplications.map((a) => (
								<tr key={a.id}>
									<td className="py-3 font-mono text-xs text-gray-500">#{a.id}</td>
									<td className="py-3">
										{a.candidate.firstName} {a.candidate.lastName}
									</td>
									<td className="py-3">{a.job.title}</td>
									<td className="py-3 text-gray-500">
										{new Date(a.submittedAt).toLocaleDateString()}
									</td>
									<td className="py-3">
										<span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 capitalize">
											{a.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</Card>
			</div>
		</div>
	)
}
