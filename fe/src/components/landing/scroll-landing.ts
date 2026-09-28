export function scrollLandingSection(hash: string): void {
  const id = hash.replace(/^#/, '')
  const main = document.querySelector('.landing-main')
  if (!(main instanceof HTMLElement)) return

  if (!id || id === 'top') {
    main.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  const target = main.querySelector(`#${CSS.escape(id)}`)
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export function handleLandingHashClick(
  event: { preventDefault: () => void },
  href: string,
): void {
  event.preventDefault()
  scrollLandingSection(href)
}
