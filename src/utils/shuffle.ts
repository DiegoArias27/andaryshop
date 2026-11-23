// One weight per product id, picked once and reused for the rest of this
// page load — switching categories, visiting a product and coming back,
// etc. all re-sort by the SAME weights, so the order only actually
// changes on a real reload or a fresh visit (a new module instance),
// instead of jumping around every time the shopper navigates.
const sessionWeights = new Map<number, number>()

function weightFor(id: number): number {
  let w = sessionWeights.get(id)
  if (w === undefined) {
    w = Math.random()
    sessionWeights.set(id, w)
  }
  return w
}

/** Randomizes product order, stable for the whole browser session (see
 * sessionWeights above) — so a listing that always put the same handful
 * of products up top on every single visit instead surfaces different
 * ones over time, without the order itself drifting while browsing. */
export function shuffleStable<T extends { id: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => weightFor(a.id) - weightFor(b.id))
}
