/** A short, synthesized sleigh-bells chime (no audio file to ship/license)
 * — four quick bell-like tones in a rising arpeggio. Safe to call from any
 * click handler (a real user gesture, which is what browsers require to
 * let a fresh AudioContext actually produce sound); silently does nothing
 * if Web Audio is unavailable or blocked. */
export function playSleighBells() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const notes = [1046.5, 1318.5, 1568, 2093]
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.09
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.28, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.42)
    })
    setTimeout(() => ctx.close(), 900)
  } catch {
    // Web Audio unavailable/blocked — the toast message alone still lands.
  }
}
