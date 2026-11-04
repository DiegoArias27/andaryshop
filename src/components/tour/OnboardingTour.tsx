import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { useCart } from '../../hooks/useCart'
import { useFavorites } from '../../hooks/useFavorites'
import { useQuotes } from '../../hooks/useQuotes'
import { usePackageBuilder } from '../../hooks/usePackageBuilder'
import { useToast } from '../../hooks/useToast'
import { useCustomerAuth } from '../../hooks/useCustomerAuth'
import type { CartItem } from '../../context/cart-context'
import type { FavoriteProduct } from '../../context/favorites-context'
import type { SavedQuote } from '../../context/quotes-context'
import { CloseIcon } from '../icons'

interface BranchCtx {
  clickedPackages: boolean
  productFlowDone: boolean
  packagesFlowDone: boolean
  /** True for the short Cotizador-only tutorial (launched from the
   * "Abrir el Cotizador" button) — 'cotizador-summary' ends the tour right
   * there instead of looping into the full shopping walkthrough. */
  cotizadorOnly: boolean
}

interface TourCtx {
  navigate: (path: string) => void
  openDrawer: () => void
  closeDrawer: () => void
  markProductFlowDone: () => void
  markPackagesFlowDone: () => void
  cancelPackageBuild: () => void
  /** Re-navigates to whichever /producto/:slug page the tour last visited
   * (tracked as the shopper moves around) — the "go back to a product page"
   * fallback for steps like 'favorite' whose target only exists there, when
   * nothing earlier in the chain navigates there on its own. Returns false
   * (and navigates nowhere) if the tour never visited one yet. */
  goToLastProduct: () => boolean
  /** Called every time the 'cart' step is entered. The first time, it just
   * remembers what the cart looked like right then. Every time after that
   * (i.e. "Anterior" brought the shopper back to this step after they'd
   * already tapped "Añadir al carrito" for real) it removes whatever got
   * added since, so re-tapping it doesn't pile up a second practice line and
   * the following steps (which explain THAT ONE item) still match what's
   * actually in the cart. */
  resetCartStepPractice: () => void
}

interface TourStep {
  id: string
  /** null = no specific target — a centered, full-block message. */
  selector: string | null
  title: string
  text: string
  /** The concrete, imperative next move — shown separately (and more boldly)
   * than `text`, which only explains what the highlighted thing is. */
  action: string
  /** true: a real click landing on the target advances the step by itself.
   * Gated steps show ONLY "Saltar" (skip this one step) — there's nothing
   * else to press since the real click is the whole point. Steps without
   * this show the full Anterior/Siguiente controls instead, since they're
   * just explaining something, not asking for a specific action. */
  gated?: boolean
  /** The real click is swallowed (preventDefault + stopPropagation) instead
   * of reaching the page — used for "send order", so the tour can
   * demonstrate it without actually creating an order or opening WhatsApp. */
  intercept?: boolean
  /** Message shown as a toast right after an intercepted click. */
  interceptToast?: string
  /** If the target never appears (e.g. this particular product isn't part
   * of any package) the step auto-advances after a short wait instead of
   * leaving the shopper stuck on a step about something that isn't there. */
  optional?: boolean
  /** false: renders no blocking layer at all, regardless of `selector` — the
   * whole page stays clickable and the tooltip just floats as a tip. Used
   * for steps where the real thing to click could be anywhere on the page
   * (e.g. "Elige tus productos" on whichever package card), so pinning a
   * single hole would block the very thing being taught. Defaults to true. */
  blocking?: boolean
  /** A safety net for steps whose real click navigates somewhere specific —
   * if the URL gets there while we're still on this step (the click landed
   * and the app navigated), that alone advances the tour, even if the
   * click-listener's own detection somehow missed the click itself. */
  expectPath?: string
  /** Same safety net as `expectPath`, but matched as a prefix instead of an
   * exact path — for a destination whose exact URL varies (any
   * `/producto/:slug`). Covers 'product' on mobile, where a single tap on
   * the photo doesn't navigate through a plain `<a>` click at all: it's a
   * deferred `navigate()` call (see ProductCard's double-tap-to-favorite
   * gesture) that the click-listener below can't tell apart, in the moment,
   * from a double-tap that only favorites and never navigates anywhere. */
  expectPathPrefix?: string
  /** Runs once whenever the tour arrives at this step (forward or back). */
  onEnter?: (ctx: TourCtx) => void
  /** Static id, or computed from what was actually clicked / covered so
   * far — the only two branch points are "did they tap a category or
   * Paquetes" and "have they already seen the packages/product flow". */
  next: string | ((ctx: BranchCtx) => string)
  /** Where "Saltar" leads, when different from the normal `next` — for a
   * gated step, "Saltar" means "skip the rest of THIS SECTION", not just
   * this one step, so it jumps straight to the first step of whatever
   * comes after (e.g. skipping anywhere in the shopping flow lands on
   * Paquetes or Cuenta, never on some half-explained step in between). */
  skipNext?: string | ((ctx: BranchCtx) => string)
  /** Checked once the target element is actually found on screen — if it
   * returns true, the step is skipped entirely (straight to `next`) instead
   * of being shown, e.g. "only one size/color exists, nothing to actually
   * choose between". */
  skipIf?: (el: Element) => boolean
  /** Shown as a toast when `skipIf` triggers, briefly explaining why instead
   * of skipping in total silence. */
  skipToast?: string
  /** Clicks landing inside this never count as the step's real action, even
   * though they're real clicks on a real element within the hole — for a
   * target whose hole contains OTHER interactive controls that do something
   * different from what this step is actually asking for. 'product' is the
   * case this exists for: its hole is the whole `.product-grid`, so a tap on
   * a card's own quick-add/favorite/size/color button (all real buttons,
   * all "inside the hole") would otherwise satisfy the generic "a button or
   * link was clicked" check below and advance the tour as if the shopper had
   * opened the product's detail page — when they didn't. */
  ignoreSelector?: string
}

const FINISH = 'FINISH'

/** Where "Saltar" lands from anywhere inside the shopping section (product,
 * size, color, cart, cart-send) — the section right after it, same as
 * reaching the end of it normally would. */
