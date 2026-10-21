export function formatPrice(value: number | string): string {
  const amount = typeof value === 'string' ? parseFloat(value) : value
  return `$${amount.toFixed(2)} MXN`
}

/** The big plaque price, styled like the shop's own printed flyers: comma
 * thousands separators, no trailing ".00" on whole amounts (still shows
 * cents when the price actually has them), no "MXN" suffix. Only for a
 * flyer-style price tag (a wholesale tier-card, the Cotizador) — every other
 * price on the site keeps using the shared, more explicit formatPrice(). */
export function plaquePrice(value: number | string): string {
  const amount = typeof value === 'string' ? parseFloat(value) : value
  const hasCents = Math.round(amount * 100) % 100 !== 0
  return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`
}
