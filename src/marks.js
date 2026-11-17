/**
 * Read marks, one small file per person: `<dataDir>/<person>/read.json`,
 * `{ "since": "<ISO>", "rooms": { "<room id>": <comments seen> } }`. Comments are append-only, so a
 * count is an exact cursor. On a person's first visit every room counts as read up to where it
 * stands, so it isn't a wall of old threads; a room whose first comment came after that starts
 * unread, so nothing new slips by.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const PERSON_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export function createMarks(dataDir) {
  const path = person => join(dataDir, person, 'read.json')

  async function load(person) {
    try {
      const value = JSON.parse(await readFile(path(person), 'utf8'))
      return { rooms: typeof value?.rooms === 'object' && value.rooms !== null ? value.rooms : {}, since: typeof value?.since === 'string' ? value.since : '' }
    } catch {
      return { rooms: {}, since: '' }
    }
  }

  async function save(person, marks) {
    await mkdir(join(dataDir, person), { recursive: true })
    const tmp = `${path(person)}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify({ since: marks.since, rooms: marks.rooms }), { mode: 0o600 })
    await rename(tmp, path(person))
  }

  /**
   * This person's counts for these rooms. `current` maps a room id to `{ count, first }`: its
   * comments now and the time of its first one (ISO, or null).
   */
  async function counts(person, current, now = new Date()) {
    if (!PERSON_PATTERN.test(person ?? '')) return Object.fromEntries(Object.entries(current).map(([id, room]) => [id, room.count]))
    const marks = await load(person)
    const fresh = marks.since === ''
    if (fresh) marks.since = now.toISOString()
    let changed = fresh
    const out = {}
    for (const [id, room] of Object.entries(current)) {
      if (Number.isInteger(marks.rooms[id])) {
        out[id] = Math.min(marks.rooms[id], room.count)
        continue
      }
      const newer = !fresh && room.first !== null && Date.parse(room.first) > Date.parse(marks.since)
      out[id] = newer ? 0 : room.count
      if (!newer) {
        marks.rooms[id] = room.count
        changed = true
      }
    }
    if (changed) await save(person, marks)
    return out
  }

  /** Mark a room read up to `count` comments (never backwards unless `force`). */
  async function mark(person, id, count, force = false) {
    if (!PERSON_PATTERN.test(person ?? '')) return
    const marks = await load(person)
    const before = Number.isInteger(marks.rooms[id]) ? marks.rooms[id] : 0
    marks.rooms[id] = force ? count : Math.max(before, count)
    if (marks.since === '') marks.since = new Date().toISOString()
    await save(person, marks)
  }

  return { counts, mark, path }
}
