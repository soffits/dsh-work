/**
 * What DSH itself says about the sessions working on an issue: title, whether it runs now, when it
 * started, and for one that finished, the time and first line of its last answer. Read from DSH's
 * own services at request time (`sessionQuery`, `agents`), so the page never keeps a registry of
 * its own and nothing breaks when a service is missing: the session then shows by its board name.
 */

const LINE_MAX = 280

/** The first meaningful line of an assistant message's text parts. */
export function firstLine(message) {
  const parts = Array.isArray(message?.content) ? message.content : []
  const text = parts.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n')
  const line = text.split('\n').map(row => row.replace(/^[#>*\-\s]+/, '').trim()).find(row => row !== '') ?? ''
  return line.length > LINE_MAX ? `${line.slice(0, LINE_MAX - 1)}…` : line
}

/** The session's current title: the text of its latest title event. */
export function titleOf(events) {
  const title = events?.findLast?.(event => event?.type === 'session/title')?.data?.title
  return typeof title === 'string' ? title : (title?.title ?? title?.text ?? null)
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
  // Nothing is cached: titles and last answers are read from DSH each time, so the page never shows an old one.
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

  /**
   * One observation of a session: DSH hands over the session's own header and events without
   * copying or replaying them (`readSession` copies and replays the whole log, `readTitleSnapshot`
   * lists every stored session), and reuses a stored session's read until its log changes.
   */
  async function observe(id, use) {
    let observation
    try {
      observation = await services().sessionQuery?.observeSession?.(id, { projectionMode: 'none' })
      return observation === undefined ? null : use(observation)
    } catch {
      // Unknown to DSH (another harness wrote it, or it was removed): the board name stays.
      return null
    } finally {
      observation?.[Symbol.dispose]?.()
    }
  }

  const readOf = (observation, now, withFinal) => {
    const head = observation.header
    return {
      title: titleOf(observation.events),
      createdAt: Number.isFinite(head?.createdAt) ? new Date(head.createdAt).toISOString() : null,
      parent: head?.parentSession ?? null,
      final: withFinal && now !== 'running' ? finalOf(observation.events) : null,
    }
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
      const read = (await observe(id, observation => readOf(observation, now, withFinal))) ?? { title: null, createdAt: null, parent: null, final: null }
      return { ref: String(ref), id, ...read, state: now }
    }))
  }

  /** Whether DSH has this session loaded right now (running or idle in memory). */
  const live = (ref, known = []) => state(resolve(ref, known) ?? String(ref)) !== 'stored'

  /** The ids of the sessions with a turn running right now, children included. */
  const running = () => (services().agents?.list?.() ?? []).filter(agent => agent.status === 'running').map(agent => agent.id)

  return { describe, live, resolve, running }
}
