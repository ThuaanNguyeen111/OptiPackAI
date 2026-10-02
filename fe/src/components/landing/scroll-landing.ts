function findLandingTarget(id: string): HTMLElement | null {
  const main = document.querySelector('.landing-main')
  if (main instanceof HTMLElement) {
    const nested = main.querySelector(`#${CSS.escape(id)}`)
    if (nested instanceof HTMLElement) return nested
  }
  const global = document.getElementById(id)
  return global instanceof HTMLElement ? global : null
}

export function scrollLandingSection(hash: string): void {
  const id = hash.replace(/^#/, '')
  const main = document.querySelector('.landing-main')
  const usesNestedScroller = main instanceof HTMLElement

  if (!id || id === 'top') {
    if (usesNestedScroller) {
      main.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    return
  }

  const target = findLandingTarget(id)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export function handleLandingHashClick(
  event: { preventDefault: () => void },
  href: string,
): void {
  event.preventDefault()
  const url = new URL(window.location.href)
  url.hash = href.startsWith('#') ? href : `#${href}`
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  scrollLandingSection(href)
}
