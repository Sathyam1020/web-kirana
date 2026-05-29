// Web Audio chime with a mobile-safe unlock. Browsers (especially iOS Safari)
// only let an AudioContext produce sound if it was created/resumed inside a
// real user gesture — an AudioContext spun up later in an effect starts
// "suspended" and stays silent. So we prime a single shared context on the tap
// (primeAudio) and play through it when the success screen mounts.

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (Ctor === undefined) return null
  ctx ??= new Ctor()
  return ctx
}

/** Call inside a user-gesture handler (e.g. the place-order tap) to unlock audio. */
export function primeAudio(): void {
  const c = getCtx()
  if (c !== null && c.state === "suspended") void c.resume()
}

/** A gentle ascending 3-note chime. Safe to call repeatedly. */
export function playSuccessChime(): void {
  const c = getCtx()
  if (c === null) return
  if (c.state === "suspended") void c.resume()
  const now = c.currentTime
  const notes = [523.25, 659.25, 783.99] // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    const start = now + i * 0.12
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.2, start + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(start)
    osc.stop(start + 0.55)
  })
}
