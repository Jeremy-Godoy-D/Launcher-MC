import { useLayoutEffect, type RefObject } from 'react'

export function usePanelFocus(panel: RefObject<HTMLElement | null>, first?: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    first?.current?.focus()
    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const target = document.activeElement
        if (target instanceof HTMLElement && panel.current?.contains(target)) target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    }
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])
}
