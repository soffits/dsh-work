/**
 * Change notices for open pages. While anyone listens, the board's fingerprint and each
 * listener's read marks are looked at every `intervalMs`; a listener hears 'board' or 'marks'
 * when one changed. A stat per file is cheap and behaves the same on every file system;
 * nothing runs while nobody listens. Who is running is not looked at: DSH says when a session
 * starts, stops or ends a turn, and `announce('live')` passes that on at once (bursts merge).
 */
import { stat } from 'node:fs/promises'

/**
 * @param {object} o
 * @param {() => Promise<string>} o.boardSignature
 * @param {(person: string) => string} o.marksPath
 * @param {number} [o.intervalMs]
 */
export function createChanges({ boardSignature, marksPath, intervalMs = 2000, mergeMs = 150 }) {
  const listeners = new Set()
  let board
  let timer
  let running = false
  const announced = new Set()
  let announcing

  const marksSignature = person => stat(marksPath(person)).then(info => `${info.ino}:${info.size}:${info.mtimeMs}`, () => '-')

  async function tick() {
    try {
      const now = await boardSignature().catch(() => board)
      const boardChanged = board !== undefined && now !== board
      board = now
      for (const listener of listeners) {
        const marks = listener.person ? await marksSignature(listener.person) : ''
        const marksChanged = listener.marks !== undefined && marks !== listener.marks
        listener.marks = marks
        if (boardChanged) listener.send('board')
        else if (marksChanged) listener.send('marks')
      }
    } finally {
      if (listeners.size > 0) {
        timer = setTimeout(tick, intervalMs)
      } else {
        running = false
        board = undefined
      }
    }
  }

  /** Hear about changes to the board and to this person's marks. Returns a stop function. */
  function listen(person, send) {
    const listener = { person, send, marks: undefined }
    listeners.add(listener)
    if (!running) {
      running = true
      timer = setTimeout(tick, 0)
    }
    return () => listeners.delete(listener)
  }

  /** Tell every listener something happened that no file shows (`what`); notices that follow within `mergeMs` are one. */
  function announce(what) {
    if (listeners.size === 0) return
    announced.add(what)
    announcing ??= setTimeout(() => {
      announcing = undefined
      const batch = [...announced]
      announced.clear()
      for (const listener of listeners) for (const item of batch) listener.send(item)
    }, mergeMs)
  }

  function stop() {
    listeners.clear()
    clearTimeout(timer)
    clearTimeout(announcing)
    announcing = undefined
    announced.clear()
    running = false
  }

  return { listen, stop, tick, announce }
}