function afterShopping(ctx: BranchCtx): string {
  return ctx.packagesFlowDone ? 'account-nav' : 'packages-nav'
}

const STEPS: Record<string, TourStep> = {
  intro: {
    id: 'intro',
    selector: null,
    title: 'Bienvenido a Andary Shop 👋',
    text: 'Te vamos a enseñar a comprar aquí, paso a paso.',
    action: '👉 Toca "Siguiente" para empezar.',
    // The tour opens with the Cotizador (see the 'cotizador' step further
    // below) before ever touching the normal shopping flow — Mayoreo
    // pricing is the thing most worth explaining up front.
    next: 'cotizador',
  },
  category: {
    id: 'category',
    selector: '[data-tour="categories"]',
    title: 'Elige una categoría',
    text: 'Cada botón te lleva directo a esa sección del catálogo — o toca "Paquetes" si quieres ver combos con descuento.',
    action: '👉 Toca una categoría, por ejemplo "Playeras" (o "Paquetes").',
    gated: true,
    // Reached right after the Cotizador sub-flow, which lives on its own
    // page — back to the catalog home first, so the category pills this
    // step spotlights actually exist on screen.
    onEnter: (ctx) => ctx.navigate('/'),
    // "Saltar" here skips the whole shopping section, straight to whatever
    // comes after it — same destination the end of that section reaches.
    skipNext: afterShopping,
    next: (ctx) => (ctx.clickedPackages ? 'packages-info' : 'product'),
  },
  product: {
    id: 'product',
    selector: '.product-grid',
    title: 'Elige un producto',
    text: 'Vas a entrar a su ficha con todos los detalles.',
    action: '👉 Toca cualquier producto que te guste.',
    gated: true,
    // "Saltar" here skips the rest of the shopping section — same as 'cart'
    // below, there's nothing to show about a product that was never opened.
    skipNext: afterShopping,
    // If the shopper just practiced starting a real package in
    // "Armando tu paquete", that build could still be active — cancelling
    // it here guarantees the upcoming color/cart steps behave like a normal
    // purchase (a real in-progress build changes what "Añadir al carrito"
    // even does), not a leftover from exploring packages. And if we're
    // still on the packages listing itself, its product cards belong to
    // their OWN collection sections (tapping one would start yet another
    // real package build instead of a normal visit) — hopping to a plain
    // category view first sidesteps that entirely. Finally, arriving here
    // right after a real package just finished (packages-completed) leaves
    // the cart drawer open — closing it too, same as the 'favorite' step
    // does for the other branch, so it doesn't sit on top of the product
    // grid and swallow the very click this step is waiting for.
    // Also covers "Anterior" from 'color'/'quantity'/'cart' — those never
    // navigate away on their own, so returning here while still parked on
    // the product DETAIL page (no .product-grid there at all) used to leave
    // this step with nothing to spotlight; the explicit check catches that
    // case too, not just the "came from paquetes" one.
    onEnter: (ctx) => {
      ctx.cancelPackageBuild()
      ctx.closeDrawer()
      if (!document.querySelector('.product-grid')) ctx.navigate('/?categoria=playeras')
    },
    // A card's own quick-add/favorite/size/color buttons sit inside the same
    // hole (the whole grid) but don't open the detail page this step is
    // actually waiting for. The photo itself is ALSO excluded on top of
    // that — on mobile it's a double-tap-to-favorite gesture, and a single
    // tap there only navigates after a deferred, async timeout (see
    // ProductCard's handleMediaClick), which this click-listener can't
    // distinguish, in the moment, from a double-tap that never navigates at
    // all. expectPathPrefix below is what actually confirms it, once (and
    // only if) the detail page really loads.
    ignoreSelector: 'button, .product-card__media',
    expectPathPrefix: '/producto/',
    next: 'size',
  },
  size: {
    id: 'size',
    selector: '.sizes',
    title: 'Elige una talla',
    // Mirrors what "Añadir al carrito" itself actually requires: when there's
    // more than one size, it needs a real tap — not just whichever one came
    // pre-selected — or it refuses to add the item and just shakes this same
    // box. Skipped entirely (see skipIf) when there's only one to begin with.
    text: 'Ya viene una elegida por defecto, pero si hay más de una tienes que tocarla para confirmarla — si no, no te va a dejar añadir al carrito.',
    action: '👉 Toca una talla.',
    gated: true,
    skipIf: (el) => el.querySelectorAll('.size-btn').length <= 1,
    skipToast: 'Este producto solo tiene una talla — cuando un producto tenga más, podrás elegirla aquí.',
    // "Saltar" (pressed on purpose, not via skipIf above) skips the rest of
    // the shopping section.
    skipNext: afterShopping,
    next: 'color',
  },
  color: {
    id: 'color',
    selector: '.swatches',
    title: 'Elige un color',
    text: 'Igual que la talla: si hay más de un color, tócalo para confirmarlo.',
    action: '👉 Toca un color.',
    gated: true,
    skipIf: (el) => el.querySelectorAll('.swatch').length <= 1,
    skipToast: 'Este producto solo tiene un color — cuando un producto tenga más, podrás elegirlo aquí.',
    skipNext: afterShopping,
    next: 'quantity',
  },
  quantity: {
    id: 'quantity',
    selector: '.detail-body .qty-stepper',
    title: 'Elige la cantidad',
    text: 'Con + y − (o escribiendo el número) decides cuántas piezas de esta talla y color quieres.',
    action: '👉 Toca "Siguiente" cuando estés listo.',
    next: 'cart',
  },
  cart: {
    id: 'cart',
    selector: '.detail-footer .btn--primary',
    title: '¡Agrégalo al carrito!',
    text: 'Mientras más piezas juntes, más baja el precio por unidad.',
    action: '👉 Toca "Añadir al carrito".',
    gated: true,
    onEnter: (ctx) => {
      ctx.markProductFlowDone()
      ctx.resetCartStepPractice()
    },
    next: 'cart-drawer-item',
    // Skipping never actually adds anything — the next few steps all
    // explain a cart item that, in that case, doesn't exist (an empty
    // drawer, no total, no send button to demonstrate) — so this skips the
    // rest of the shopping section entirely, same as the other gated steps
    // in it.
    skipNext: afterShopping,
  },
  'cart-drawer-item': {
    id: 'cart-drawer-item',
    selector: '.cart-drawer__item',
    title: 'Así se ve tu carrito',
    // Prices never show on the product page itself (se confirman por
    // WhatsApp) — the cart is the first place a real price appears, and it
    // recalculates live against the current Mayoreo/paquete rules on every
    // + or − tap, with no extra step needed to see it update.
    text: 'Aquí está lo que acabas de agregar: talla, color, piezas — y el precio por pieza, que puede bajar entre más agregues.',
    action: '👉 Toca + un par de veces y mira cómo cambia el precio.',
    onEnter: (ctx) => ctx.openDrawer(),
    next: 'cart-drawer-total',
  },
  'cart-drawer-total': {
    id: 'cart-drawer-total',
    // Deliberately NOT .cart-drawer__footer — that also contains the real
    // "Enviar pedido" button, which would let the shopper actually send a
    // real order here, a full step before the tour even gets to explain
    // (and intercept) it.
    selector: '.cart-total',
    title: 'Tu total',
    text: 'Aquí ves cuánto vas a pagar en total, con tus descuentos ya aplicados.',
    action: '👉 Toca "Siguiente" para ver cómo se envía tu pedido.',
    next: 'cart-send',
  },
  'cart-send': {
    id: 'cart-send',
    selector: '.cart-drawer .btn--whatsapp',
    title: 'Enviar tu pedido',
    text: 'Así se manda tu pedido por WhatsApp para confirmarlo con nosotros.',
    action: '👉 Toca "Enviar pedido" para ver cómo funciona.',
    gated: true,
    intercept: true,
    interceptToast: '✅ Así se enviaría tu pedido — no se mandó nada, esto solo es el tutorial.',
    // "Anterior" from 'favorite' closes the drawer on ITS OWN onEnter (see
    // below) — without reopening it here too, coming back lands on a step
    // whose target lives inside a now-closed drawer, same broken "nothing to
    // spotlight" state as 'product'/'cotizador'/'favorite'. Safe to call
    // forward too (opening an already-open drawer is a no-op).
    onEnter: (ctx) => ctx.openDrawer(),
    skipNext: afterShopping,
    next: 'favorite',
  },
  favorite: {
    id: 'favorite',
    selector: '.detail-footer .icon-btn--bordered',
    title: 'Guárdalo en favoritos',
    text: 'Así lo encuentras después sin tener que buscarlo de nuevo.',
    action: '👉 Toca el corazón para guardarlo.',
    gated: true,
    // "Anterior" can land here from 'packages-nav' or 'account-nav', both of
    // which navigate elsewhere on their own way in — without getting back to
    // a product page first, this step's target (.detail-footer) doesn't
    // exist wherever they left off, same "nothing to spotlight" bug as the
    // others. goToLastProduct re-opens the same product the shopper was
    // actually just looking at.
    onEnter: (ctx) => {
      ctx.closeDrawer()
      if (!document.querySelector('.detail-footer')) ctx.goToLastProduct()
    },
    next: (ctx) => (ctx.packagesFlowDone ? 'account-nav' : 'packages-nav'),
  },
  'packages-nav': {
    id: 'packages-nav',
    selector: '[data-tour="packages-pill"]',
    title: '¿Sabías que hay paquetes?',
    text: 'Un paquete junta varias prendas con un precio especial por comprarlas combinadas.',
    action: '👉 Toca "Paquetes" arriba.',
    gated: true,
    onEnter: (ctx) => ctx.navigate('/'),
    // "Saltar" here skips the whole Paquetes section, straight to Cuenta.
    skipNext: 'account-nav',
    next: 'packages-info',
  },
  'packages-info': {
    id: 'packages-info',
    selector: '.section__header',
    title: 'Paquetes',
    text: 'Aquí ves combos ya armados con precio especial. Toca "Elige tus productos" en cualquiera para empezar a armar el tuyo.',
    action: '👉 Toca "Siguiente" para seguir.',
    onEnter: (ctx) => ctx.markPackagesFlowDone(),
    next: 'packages-waiting',
  },
  'packages-waiting': {
    id: 'packages-waiting',
    // No target/blocking here on purpose — "Elige tus productos" lives
    // inside whichever package card the shopper scrolls to, so this step
    // just floats a tip and lets them explore the whole page freely instead
    // of pinning a hole to one specific spot. The moment they actually tap
    // it, the tour notices (activeCollection turns non-null) and jumps
    // straight to 'packages-picking' on its own — Siguiente is just the
    // escape valve for someone who'd rather skip trying one right now.
    selector: null,
    blocking: false,
    title: 'Armando tu paquete',
    text: 'Toca "Elige tus productos" en cualquier paquete que te guste.',
    action: '👉 En cuanto lo toques, seguimos desde ahí.',
    next: (ctx) => (ctx.productFlowDone ? 'account-nav' : 'product'),
  },
  'packages-picking': {
    id: 'packages-picking',
    // Title/text/action are overridden live from the real package-builder
    // state in the render (see displayTitle/displayText below) — these are
    // just the fallback while that data hasn't resolved yet. Not blocking,
    // same reasoning as 'packages-waiting': the products still needed could
    // be any card anywhere on the page, not just the progress pill itself
    // (which only needs to stay visible, not "unblocked").
    selector: '.build-progress-pill',
    blocking: false,
    title: 'Armando tu paquete',
    text: 'Ve tocando "Agregar" en las prendas que quieras hasta completarlo.',
    action: '👉 Una barra te va diciendo cuánto te falta.',
    // Where this leads is decided at runtime, not here — see the
    // 'packages-picking' → null watcher effect, which routes to
    // 'packages-completed' if the build actually finished (added to the
    // cart) or straight past it if it was cancelled instead.
    next: (ctx) => (ctx.productFlowDone ? 'account-nav' : 'product'),
  },
  'packages-completed': {
    id: 'packages-completed',
    // addSelectedToCart() already opens the drawer itself once a real
    // build hits its target — no onEnter needed to show it.
    selector: '.cart-drawer__item',
    title: '¡Tu paquete está listo!',
    text: 'Se agregó completo a tu carrito — aquí ves cada prenda que armaste.',
    action: '👉 Toca "Siguiente" para seguir.',
    next: (ctx) => (ctx.productFlowDone ? 'account-nav' : 'product'),
  },
  cotizador: {
    id: 'cotizador',
    selector: '[data-tour="cotizador-bubble"]',
    title: '¿Compras por mayoreo?',
    text: 'El Cotizador te dice tu precio por pieza antes de comprar.',
    action: '👉 Toca este botón.',
    gated: true,
    expectPath: '/cotizador',
    // Same safety net as 'product' — a lingering real build (from exploring
    // packages, in either branch) shouldn't follow the shopper any further.
    // CotizadorBubble hides itself on the Cotizador page (see its own
    // comment) — "Anterior" from 'cotizador-fields' lands back here while
    // STILL on /cotizador, where the bubble this step spotlights doesn't
    // exist at all, same "nothing to point at" bug as the other steps.
    onEnter: (ctx) => {
      ctx.cancelPackageBuild()
      if (!document.querySelector('[data-tour="cotizador-bubble"]')) ctx.navigate('/')
    },
    // "Saltar" here skips the whole Cotizador section (fields/table/summary
    // included) — straight to normal shopping, or to the end for the
    // Cotizador-only tutorial, since there'd be nothing left to show it.
    skipNext: (ctx) => (ctx.cotizadorOnly ? 'outro' : 'category'),
    next: 'cotizador-fields',
  },
  'cotizador-fields': {
    id: 'cotizador-fields',
    selector: '.cotizador-fields',
    title: 'Arma tu cotización',
    // Deliberately no specific category names — which ones actually show
    // here depends on what has real stock right now (see Cotizador.tsx's
    // visibleTypes), so naming one that's currently hidden would describe a
    // field that isn't even on screen.
    text: 'Escribe cuántas piezas quieres de cada tipo que veas aquí.',
    action: '👉 Toca + en los campos que quieras, y luego "Siguiente".',
    // Not gated — a real click no longer snatches the shopper away after
    // just one tap, since they might want to fill in several fields before
    // moving on. Real interaction inside the hole still works normally.
    next: 'cotizador-table',
  },
  'cotizador-table': {
    id: 'cotizador-table',
    selector: '.cotizador-table-wrap',
    title: 'Mientras más compras, menos pagas',
    text: 'El precio por pieza baja según el total combinado — prendas normales y paquetes cuentan juntos para el mismo descuento.',
    action: '👉 Toca "Siguiente" para ver tu precio.',
    next: 'cotizador-summary',
  },
  'cotizador-summary': {
    id: 'cotizador-summary',
    selector: '.cotizador-summary',
    title: 'Tu cotización',
    text: 'Aquí ves el desglose — cuántas piezas, a qué precio, y el total. Si la guardas, aparece justo aquí abajo en "Cotizaciones guardadas" para que la retomes cuando quieras.',
    action: '👉 Toca "Guardar esta cotización" si quieres (opcional), o "Siguiente".',
    // The Cotizador sub-flow runs FIRST (right after intro) — once it's
    // done, on into the normal shopping flow, which merges back to
    // 'account-nav' at the end regardless of which branch (plain product or
    // packages) the shopper took. Except in the Cotizador-only tutorial
    // (launched straight from "Abrir el Cotizador" in the first-visit modal,
    // see tourMode) — that one ends right here instead, since it was never
    // meant to also walk through buying something.
    next: (ctx) => (ctx.cotizadorOnly ? 'outro' : 'category'),
  },
  'account-nav': {
    id: 'account-nav',
    selector: '[data-tour="account-nav"]',
    title: 'Tu cuenta',
    text: 'Ahí guardas tu carrito, tus favoritos y ves tus pedidos.',
    // The real action text is picked at render time (see displayAction) —
    // the icon this points at lives in the bottom nav on mobile but in the
    // header on desktop, so a fixed "aquí abajo" is wrong half the time.
    action: '👉 Toca el ícono de cuenta.',
    gated: true,
    expectPath: '/cuenta',
    // Reached right after a package finishes (packages-completed leaves the
    // cart drawer open on purpose, to show what got added) — without
    // closing it here, the drawer overlay sits on top of the account icon
    // this step points at, both visually and for real clicks. Safe
    // regardless of path (closing an already-closed drawer is a no-op).
    onEnter: (ctx) => ctx.closeDrawer(),
    // "Saltar" here skips the rest of the tour entirely — Cuenta is the last
    // section before the ending.
    skipNext: 'outro',
    next: 'account-info',
  },
  'account-info': {
    id: 'account-info',
    selector: '.profile-card, .auth-card',
    title: 'Mi cuenta',
    // Overridden at render time for a shopper who's already logged in (see
    // displayText) — this default only fits a guest, who's the one actually
    // seeing the login prompt this describes.
    text: 'Inicia sesión con Google para que tu carrito y favoritos te sigan en cualquier dispositivo.',
    action: '👉 Toca "Siguiente" cuando quieras.',
    next: 'outro',
  },
  outro: {
    id: 'outro',
    selector: null,
    title: '¡Listo! 🎉',
    text: 'Ya sabes cómo comprar en Andary Shop. Vamos a quitar lo que agregaste de práctica de tu carrito, favoritos y cotizaciones.',
    action: '👉 Toca "Entendido" para terminar.',
    next: FINISH,
  },
}

