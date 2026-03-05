/**
 * Audio feedback using Web Audio API — no files needed.
 * Success: iPhone-style tri-tone ping.
 * Error: loud harsh double-buzz.
 * Action: gentle two-note doorbell chime — "look at the screen".
 */

let audioCtx = null

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

/**
 * Success tone: iPhone SMS-style tri-tone ping
 * Three quick crystalline notes ascending — instantly recognizable
 */
export function playSuccess() {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    const notes = [1046.5, 1318.5, 1568] // C6, E6, G6 — major triad
    const noteLength = 0.08
    const gap = 0.06

    notes.forEach((freq, i) => {
      const startTime = now + i * (noteLength + gap)

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)

      // Quick attack, smooth decay — gives it that glassy ping feel
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.5, startTime + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + noteLength + 0.06)

      osc.connect(gain).connect(ctx.destination)
      osc.start(startTime)
      osc.stop(startTime + noteLength + 0.06)
    })
  } catch (e) {
    // Audio not available — silent fallback
  }
}

/**
 * Action needed: two-note doorbell chime — distinct from success/error
 * A gentle "ding-dong" that says "look at the screen"
 */
export function playAction() {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    // Ding (high)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(830, now) // Ab5
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(0.45, now + 0.005)
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
    osc1.connect(gain1).connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.3)

    // Dong (lower)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(622, now + 0.25) // Eb5
    gain2.gain.setValueAtTime(0, now + 0.25)
    gain2.gain.linearRampToValueAtTime(0.45, now + 0.255)
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6)
    osc2.connect(gain2).connect(ctx.destination)
    osc2.start(now + 0.25)
    osc2.stop(now + 0.6)
  } catch (e) {
    // Audio not available — silent fallback
  }
}

/**
 * Error tone: loud harsh descending double-buzz
 */
export function playError() {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    // First buzz
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(400, now)
    osc.frequency.linearRampToValueAtTime(200, now + 0.3)
    gain.gain.setValueAtTime(0.55, now)
    gain.gain.setValueAtTime(0.55, now + 0.2)
    gain.gain.linearRampToValueAtTime(0, now + 0.35)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.35)

    // Second buzz for urgency
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'square'
    osc2.frequency.setValueAtTime(350, now + 0.4)
    osc2.frequency.linearRampToValueAtTime(180, now + 0.7)
    gain2.gain.setValueAtTime(0.55, now + 0.4)
    gain2.gain.setValueAtTime(0.55, now + 0.6)
    gain2.gain.linearRampToValueAtTime(0, now + 0.75)
    osc2.connect(gain2).connect(ctx.destination)
    osc2.start(now + 0.4)
    osc2.stop(now + 0.75)
  } catch (e) {
    // Audio not available — silent fallback
  }
}
