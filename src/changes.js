/**
 * Change notices for open pages. While anyone listens, the board's fingerprint and each
 * listener's read marks are looked at every `intervalMs`; a listener hears 'board' or 'marks'
 * when one changed. A stat per file is cheap and behaves the same on every file system;
 * nothing runs while nobody listens.
 */
import { stat } from 'node:fs/promises'

/**
 * @param {object} o
 * @param {() => Promise<string>} o.boardSignature
 * @param {(person: string) => string} o.marksPath
 * @param {number} [o.intervalMs]
 */
export function createChanges({ boardSignature, marksPath, intervalMs = 2000 }) {
  const listeners = new Set()
  let board
  let timer
  let running = false

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

  function stop() {
    listeners.clear()
    clearTimeout(timer)
    running = false
  }

  return { listen, stop, tick }
}
