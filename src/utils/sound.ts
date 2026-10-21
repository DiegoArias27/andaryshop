let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

function beep(frequencies: number[], duration = 0.09, gap = 0.07) {
  const audioCtx = getContext()
  if (!audioCtx) return
  frequencies.forEach((freq, i) => {
    const start = audioCtx.currentTime + i * gap
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.001, start)
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  })
}

export function playAddToCartSound() {
  beep([880, 1175])
}

/** A short, neutral "heads up" chime for toast nudges (e.g. "Elige un
 * color") — distinct from the celebratory add/favorite sounds. */
export function playToastSound() {
  beep([740, 620], 0.08, 0.06)
}

/** A quick upward pitch-bend "pop" — like a little bubble — for the
 * double-tap-to-favorite gesture on the catalog. */
export function playFavoriteSound() {
  const audioCtx = getContext()
  if (!audioCtx) return
  const start = audioCtx.currentTime
  const duration = 0.16
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(520, start)
  osc.frequency.exponentialRampToValueAtTime(1050, start + duration)
  gain.gain.setValueAtTime(0.001, start)
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}