const SPOTLIGHT_PADDING = 8
const TOOLTIP_MARGIN = 16
// A conservative estimate — the tooltip's real height varies with the text,
// and using `bottom`/`top` anchoring below (not a computed pixel height)
// means this only has to be "big enough to trigger the right branch", never
// pixel-exact.
const TOOLTIP_HEIGHT_ESTIMATE = 300
// Gives the shopper a moment to actually see the result of their tap (a
// size turning active, the cart bubble popping in) before the tour moves on.
const ADVANCE_DELAY = 550
const OPTIONAL_TIMEOUT = 1400

function cartLineKey(item: { productId: number; size: string; colorName: string; isGift?: boolean }) {
  return `${item.productId}-${item.size}-${item.colorName}-${item.isGift ? 'gift' : 'paid'}`
}

/** Some targets exist twice in the DOM — a mobile version (BottomNav) and a
 * desktop one (Header) — with only one actually visible at a given screen
 * width; the other typically has `display: none`, which still matches
 * querySelector but reports an all-zero rect, not "absent". Picks the first
 * match that actually has real size instead of just the first in DOM order. */
function findVisibleElement(selector: string): Element | null {
  const matches = document.querySelectorAll(selector)
  for (const el of matches) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return null
}

const TOOLTIP_WIDTH_ESTIMATE = 300

