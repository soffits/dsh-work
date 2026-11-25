/**
 * Change notices for open pages. While anyone listens, the board's fingerprint and each listening
 * person's read marks are looked at every `intervalMs`; a page hears 'board' or 'marks' when one
 * changed. A stat per file is cheap and behaves the same on every file system; nothing runs while
 * nobody listens. Who is running is not looked at: DSH says when a session starts, stops or ends a
 * turn, and `announce('live')` passes that on at once. Notices within `mergeMs` are one.
 */
import { stat } from 'node:fs/promises'
import { createNotices } from '@soffits/dsh-plugin-sdk/host'

/**
 * @param {object} o
 * @param {() => Promise<string>} o.boardSignature
 * @param {(person: string) => string} o.marksPath
 * @param {number} [o.intervalMs]
 * @param {number} [o.mergeMs]
 */
export function createChanges({ boardSignature, marksPath, intervalMs = 2000, mergeMs = 150 }) {
  const notices = createNotices({ settleMs: mergeMs })
  const watched = new Map()       // person -> { count, marks }
  let board
  let timer
  let running = false
  let stopped = false

  const marksSignature = person => stat(marksPath(person)).then(info => `${info.ino}:${info.size}:${info.mtimeMs}`, () => '-')

  async function tick() {
    try {
      const now = await boardSignature().catch(() => board)
      if (board !== undefined && now !== board) notices.notify('board')
      board = now
      for (const [person, entry] of watched) {
        const marks = await marksSignature(person)
        if (entry.marks !== undefined && marks !== entry.marks) notices.notify('marks', person)
        entry.marks = marks
      }
    } finally {
      if (!stopped && watched.size > 0) {
        timer = setTimeout(tick, intervalMs)
      } else {
        running = false
        board = undefined
      }
    }
  }

  /** Hear about changes to the board and to this person's marks, one kind per call. Returns a stop function. */
  function listen(person, send) {
    const entry = watched.get(person) ?? { count: 0, marks: undefined }
    entry.count += 1
    watched.set(person, entry)
    const unlisten = notices.listen(batch => { for (const what of batch) send(what) }, scope => scope === person)
    if (!running && !stopped) {
      running = true
      timer = setTimeout(tick, 0)
    }
    return () => {
      unlisten()
      entry.count -= 1
      if (entry.count === 0 && watched.get(person) === entry) watched.delete(person)
    }
  }

  /** Tell every listener something happened that no file shows (`what`). */
  function announce(what) {
    if (watched.size > 0) notices.notify(what)
  }

  function stop() {
    stopped = true
    clearTimeout(timer)
    watched.clear()
    notices.close()
  }

  return { listen, stop, announce }
}
