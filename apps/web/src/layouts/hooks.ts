import { useEffect, useRef, useState } from 'react'

export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
	const ref = useRef<T | null>(null)
	useEffect(() => {
		function onDown(e: MouseEvent) {
			if (!ref.current) return
			if (!ref.current.contains(e.target as Node)) onOutside()
		}
		document.addEventListener('mousedown', onDown)
		return () => document.removeEventListener('mousedown', onDown)
	}, [onOutside])
	return ref
}

export function useDisclosure(initial = false) {
	const [open, setOpen] = useState(initial)
	return {
		open,
		toggle: () => setOpen((v) => !v),
		close: () => setOpen(false),
		setOpen,
	}
}
