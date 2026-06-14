type Props = { title: string }

export function PlaceholderPage({ title }: Props) {
	return (
		<div className="p-6">
			<div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
				<h2 className="text-lg font-semibold text-gray-900">{title}</h2>
				<p className="mt-1 text-sm text-gray-500">This page is a placeholder.</p>
			</div>
		</div>
	)
}