/** Picks a spot for the tooltip that never overlaps the spotlighted rect:
 * below it if there's room, above it (anchored by `bottom`, so it hugs the
 * target regardless of the tooltip's real rendered height) if not, beside it
 * — left or right — for a target too TALL to leave vertical room either way
 * (a long price table), and finally pinned to whichever screen edge is
 * farthest from the target if there's truly no room anywhere. */
function tooltipStyle(rect: DOMRect | null, blocking: boolean): CSSProperties {
  const clampLeft = (x: number) => Math.min(Math.max(TOOLTIP_MARGIN, x), window.innerWidth - TOOLTIP_WIDTH_ESTIMATE - TOOLTIP_MARGIN)
  const clampTop = (y: number) => Math.min(Math.max(TOOLTIP_MARGIN, y), window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_MARGIN)
  if (!blocking) {
    // Non-blocking means the real thing to interact with could be anywhere
    // on the page (any product card, not just the one rect we might be
    // pointing at) — hugging that rect like the blocking case does would
    // just as likely park the tooltip on top of the very card the shopper
    // needs to tap. But when there IS a specific, stably-positioned rect
    // (e.g. the build-progress pill, always stuck to the bottom bar), it
    // still reads better sitting right above THAT than parked at the very
    // top of a possibly long, scrolled page — anchored by `bottom` so it
    // hugs the pill regardless of the tooltip's real rendered height.
    return rect
      ? { bottom: window.innerHeight - rect.top + TOOLTIP_MARGIN, left: clampLeft(rect.left) }
      : { top: TOOLTIP_MARGIN, left: '50%', transform: 'translateX(-50%)' }
  }
  if (!rect) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  if (spaceBelow >= TOOLTIP_HEIGHT_ESTIMATE + TOOLTIP_MARGIN) {
    return { top: rect.bottom + TOOLTIP_MARGIN, left: clampLeft(rect.left) }
  }
  if (spaceAbove >= TOOLTIP_HEIGHT_ESTIMATE + TOOLTIP_MARGIN) {
    return { bottom: window.innerHeight - rect.top + TOOLTIP_MARGIN, left: clampLeft(rect.left) }
  }
  const spaceRight = window.innerWidth - rect.right
  const spaceLeft = rect.left
  if (spaceRight >= TOOLTIP_WIDTH_ESTIMATE + TOOLTIP_MARGIN) {
    return { left: rect.right + TOOLTIP_MARGIN, top: clampTop(rect.top) }
  }
  if (spaceLeft >= TOOLTIP_WIDTH_ESTIMATE + TOOLTIP_MARGIN) {
    return { right: window.innerWidth - rect.left + TOOLTIP_MARGIN, top: clampTop(rect.top) }
  }
  return spaceBelow > spaceAbove
    ? { bottom: TOOLTIP_MARGIN, left: clampLeft(rect.left) }
    : { top: TOOLTIP_MARGIN, left: clampLeft(rect.left) }
}

