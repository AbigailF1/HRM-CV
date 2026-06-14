import { Mail, Share2, UserPlus } from 'lucide-react'

type TopBarProps = {
	title: string
}

const avatars = [
	'https://i.pravatar.cc/40?img=11',
	'https://i.pravatar.cc/40?img=12',
	'https://i.pravatar.cc/40?img=13',
]

export function TopBar({ title }: TopBarProps) {
	return (
		<header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
			<h1 className="text-lg font-semibold text-gray-900">{title}</h1>

			<div className="flex items-center gap-4">
				<button className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label="Messages">
					<Mail className="h-4 w-4" />
				</button>
				<button className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label="Share">
					<Share2 className="h-4 w-4" />
				</button>

				<div className="flex -space-x-2">
					{avatars.map((src, i) => (
						<img
							key={src}
							src={src}
							alt={`Member ${i + 1}`}
							className="h-7 w-7 rounded-full border-2 border-white object-cover"
						/>
					))}
					<span className="flex h-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 px-1.5 text-[10px] font-medium text-gray-700">
						+10
					</span>
				</div>

				<button className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
					<UserPlus className="h-4 w-4" />
					Invite
				</button>
			</div>
		</header>
	)
}
