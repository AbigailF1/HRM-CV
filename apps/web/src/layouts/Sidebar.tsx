import { NavLink, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import {
	ChevronDown,
	ChevronRight,
	Search,
	LayoutDashboard,
	Briefcase,
	UserSquare2,
	FileText,
	Bell,
	CalendarClock,
	ClipboardCheck,
	Clock,
	Settings,
	LifeBuoy,
	LogOut,
	UserCircle,
	Check,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useClickOutside, useDisclosure } from './hooks'

type Badge =
	| { kind: 'count'; value: number }
	| { kind: 'pill'; value: string }

type NavItem = {
	to: string
	label: string
	icon: LucideIcon
	badge?: Badge
	children?: { to: string; label: string }[]
}

type NavGroup = {
	heading: string
	items: NavItem[]
}

const groups: NavGroup[] = [
	{
		heading: 'General',
		items: [
			{ to: '/', label: 'Dashboard', icon: LayoutDashboard },
			{
				to: '/jobs',
				label: 'Jobs',
				icon: Briefcase,
				children: [
					{ to: '/jobs', label: 'All Jobs' },
					{ to: '/jobs/new', label: 'Create Job' },
					{ to: '/jobs/archived', label: 'Archived' },
				],
			},
			{ to: '/candidates', label: 'Candidates', icon: UserSquare2 },
			{ to: '/applications', label: 'Applications', icon: FileText },
			{
				to: '/notifications',
				label: 'Notifications',
				icon: Bell,
				badge: { kind: 'count', value: 15 },
			},
		],
	},
	{
		heading: 'Management',
		items: [
			{ to: '/interviews', label: 'Interviews', icon: CalendarClock },
			{ to: '/evaluations', label: 'Evaluations', icon: ClipboardCheck },
			{ to: '/attendance', label: 'Attendance', icon: Clock },
		],
	},
	{
		heading: 'Support',
		items: [
			{ to: '/settings', label: 'Settings', icon: Settings },
			{ to: '/help', label: 'Help Center', icon: LifeBuoy },
		],
	},
]

function RightAdornment({ badge }: { badge?: Badge }) {
	if (!badge) return null
	if (badge.kind === 'count') {
		return (
			<span className="ml-auto rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
				{badge.value}
			</span>
		)
	}
	return (
		<span className="ml-auto rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-700">
			{badge.value}
		</span>
	)
}

function NavLeaf({ item }: { item: NavItem }) {
	return (
		<NavLink
			to={item.to}
			end={item.to === '/'}
			className={({ isActive }) =>
				[
					'group flex items-center gap-3 rounded-md px-3 py-2 text-sm',
					isActive
						? 'bg-gray-100 font-medium text-gray-900 shadow-sm'
						: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
				].join(' ')
			}
		>
			<item.icon className="h-4 w-4 text-gray-500" />
			<span>{item.label}</span>
			<RightAdornment badge={item.badge} />
		</NavLink>
	)
}

function NavCollapsible({ item }: { item: NavItem }) {
	const { pathname } = useLocation()
	const startsActive = useMemo(
		() => pathname === item.to || pathname.startsWith(`${item.to}/`),
		[pathname, item.to],
	)
	const { open, toggle } = useDisclosure(startsActive)

	return (
		<div>
			<button
				type="button"
				onClick={toggle}
				aria-expanded={open}
				className={[
					'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm',
					startsActive
						? 'text-gray-900'
						: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
				].join(' ')}
			>
				<item.icon className="h-4 w-4 text-gray-500" />
				<span>{item.label}</span>
				<ChevronRight
					className={`ml-auto h-4 w-4 text-gray-400 transition-transform ${
						open ? 'rotate-90' : ''
					}`}
				/>
			</button>
			{open && item.children && (
				<div className="ml-7 mt-1 flex flex-col gap-0.5 border-l border-gray-100 pl-2">
					{item.children.map((child) => (
						<NavLink
							key={child.to + child.label}
							to={child.to}
							end
							className={({ isActive }) =>
								[
									'rounded-md px-3 py-1.5 text-sm',
									isActive
										? 'bg-gray-100 font-medium text-gray-900'
										: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
								].join(' ')
							}
						>
							{child.label}
						</NavLink>
					))}
				</div>
			)}
		</div>
	)
}

function BrandSwitcher() {
	const { open, toggle, close } = useDisclosure()
	const ref = useClickOutside<HTMLDivElement>(close)
	const workspaces = [
		{ id: 'icog-hrm', name: 'iCog HRM', active: true },
		{ id: 'icog-careers', name: 'iCog Careers' },
	]
	return (
		<div ref={ref} className="relative px-5 py-5">
			<button
				type="button"
				onClick={toggle}
				className="flex w-full items-center gap-2"
			>
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
					<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
						<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
					</svg>
				</div>
				<span className="text-sm font-semibold text-gray-900">iCog HRM</span>
				<ChevronDown
					className={`ml-auto h-4 w-4 text-gray-500 transition-transform ${
						open ? 'rotate-180' : ''
					}`}
				/>
			</button>
			{open && (
				<div className="absolute left-4 right-4 top-16 z-20 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
					{workspaces.map((w) => (
						<button
							key={w.id}
							type="button"
							onClick={close}
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
						>
							<span className="flex-1 text-left">{w.name}</span>
							{w.active && <Check className="h-4 w-4 text-brand-600" />}
						</button>
					))}
				</div>
			)}
		</div>
	)
}

function ProfileMenu() {
	const { open, toggle, close } = useDisclosure()
	const ref = useClickOutside<HTMLDivElement>(close)
	return (
		<div ref={ref} className="relative border-t border-gray-200">
			<button
				type="button"
				onClick={toggle}
				className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
			>
				<img
					src="https://i.pravatar.cc/64?img=47"
					alt="Sophia Munn"
					className="h-8 w-8 rounded-full object-cover"
				/>
				<div className="flex min-w-0 flex-1 flex-col leading-tight">
					<span className="truncate text-sm font-medium text-gray-900">Sophia Munn</span>
					<span className="truncate text-xs text-gray-500">sophia@icog-labs.com</span>
				</div>
				<ChevronDown
					className={`h-4 w-4 text-gray-400 transition-transform ${
						open ? 'rotate-180' : ''
					}`}
				/>
			</button>
			{open && (
				<div className="absolute bottom-16 left-4 right-4 z-20 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
					<button
						type="button"
						onClick={close}
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
					>
						<UserCircle className="h-4 w-4 text-gray-500" />
						Profile
					</button>
					<button
						type="button"
						onClick={close}
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
					>
						<Settings className="h-4 w-4 text-gray-500" />
						Account settings
					</button>
					<div className="my-1 border-t border-gray-100" />
					<button
						type="button"
						onClick={close}
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
					>
						<LogOut className="h-4 w-4" />
						Sign out
					</button>
				</div>
			)}
		</div>
	)
}

export function Sidebar() {
	return (
		<aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-gray-200 bg-white">
			<BrandSwitcher />

			<div className="px-4">
				<div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 focus-within:border-brand-400">
					<Search className="h-4 w-4" />
					<input
						placeholder="Search..."
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
					/>
					<kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
						⌘F
					</kbd>
				</div>
			</div>

			<nav className="mt-4 flex-1 overflow-y-auto px-3">
				{groups.map((group) => (
					<div key={group.heading} className="mb-4">
						<div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
							{group.heading}
						</div>
						<div className="flex flex-col gap-0.5">
							{group.items.map((item) =>
								item.children ? (
									<NavCollapsible key={item.label} item={item} />
								) : (
									<NavLeaf key={item.to} item={item} />
								),
							)}
						</div>
					</div>
				))}
			</nav>

			<ProfileMenu />
		</aside>
	)
}