/** A short, one-time guided tour of how to shop the storefront — shown once
 * per device on the home page, right after the size-preference modal is out
 * of the way (or after a short fallback delay, in case that modal never had
 * anything to show). Can also be replayed from Mi cuenta.
 *
 * A "gated" step blocks clicks everywhere EXCEPT the one highlighted
 * element, so the only thing the shopper can do is the exact thing being
 * taught — and because it's a real click reaching the real page, the app
 * behaves exactly as it would outside the tour. The one exception is "send
 * order", which is intercepted so nothing is actually sent. It opens with
 * the Cotizador (Mayoreo pricing explained up front, before any shopping),
 * then moves into the normal shopping flow — choosing a category vs.
 * "Paquetes" branches into two different explanations that both merge back
 * into the same Cuenta ending. Whatever cart/favorites/quote changes
 * happened are undone once the tour ends. */
export default function OnboardingTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, removeItem, openDrawer, closeDrawer, cartBumpId } = useCart()
  const { favorites, toggleFavorite } = useFavorites()
  const { quotes, deleteQuote } = useQuotes()
  const { activeCollection, comboPartProgress, target, selected, cancel: cancelPackageBuild } = usePackageBuilder()
  const { showToast } = useToast()
  const { customer } = useCustomerAuth()

  const [tourSeen, setTourSeen] = useLocalStorage('andary-tour-seen', false)
  const [ready, setReady] = useState(false)
  // Set by SizePreferenceModal's "Abrir el Cotizador" button right before it
  // clears `andary-tour-seen` and reloads — read once here the same way, so
  // a fresh mount (the only time this component ever re-decides anything)
  // picks it up. 'full' (the default for every other way the tour starts,
  // including "Ver tutorial") walks the whole shopping flow as usual.
  const [tourMode] = useState<'full' | 'cotizador'>(() =>
    localStorage.getItem('andary-tour-mode') === 'cotizador' ? 'cotizador' : 'full'
  )
  const [stepId, setStepId] = useState(tourMode === 'cotizador' ? 'cotizador' : 'intro')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const advancingRef = useRef(false)
  const cartBumpAtPickingStartRef = useRef<number | null>(null)
  const historyRef = useRef<string[]>([])
  const stepEnteredAtRef = useRef(Date.now())
  const productFlowDoneRef = useRef(false)
  const packagesFlowDoneRef = useRef(false)
  const initialItemsRef = useRef<CartItem[] | null>(null)
  const initialFavoritesRef = useRef<FavoriteProduct[] | null>(null)
  const initialQuotesRef = useRef<SavedQuote[] | null>(null)
  // Tracks the most recent /producto/:slug page the tour has been on, so a
  // step whose target only exists there (favorite) can get back to it when
  // re-entered via "Anterior" from somewhere that navigated elsewhere in the
  // meantime — nothing else in the chain remembers which product it was.
  const lastProductPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (location.pathname.startsWith('/producto/')) lastProductPathRef.current = location.pathname
  }, [location.pathname])
  // Snapshot of the cart the moment the 'cart' step is (re-)entered — see
  // resetCartStepPractice below.
  const cartSnapshotRef = useRef<CartItem[] | null>(null)

  // SizePreferenceModal is a separate component with its own localStorage-
  // backed state — reading that key through useLocalStorage here would only
  // ever reflect this component's own (stale) initial read, never the
  // modal's real dismissal while both are mounted in the same session. This
  // polls the storage directly instead, so a real customer picking sizes
  // and tapping "Listo" is noticed immediately, however long that takes —
  // the tour only falls back to a fixed wait for the one case with no
  // dismissal event at all: the modal deciding there's nothing to show it
  // (no products with sizes yet), where it just renders nothing.
  useEffect(() => {
    const startedAt = Date.now()
    function check() {
      // useLocalStorage JSON-serializes its value, so an un-dismissed modal
      // still writes the literal string "false" here on mount — a plain
      // truthy check on the raw string would treat that as "dismissed"
      // immediately.
      if (localStorage.getItem('andary-size-modal-dismissed') === 'true') return true
      if (Date.now() - startedAt > 2000 && !document.querySelector('.size-modal-overlay')) return true
      return false
    }
    if (check()) {
      setReady(true)
      return
    }
    const interval = window.setInterval(() => {
      if (check()) {
        setReady(true)
        window.clearInterval(interval)
      }
    }, 400)
    return () => window.clearInterval(interval)
  }, [])

  const active = !tourSeen && ready
  const step = active ? STEPS[stepId] : null

  // (Re)starts cleanly every time the tour goes from hidden to showing —
  // covers both the very first visit and a replay from Mi cuenta.
  useEffect(() => {
    if (!active) return
    setStepId(tourMode === 'cotizador' ? 'cotizador' : 'intro')
    historyRef.current = []
    productFlowDoneRef.current = false
    packagesFlowDoneRef.current = false
    cartSnapshotRef.current = null
    initialItemsRef.current = items
    initialFavoritesRef.current = favorites
    initialQuotesRef.current = quotes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const ctx: TourCtx = {
    navigate,
    openDrawer,
    closeDrawer,
    markProductFlowDone: () => {
      productFlowDoneRef.current = true
    },
    markPackagesFlowDone: () => {
      packagesFlowDoneRef.current = true
    },
    cancelPackageBuild,
    goToLastProduct: () => {
      if (!lastProductPathRef.current) return false
      navigate(lastProductPathRef.current)
      return true
    },
    resetCartStepPractice: () => {
      const before = cartSnapshotRef.current
      if (before === null) {
        cartSnapshotRef.current = items
        return
      }
      for (const item of items) {
        const stillThere = before.some((b) => cartLineKey(b) === cartLineKey(item))
        if (!stillThere) removeItem(item.productId, item.size, item.colorName, item.isGift)
      }
      cartSnapshotRef.current = items.filter((item) => before.some((b) => cartLineKey(b) === cartLineKey(item)))
    },
  }

  useEffect(() => {
    if (!step) return
    stepEnteredAtRef.current = Date.now()
    step.onEnter?.(ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, active])

  useEffect(() => {
    if (!step?.selector) {
      setRect(null)
      return
    }
    const selector = step.selector
    // Non-blocking steps let the shopper freely scroll/browse the whole
    // page — repeatedly recentering on the target (its own fixed position
    // means it's already always on screen anyway) would just fight them,
    // and calling scrollIntoView on every 300ms poll (even for a blocking
    // step) can make Playwright/real layout see the element as "never
    // settled", so this only ever scrolls once, right when first found.
    const shouldAutoScroll = step.blocking !== false
    // Scrolls once on the first successful measurement, same as before —
    // but a step entered right after a real navigation (e.g. "Saltar"
    // jumping to a step whose onEnter just navigated somewhere new) can
    // land on a page that's still fetching/rendering its real content: the target found
    // right then may sit at a rect based on a shorter/placeholder layout,
    // and by the time the real content finishes loading (which can happen
    // more than once, and at any point) the element has shifted far from
    // where an earlier scroll landed. RE-scrolling only when the target is
    // later found genuinely off-screen (not on every poll — that's what
    // previously destabilized Playwright/real layout "settled" checks)
    // corrects for that without reintroducing the constant-recentering
    // problem this one-shot design was built to avoid. A cooldown (rather
    // than a hard attempt cap) between retries gives each smooth-scroll
    // animation time to actually finish before being re-judged — without
    // it, a poll landing mid-animation reads a still-moving rect as "still
    // off-screen" and fires ANOTHER correction before the first even
    // completes, burning through a fixed budget on false alarms and leaving
    // none left for a real, later content shift.
    let hasScrolledOnce = false
    let lastScrollAt = 0
    let skipped = false
    const SCROLL_RETRY_COOLDOWN = 600
    function measure() {
      const el = findVisibleElement(selector)
      // Checked only once the target is actually found — e.g. "only one
      // size/color exists, nothing to really choose" (see 'size'/'color').
      // `skipped` stops the still-running 300ms poll below from calling
      // goTo again before this effect's cleanup (on the resulting step
      // change) actually unregisters it.
      if (el && !skipped && step!.skipIf?.(el)) {
        skipped = true
        if (step!.skipToast) showToast(step!.skipToast)
        goTo(resolveNext(step!, null), step!.id)
        return
      }
      const rect = el ? el.getBoundingClientRect() : null
      setRect(rect)
      const offScreen = !!rect && (rect.bottom < 0 || rect.top > window.innerHeight)
      const cooledDown = Date.now() - lastScrollAt > SCROLL_RETRY_COOLDOWN
      if (el && shouldAutoScroll && cooledDown && (!hasScrolledOnce || offScreen)) {
        hasScrolledOnce = true
        lastScrollAt = Date.now()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // The category pills row scrolls HORIZONTALLY on its own (narrow
        // mobile widths can't fit every pill) — centering the row
        // vertically on the page (above) says nothing about whether
        // "Paquetes" itself is actually scrolled into view within that row,
        // so on this step it also gets its own, separate scrollIntoView to
        // bring it into reach without the shopper needing to discover the
        // swipe themselves.
        if (step!.id === 'category') {
          const packagesPill = findVisibleElement('[data-tour="packages-pill"]')
          packagesPill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' })
        }
      }
      if (!el && step!.optional && Date.now() - stepEnteredAtRef.current > OPTIONAL_TIMEOUT) {
        goTo(resolveNext(step!, null))
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    // Cheap poll instead of a MutationObserver — targets come from pages
    // still loading their own data, or a step that just navigated.
    const interval = window.setInterval(measure, 300)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, location.pathname])

  function resolveBranch(next: TourStep['next'], clickedEl: HTMLElement | null): string {
    if (typeof next === 'function') {
      return next({
        clickedPackages: !!clickedEl?.closest('[data-tour="packages-pill"]'),
        productFlowDone: productFlowDoneRef.current,
        packagesFlowDone: packagesFlowDoneRef.current,
        cotizadorOnly: tourMode === 'cotizador',
      })
    }
    return next
  }

  function resolveNext(current: TourStep, clickedEl: HTMLElement | null): string {
    return resolveBranch(current.next, clickedEl)
  }

  // `fromId`, when given, makes this a no-op if the tour already left that
  // step by the time it actually runs — needed because a gated step with
  // `expectPath` can be advanced from two independent triggers (the click
  // listener's delayed timeout, and the expectPath watcher noticing the URL
  // already changed): whichever fires first should win, and the other must
  // not push a second, duplicate copy of the (by then already-current) step
  // onto the history stack, which otherwise makes "Anterior" look broken —
  // popping that duplicate just lands back on the same step.
  function goTo(nextId: string, fromId?: string) {
    if (nextId === FINISH) {
      finish()
      return
    }
    setStepId((current) => {
      if (fromId !== undefined && current !== fromId) return current
      historyRef.current.push(current)
      return nextId
    })
  }

  // The only way anything happens during a gated step: a real click lands on
  // a real interactive element that isn't part of the tour's own UI — since
  // everything else on the page is blocked, that click can only be the one
  // thing this step is teaching. An "intercept" step still reacts to the
  // click, but swallows it before the page's own handler ever sees it.
  useEffect(() => {
    if (!step?.gated) return
    advancingRef.current = false
    function handleClick(e: MouseEvent) {
      if (advancingRef.current) return
      const target = e.target as HTMLElement
      if (target.closest('.tour-tooltip')) return
      if (target.closest('.tour-block')) return
      if (step!.ignoreSelector && target.closest(step!.ignoreSelector)) return
      if (!target.closest('button, a')) return
      if (step!.intercept) {
        e.preventDefault()
        e.stopPropagation()
        if (step!.interceptToast) showToast(step!.interceptToast)
      }
      advancingRef.current = true
      window.setTimeout(() => goTo(resolveNext(step!, target), step!.id), ADVANCE_DELAY)
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // While waiting for the shopper to tap "Elige tus productos" on whichever
  // real package they liked, a build actually starting (activeCollection
  // turning non-null) is itself the signal to jump straight into live
  // tracking — no need to wait for a click inside a hole that could be
  // anywhere on the page.
  useEffect(() => {
    if (stepId !== 'packages-waiting' || !activeCollection) return
    // Snapshot right as tracking starts — comparing against this later is
    // how the exit effect tells "finished for real" (something got added)
    // apart from "cancelled" (nothing did).
    cartBumpAtPickingStartRef.current = cartBumpId
    goTo('packages-picking')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, activeCollection])

  // And the reverse while tracking: once that real build finishes (target
  // reached, auto-added to cart by PackageBuilderContext) or gets cancelled
  // from the picker bar itself, activeCollection goes back to null — that's
  // this step's real completion, not a click. A bump in cartBumpId since
  // tracking started means it actually finished (worth a "here's your cart"
  // detour); unchanged means it was cancelled instead (nothing to show).
  useEffect(() => {
    if (stepId !== 'packages-picking' || activeCollection) return
    const completed = cartBumpAtPickingStartRef.current !== null && cartBumpId !== cartBumpAtPickingStartRef.current
    cartBumpAtPickingStartRef.current = null
    goTo(completed ? 'packages-completed' : resolveNext(STEPS['packages-picking'], null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, activeCollection])

  function matchesExpectedPath(s: TourStep, pathname: string): boolean {
    if (s.expectPath) return pathname === s.expectPath
    if (s.expectPathPrefix) return pathname.startsWith(s.expectPathPrefix)
    return false
  }

  // Arms the expectPath/expectPathPrefix safety net below only when this
  // step is entered from somewhere that ISN'T already at the destination
  // path. Without this, stepping "Anterior" back into a gated step whose
  // real click navigates (account-nav, cotizador, product) — while the app
  // is still sitting on that same route, since going back through the
  // TOUR's own history doesn't undo the real navigation — would see the
  // path already matching and immediately auto-advance forward again,
  // making "Anterior" look like it does nothing.
  const expectPathArmedRef = useRef(false)
  useEffect(() => {
    if (!step) return
    const hasExpectation = !!step.expectPath || !!step.expectPathPrefix
    expectPathArmedRef.current = hasExpectation && !matchesExpectedPath(step, location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id])

  // Safety net for steps with `expectPath`/`expectPathPrefix` (account-nav,
  // cotizador, product): if the real click already got us to the expected
  // page, that alone is proof enough to move on, even if the click-
  // listener's own detection somehow missed the click (or, on 'product',
  // deliberately ignored it — see `ignoreSelector` — because it couldn't
  // yet tell whether it would actually navigate).
  useEffect(() => {
    if ((!step?.expectPath && !step?.expectPathPrefix) || !step.gated) return
    if (!expectPathArmedRef.current) return
    if (!matchesExpectedPath(step, location.pathname)) return
    goTo(resolveNext(step, null), step.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, location.pathname])

  if (!active || !step) return null

  function finish() {
    cancelPackageBuild()
    const beforeItems = initialItemsRef.current ?? []
    for (const item of items) {
      const stillThere = beforeItems.some((b) => cartLineKey(b) === cartLineKey(item))
      if (!stillThere) removeItem(item.productId, item.size, item.colorName, item.isGift)
    }
    const beforeFavs = initialFavoritesRef.current ?? []
    for (const fav of favorites) {
      if (!beforeFavs.some((b) => b.id === fav.id)) toggleFavorite(fav)
    }
    const beforeQuotes = initialQuotesRef.current ?? []
    for (const quote of quotes) {
      if (!beforeQuotes.some((b) => b.id === quote.id)) deleteQuote(quote.id)
    }
    initialItemsRef.current = null
    initialFavoritesRef.current = null
    initialQuotesRef.current = null
    setTourSeen(true)
    navigate('/')
  }

  function goNext() {
    goTo(resolveNext(step!, null))
  }

  function goBack() {
    const prev = historyRef.current.pop()
    if (prev) setStepId(prev)
  }

  function skipStep() {
    goTo(resolveBranch(step!.skipNext ?? step!.next, null))
  }

  const isFirst = historyRef.current.length === 0
  const isLast = step.next === FINISH

  // 'packages-picking' has no fixed text — it reports live progress on
  // whichever real collection the shopper actually started, using the same
  // per-part breakdown the real PackagePickerBar shows (comboPartProgress),
  // or a flat "N piezas" count for a bundle/unit-mode package.
  let displayTitle = step.title
  let displayText = step.text
  let displayAction = step.action
  if (stepId === 'packages-picking' && activeCollection) {
    displayTitle = `Armando "${activeCollection.name}"`
    if (comboPartProgress.length > 0) {
      const remaining = comboPartProgress.filter((p) => p.remaining > 0)
      displayText =
        remaining.length > 0
          ? `Te falta: ${remaining.map((p) => `${p.remaining} ${p.part.category_name}`).join(', ')}.`
          : 'Falta muy poco.'
    } else {
      const remainingFlat = Math.max(0, target - selected.length)
      displayText = remainingFlat > 0 ? `Te faltan ${remainingFlat} piezas para completarlo.` : 'Falta muy poco.'
    }
  }
  // The account icon lives in the bottom nav on mobile but in the header on
  // desktop — same real element (found via findVisibleElement), just in two
  // different spots — so the instruction only names a side once we actually
  // know which one is on screen (rect.top in the upper half of the viewport
  // means the header/desktop copy is the one showing).
  if (stepId === 'account-nav') {
    displayAction = rect && rect.top < window.innerHeight / 2 ? '👉 Toca el ícono de cuenta arriba.' : '👉 Toca "Cuenta" aquí abajo.'
  }
  // A shopper who's already logged in sees their profile here, not the
  // Google sign-in prompt the default text describes.
  if (stepId === 'account-info' && customer) {
    displayText = 'Aquí ves tu perfil, tu carrito y tus favoritos — siempre disponibles en cualquier dispositivo donde inicies sesión.'
  }
  // The Cotizador-only tutorial never touches the cart/favorites — only
  // possibly a saved quote — so the default "comprar"/cart-cleanup wording
  // doesn't fit what this shorter run actually covered.
  if (stepId === 'outro' && tourMode === 'cotizador') {
    displayText = 'Ya sabes usar el Cotizador. Vamos a quitar la cotización de práctica que hayas guardado.'
  }

  // The 4-rectangle "hole" — everything except the spotlighted rect is
  // covered by a real, click-swallowing layer, which is what actually
  // enforces "don't let them do anything else".
  const holeTop = rect ? rect.top - SPOTLIGHT_PADDING : 0
  const holeLeft = rect ? rect.left - SPOTLIGHT_PADDING : 0
  const holeRight = rect ? rect.right + SPOTLIGHT_PADDING : 0
  const holeBottom = rect ? rect.bottom + SPOTLIGHT_PADDING : 0

  return (
    <div className="tour-overlay" role="dialog" aria-live="polite">
      {step.blocking !== false &&
        (rect ? (
          <>
            <div className="tour-block" style={{ top: 0, left: 0, right: 0, height: Math.max(0, holeTop) }} />
            <div className="tour-block" style={{ top: holeBottom, left: 0, right: 0, bottom: 0 }} />
            <div
              className="tour-block"
              style={{ top: holeTop, left: 0, width: Math.max(0, holeLeft), height: holeBottom - holeTop }}
            />
            <div className="tour-block" style={{ top: holeTop, left: holeRight, right: 0, height: holeBottom - holeTop }} />
          </>
        ) : (
          <div className="tour-block tour-block--full" />
        ))}
      {/* The decorative ring stays even when not blocking — it's purely
          visual (pointer-events: none), so it can still point out the real
          progress pill without stopping the shopper from tapping anywhere
          else on the page. */}
      {rect && (
        <div
          className="tour-spotlight-ring"
          style={{ top: holeTop, left: holeLeft, width: holeRight - holeLeft, height: holeBottom - holeTop }}
        />
      )}
      <div className="tour-tooltip" style={tooltipStyle(rect, step.blocking !== false)}>
        <button type="button" className="tour-tooltip__close" onClick={finish} aria-label="Cerrar tutorial">
          <CloseIcon />
        </button>
        <h3>{displayTitle}</h3>
        <p>{displayText}</p>
        <p className="tour-tooltip__cta">{displayAction}</p>
        <div className="tour-tooltip__actions">
          {step.gated ? (
            <button type="button" className="btn btn--ghost btn--sm tour-tooltip__skip-only" onClick={skipStep}>
              Saltar
            </button>
          ) : (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={goBack} disabled={isFirst}>
                Anterior
              </button>
              <button type="button" className="btn btn--primary btn--sm" onClick={goNext}>
                {isLast ? 'Entendido' : 'Siguiente'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
