/**
 * Board entries as rooms: pure functions, no I/O.
 *
 * An entry is what `kith board list --json` prints for an issue or topic: number, title,
 * status, assignee (a session or its short id), labels, next date, step and the append-only
 * comment thread. A room is that entry as the page shows it, in a board column and as a chat. A needs-owner
 * entry may carry `points`, what the owner earns by answering (the board sets it only for an owner who plays
 * a points game), which a viewer who reads every room is shown.
 */

/** Board columns, in order, and the statuses each takes. Closed entries go to `done` for a few days. */
export const COLUMNS = Object.freeze(['needs-owner', 'doing', 'waiting', 'done'])
const COLUMN_OF = { 'needs-owner': 'needs-owner', doing: 'doing', waiting: 'waiting', paused: 'waiting' }

/**
 * The board's own mention rule: may follow CJK text, isn't part of an address or a package scope
 * (`@scope/name`), and code in backticks and links name nobody.
 */
export const MENTION = /(?<![A-Za-z0-9_.@])@([\p{L}\p{N}](?:[\p{L}\p{N}._-]*[\p{L}\p{N}])?)(?![\p{L}\p{N}_/])/gu
const NOT_SPOKEN = /```[\s\S]*?```|`[^`\n]*`|\b[a-z][a-z0-9+.-]*:\/\/\S+/gi
export const mentionsIn = text => [...new Set([...String(text ?? '').replace(NOT_SPOKEN, ' ').matchAll(MENTION)].map(match => match[1].toLowerCase()))]

const KIND_PREFIX = /^session-/
/** The short form a session goes by on the board: its id without a kind prefix, first 8 characters. */
export const shortId = id => String(id ?? '').replace(KIND_PREFIX, '').slice(0, 8)

/** A board time ("2026-11-17T15:39:00-05:00", "2026-11-17 11:50 by x", "2026-11-17") as epoch ms, or NaN. */
export function boardTime(value) {
  const text = String(value ?? '').trim().split(' by ')[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Date.parse(`${text}T12:00:00`)
  return Date.parse(text.replace(' ', 'T'))
}

/** The id a room is addressed by: an issue's number, else the entry id (a topic). */
export const roomId = entry => (entry.number !== undefined && entry.number !== null && entry.number !== '' && entry.kind !== 'topic' ? String(entry.number) : String(entry.id))

/**
 * Who takes part in an entry: its assignee and every author of a comment, oldest first, without
 * people (authors with a profile write as themselves, they aren't sessions to steer).
 */
export function members(entry, people = new Set()) {
  const out = []
  for (const who of [entry.assignee, ...(entry.comments ?? []).map(c => c.author)]) {
    const value = String(who ?? '').trim()
    if (value === '' || people.has(value.toLowerCase()) || out.some(id => sameSession(id, value))) continue
    out.push(value)
  }
  return out
}

/** Whether two board references name the same session (a full id and its short form do). */
export function sameSession(a, b) {
  const x = shortId(a).toLowerCase()
  const y = shortId(b).toLowerCase()
  return x !== '' && x === y
}

/** One room as the list and the board show it. `closed` entries carry `closed` (a day) and an outcome. */
export function roomOf(entry, { closed = false, points = false } = {}) {
  const comments = entry.comments ?? []
  const last = comments[comments.length - 1]
  const times = [entry.created, entry.updated, last?.time, closed ? entry.closed : undefined].map(boardTime).filter(Number.isFinite)
  const latest = times.length > 0 ? Math.max(...times) : NaN
  return {
    id: roomId(entry),
    number: entry.kind === 'topic' ? null : Number(entry.number) || null,
    kind: entry.kind === 'topic' ? 'topic' : 'issue',
    title: String(entry.title ?? ''),
    status: closed ? 'closed' : String(entry.status ?? ''),
    column: closed ? 'done' : COLUMN_OF[entry.status] ?? 'waiting',
    labels: Array.isArray(entry.labels) ? entry.labels.map(String) : [],
    assignee: entry.assignee ? String(entry.assignee) : null,
    next: entry.next ? String(entry.next) : null,
    overdue: Number(entry.overdue_days) > 0,
    points: points && !closed && entry.status === 'needs-owner' && Number(entry.points) > 0 ? Number(entry.points) : null,
    closed: closed ? String(entry.closed ?? '') : null,
    outcome: closed ? String(entry.outcome ?? '') : null,
    count: comments.length,
    last: last ? { time: last.time, author: String(last.author ?? ''), text: String(last.text ?? '') } : null,
    latest: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
  }
}

/** Whether a comment mentions this person. */
export const mentions = (comment, person) => person !== undefined && person !== null && mentionsIn(comment.text).includes(String(person).toLowerCase())

/**
 * What a person hasn't read in a room: comments after `read` (a count of comments seen) not
 * written by them, and how many of those mention them.
 */
export function unreadOf(entry, read, person) {
  const comments = entry.comments ?? []
  let unread = 0
  let mentioned = 0
  for (const comment of comments.slice(Math.max(0, read))) {
    if (person && String(comment.author).toLowerCase() === person) continue
    unread += 1
    if (mentions(comment, person)) mentioned += 1
  }
  return { unread, mentioned }
}

/**
 * Who a message from a person goes to, by the rule the owner set:
 * - `@all`: every member of the room, and the assistant;
 * - any other mention: those named (people just see it), and the assistant;
 * - no mention: the room's working sessions (its assignee and members that are live now), and the assistant.
 * Returns the sessions to add with `--to` (mentions in the text are delivered by the board itself)
 * and every session it will reach, for the composer's "to" line.
 */
export function recipients({ text, entry, people = new Set(), live = () => false, assistant = '' }) {
  const named = mentionsIn(text)
  const all = members(entry, people)
  let reach
  let extra
  if (named.includes('all')) {
    reach = all
    extra = []
  } else if (named.length > 0) {
    reach = named.filter(name => !people.has(name))
    extra = []
  } else {
    reach = all.filter((id, i) => (entry.assignee && sameSession(id, entry.assignee)) || (i >= 0 && live(id)))
    extra = [...reach]
  }
  if (assistant && !reach.some(id => sameSession(id, assistant))) {
    reach = [...reach, assistant]
    extra = [...extra, assistant]
  }
  return { reach, extra, people: named.filter(name => people.has(name)) }
}

/** Rooms a viewer may see: everything at level `all`; at `mentioned`, only rooms that mention them. */
export function visible(entry, viewer) {
  if (viewer.level === 'all') return true
  if (viewer.level !== 'mentioned') return false
  return (entry.comments ?? []).some(comment => mentions(comment, viewer.person))
}
