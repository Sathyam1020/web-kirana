// Web Audio alert with a mobile-safe unlock. An AudioContext only makes sound
// if it was created/resumed inside a user gesture, so we prime a shared context
// on the owner's first interaction (see RealtimeBridge) and play through it when
// a new order arrives over the socket.

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

/** Call inside a user-gesture handler to unlock audio. */
export function primeAudio(): void {
  const c = getCtx()
  if (c !== null && c.state === "suspended") void c.resume()
}

/** An attention-grabbing two-tone "ding-dong", repeated once — for new orders. */
export function playNewOrderAlert(): void {
  const c = getCtx()
  if (c === null) return
  if (c.state === "suspended") void c.resume()
  const now = c.currentTime
  // Two "ding-dong" phrases (high → low), the second slightly after the first.
  const tones = [
    { freq: 987.77, at: 0 }, // B5
    { freq: 783.99, at: 0.18 }, // G5
    { freq: 987.77, at: 0.5 },
    { freq: 783.99, at: 0.68 },
  ]
  for (const { freq, at } of tones) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = "triangle"
    osc.frequency.value = freq
    const start = now + at
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(start)
    osc.stop(start + 0.35)
  }
}
