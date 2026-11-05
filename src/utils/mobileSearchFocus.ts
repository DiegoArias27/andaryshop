/** iOS Safari only opens the on-screen keyboard for a `.focus()` call made
 * synchronously inside a trusted user-gesture handler (a click) — by the
 * time BottomNav's "Buscar" button finishes `navigate('/?buscar=1')` and
 * Catalog re-renders its mobile search box open, that gesture window has
 * usually already closed, so the field ends up focused in React's eyes but
 * the keyboard never actually shows. BottomNav and Catalog aren't related
 * components, so there's no ref to reach across normally — this tiny
 * registry lets Catalog's search input register itself once mounted, and
 * lets BottomNav's click handler reach it and focus it immediately, still
 * inside the click, before the (otherwise unrelated) navigation happens.
 * Catalog's own render remains the source of truth for the open/closed
 * class — this only pre-empts it by a tick when the input is already on
 * screen to grab. */
let inputEl: HTMLInputElement | null = null

export function registerMobileSearchInput(el: HTMLInputElement | null) {
  inputEl = el
}

/** Shows (via the same class Catalog's own render applies) and focuses the
 * mobile search input right now, synchronously. Returns false (nothing
 * done) when Catalog hasn't mounted it yet — e.g. navigating in from a
 * different page — which falls back to the normal open-on-mount path. */
export function showAndFocusMobileSearchInput(): boolean {
  if (!inputEl) return false
  inputEl.closest('.toolbar-glass--search-mobile')?.classList.add('toolbar-glass--search-mobile--open')
  inputEl.focus()
  return true
}
