/**
 * What DSH itself says about the sessions working on an issue: title, whether it runs now, when it
 * started, and for one that finished, the time and first line of its last answer. Read from DSH's
 * own services at request time (`sessionQuery`, `agents`), so the page never keeps a registry of
 * its own and nothing breaks when a service is missing: the session then shows by its board name.
 */

const LINE_MAX = 280
const FINAL_TTL_MS = 10 * 60 * 1000
const TITLE_TTL_MS = 60 * 1000

/** The first meaningful line of an assistant message's text parts. */
export function firstLine(message) {
  const parts = Array.isArray(message?.content) ? message.content : []
  const text = parts.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n')
  const line = text.split('\n').map(row => row.replace(/^[#>*\-\s]+/, '').trim()).find(row => row !== '') ?? ''
  return line.length > LINE_MAX ? `${line.slice(0, LINE_MAX - 1)}…` : line
}

/** From a session's raw events: when its last turn ended and the first line of its last answer. */
export function finalOf(events) {
  let answer = null
  let ended = null
  for (let i = (events?.length ?? 0) - 1; i >= 0 && (answer === null || ended === null); i -= 1) {
    const event = events[i]
    if (ended === null && event?.type === 'turn/end') ended = event.time
    if (answer === null && event?.type === 'assistant/message') {
      const line = firstLine(event.data?.message)
      if (line !== '') answer = { time: event.time, text: line }
    }
  }
  if (answer === null) return null
  return { time: new Date(ended ?? answer.time).toISOString(), text: answer.text }
}

/**
 * @param {() => any} services - `{ sessionQuery, agents }` as DSH has them right now (either may be undefined)
 */
export function createSessions(services) {
  const titles = new Map()   // id -> { at, title, header }
  const finals = new Map()   // id -> { at, value }

  /** The full DSH id for a board reference (full id, or its short form), among ids DSH knows. */
  function resolve(ref, known) {
    const short = String(ref).replace(/^session-/, '').toLowerCase()
    return known.find(id => id === ref) ?? known.find(id => id.replace(/^session-/, '').toLowerCase().startsWith(short)) ?? null
  }

  function state(id) {
    const agent = services().agents?.get?.(id)
    if (agent === undefined) return 'stored'
    return agent.status === 'running' ? 'running' : 'idle'
  }

  async function header(id) {
    const cached = titles.get(id)
    if (cached && Date.now() - cached.at < TITLE_TTL_MS) return cached
    const query = services().sessionQuery
    let value = { at: Date.now(), title: null, createdAt: null, parent: null }
    try {
      const snapshot = await query?.readTitleSnapshot?.(id)
      const head = snapshot?.session ?? snapshot?.header
      value = {
        at: Date.now(),
        title: snapshot?.title?.title ?? snapshot?.title?.text ?? (typeof snapshot?.title === 'string' ? snapshot.title : null),
        createdAt: Number.isFinite(head?.createdAt) ? new Date(head.createdAt).toISOString() : null,
        parent: head?.parentSession ?? null,
      }
    } catch {
      // Unknown to DSH (another harness wrote it, or it was removed): the board name stays.
    }
    titles.set(id, value)
    return value
  }

  async function final(id, now) {
    if (now === 'running') return null
    const cached = finals.get(id)
    if (cached && Date.now() - cached.at < FINAL_TTL_MS) return cached.value
    let value = null
    try {
      const log = await services().sessionQuery?.readSession?.(id)
      value = finalOf(log?.events)
    } catch {
      value = null
    }
    finals.set(id, { at: Date.now(), value })
    return value
  }

  /**
   * Describe the sessions behind these board references. `known` are full session ids the board
   * knows (from its agents list); a reference that matches none is looked up as given.
   * @returns {Promise<Array<{ ref, id, title, state, createdAt, parent, final }>>}
   */
  async function describe(refs, known = [], { finals: withFinal = false } = {}) {
    return Promise.all(refs.map(async ref => {
      const id = resolve(ref, known) ?? String(ref)
      const now = state(id)
      const head = await header(id)
      return { ref: String(ref), id, title: head.title, state: now, createdAt: head.createdAt, parent: head.parent, final: withFinal ? await final(id, now) : null }
    }))
  }

  /** Whether DSH has this session loaded right now (running or idle in memory). */
  const live = (ref, known = []) => state(resolve(ref, known) ?? String(ref)) !== 'stored'

  return { describe, live, resolve }
}
