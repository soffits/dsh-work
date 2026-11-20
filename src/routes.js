/**
 * The page's API: exact Fetch routes under DSH's `/api`, so DSH admits the browser first and the
 * sign-in plugin's `requestIdentity` sees the request. Every answer is decided here, per request.
 *
 *   GET  /api/work/overview            rooms for the board and the chat list, counts, who is asking
 *   GET  /api/work/archived            closed issues (their chats stay readable)
 *   GET  /api/work/live                the sessions running now, each with its issues (or none)
 *   GET  /api/work/room?id=            one room: fields, comments with session milestones, the @ list
 *   POST /api/work/post                { id, text }: a comment as the signed-in person, delivered by the rule
 *   POST /api/work/read                { id, count }: read up to this many comments
 *   GET  /api/work/summary             unread mentions of the caller (the sidebar badge)
 *   GET  /api/work/events              text/event-stream: a notice whenever the board or the caller's marks change
 *   GET  /api/work/strings             the page's words by language tag
 */
import { viewerOf } from './access.js'
import { liveRows } from './live.js'
import { COLUMNS, boardTime, members, mentions, mentionsIn, recipients, roomOf, sameSession, shortId, unreadOf, visible } from './rooms.js'

export const PREFIX = '/api/work'
const MAX_BODY = 32 * 1024
const MAX_TEXT = 8000
const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/
const DAY_MS = 86400000
const RECENT_AGENT_DAYS = 3

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } })
const fail = (status, message) => Object.assign(new Error(message), { status })

async function body(request) {
  const text = await request.text()
  if (text.length > MAX_BODY) throw fail(413, 'Request too large.')
  try {
    const value = JSON.parse(text || '{}')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object')
    return value
  } catch {
    throw fail(400, 'Send a JSON object.')
  }
}

/**
 * @param {object} o
 * @param {ReturnType<import('./board.js').createBoard>} o.board
 * @param {ReturnType<import('./sessions.js').createSessions>} o.sessions
 * @param {ReturnType<import('./marks.js').createMarks>} o.marks
 * @param {ReturnType<import('@soffits/dsh-host-kit').createPeople>} o.people
 * @param {() => any} o.identity - the requestIdentity service now, if any
 * @param {object} o.settings - { access, owner, names, assistant: { ref, name }, general, doneDays }
 * @param {ReturnType<import('./changes.js').createChanges>} o.changes
 * @param {ReturnType<import('@soffits/dsh-host-kit').createEventStreams>} o.streams - the open event streams, ended when the plugin unloads
 * @param {() => Promise<object>} o.strings
 */
export function createRoutes({ board, sessions, marks, people, identity, settings, changes, streams, strings }) {
  const { access, owner, names, assistant, general, doneDays } = settings
  const everyone = new Set([owner, ...Object.keys(access), ...Object.keys(names)].filter(Boolean).map(id => id.toLowerCase()))
  /** The assistant's main session: whoever holds its board name now (or a session id), so a successor takes over by claiming the name. */
  const assistantIn = snap => {
    const ref = assistant.ref
    if (!ref) return { token: '', id: null }
    const holder = snap.agents.find(row => (row.names ?? []).some(name => name.toLowerCase() === ref.toLowerCase()))
    return { token: ref, id: holder?.session ?? (/^(session-)?[0-9a-f]{8}-/i.test(ref) ? ref : null) }
  }
  const isAssistant = (ref, snap) => {
    const a = assistantIn(snap)
    return a.token !== '' && (String(ref).toLowerCase() === a.token.toLowerCase() || (a.id !== null && sameSession(ref, a.id)))
  }

  const handle = fn => async request => {
    try {
      const viewer = await viewerOf(people, identity(), access, owner)
      if (viewer.unavailable) return json(503, { error: 'This page needs a sign-in plugin that provides requestIdentity, and none is running.' })
      if (viewer.level === null) return json(403, { error: 'You have no access to the work board here.' })
      return await fn(request, viewer)
    } catch (error) {
      return json(error.status ?? 500, { error: error.status ? error.message : 'Something went wrong.' })
    }
  }

  /** The board as this viewer may see it: open issues, the standing topic, closed ones. */
  async function seen(viewer) {
    const snap = await board.snapshot()
    const topic = snap.topics.find(entry => String(entry.title).trim().toLowerCase() === general.toLowerCase()) ?? null
    const show = entry => visible(entry, viewer)
    return { snap, open: snap.open.filter(show), topic: topic && show(topic) ? topic : null, closed: snap.closed.filter(show), generalVisible: viewer.level === 'all' || topic !== null && show(topic) }
  }

  /** How an author or member is shown: a person by name, the assistant by its name, a session by its board name. */
  function who(ref, snap) {
    const agents = snap.agents
    const value = String(ref ?? '')
    const lower = value.toLowerCase()
    if (everyone.has(lower)) return { ref: value, kind: 'person', label: names[lower] ?? value, token: lower }
    if (isAssistant(value, snap)) return { ref: value, kind: 'assistant', label: assistant.name || assistant.ref, token: assistant.ref, id: assistantIn(snap).id }
    const agent = agents.find(row => sameSession(row.session, value))
    return { ref: value, kind: 'session', label: agent?.names?.[0] ?? shortId(value), token: agent?.names?.[0] ?? shortId(value), id: agent?.session ?? null }
  }

  async function withCounts(viewer, entries) {
    const current = Object.fromEntries(entries.map(entry => {
      const room = roomOf(entry)
      return [room.id, { count: room.count, first: entry.comments?.[0]?.time ?? entry.created ?? null }]
    }))
    const read = await marks.counts(viewer.person, current)
    return entries.map(entry => {
      const room = roomOf(entry, { points: viewer.level === 'all' })
      return { entry, room, read: read[room.id] ?? 0, ...unreadOf(entry, read[room.id] ?? 0, viewer.person) }
    })
  }

  const overview = handle(async (_request, viewer) => {
    const { snap, open, topic, closed, generalVisible } = await seen(viewer)
    const since = Date.now() - doneDays * DAY_MS
    const done = closed.filter(entry => boardTime(entry.closed) >= since)
    const counted = await withCounts(viewer, [...open, ...(topic ? [topic] : [])])
    const known = snap.agents.map(row => row.session)
    const assignees = [...new Set(open.map(entry => entry.assignee).filter(Boolean))]
    const described = await sessions.describe(assignees, known)
    const workers = Object.fromEntries(described.map(row => [row.ref, { ...who(row.ref, snap), state: row.state, title: row.title, id: row.id }]))
    const card = ({ entry, room, unread, mentioned }) => ({
      ...room,
      unread,
      mentioned,
      last: room.last ? { ...room.last, who: who(room.last.author, snap) } : null,
    })
    const rooms = counted.filter(row => row.entry !== topic).map(card)
    const generalRoom = topic ? card(counted.find(row => row.entry === topic)) : generalVisible ? { id: 'general', kind: 'topic', title: general, count: 0, unread: 0, mentioned: 0, last: null, latest: null, pending: true } : null
    return json(200, {
      me: { person: viewer.person, name: viewer.name ?? names[viewer.person] ?? viewer.person, level: viewer.level },
      today: snap.today,
      columns: COLUMNS,
      rooms: rooms.sort((a, b) => String(b.latest ?? '').localeCompare(String(a.latest ?? ''))),
      done: done.map(entry => roomOf(entry, { closed: true })).sort((a, b) => String(b.closed).localeCompare(String(a.closed))),
      general: generalRoom,
      archived: closed.length,
      workers,
      mentions: [...rooms, ...(generalRoom ? [generalRoom] : [])].reduce((n, room) => n + room.mentioned, 0),
      assistant: assistant.name || null,
    })
  })

  /** Who is working now. Every session is named, so only a viewer who reads every room sees it. */
  const live = handle(async (_request, viewer) => {
    if (viewer.level !== 'all') return json(200, { sessions: [] })
    const { snap, open } = await seen(viewer)
    const described = await sessions.describe(sessions.running(), snap.agents.map(row => row.session))
    return json(200, { sessions: liveRows({ sessions: described, open, who: ref => who(ref, snap) }) })
  })

  const archived = handle(async (_request, viewer) => {
    const { closed } = await seen(viewer)
    return json(200, { rooms: closed.map(entry => roomOf(entry, { closed: true })).sort((a, b) => String(b.closed).localeCompare(String(a.closed))) })
  })

  /** The entry behind a room id the viewer may see, open or closed; `general` before its topic exists is null. */
  async function entryOf(viewer, id) {
    if (typeof id !== 'string' || !ROOM_ID.test(id)) throw fail(400, 'No such room.')
    const { snap, open, topic, closed, generalVisible } = await seen(viewer)
    const found = [...open, ...(topic ? [topic] : []), ...closed].find(entry => roomOf(entry).id === id)
    if (found !== undefined) return { snap, entry: found, closed: closed.includes(found), isGeneral: found === topic }
    if (id === 'general' && topic === null && generalVisible) return { snap, entry: null, closed: false, isGeneral: true }
    throw fail(404, 'No such room, or not one you can see.')
  }

  /** The @ list: the room's members first, then sessions the board saw lately, the assistant, people, and @all. */
  function candidates(entry, snap, viewer, described) {
    const out = []
    const add = row => { if (!out.some(c => c.token.toLowerCase() === row.token.toLowerCase())) out.push(row) }
    const state = ref => described.find(row => sameSession(row.ref, ref))?.state
    for (const ref of entry ? members(entry, everyone) : []) {
      const w = who(ref, snap)
      if (w.kind === 'session') add({ token: w.token, label: w.label, detail: described.find(row => sameSession(row.ref, ref))?.title ?? undefined, state: dot(state(ref)), kind: 'session' })
    }
    if (assistant.ref) add({ token: assistant.ref, label: assistant.name || assistant.ref, kind: 'assistant', aliases: [assistant.name].filter(Boolean) })
    const recent = Date.now() - RECENT_AGENT_DAYS * DAY_MS
    for (const row of snap.agents) {
      if (!(boardTime(row.updated) >= recent) || isAssistant(row.session, snap)) continue
      add({ token: row.names?.[0] ?? row.short ?? shortId(row.session), label: row.names?.[0] ?? row.short ?? shortId(row.session), detail: row.names?.[0] ? shortId(row.session) : undefined, kind: 'session', aliases: [shortId(row.session)] })
    }
    for (const person of everyone) if (person !== viewer.person) add({ token: person, label: names[person] ?? person, kind: 'person' })
    if (entry && members(entry, everyone).length > 1) add({ token: 'all', label: 'all', kind: 'all' })
    return out
  }
  const dot = state => (state === 'running' ? 'ongoing' : state === 'idle' ? 'done' : 'idle')

  const room = handle(async (request, viewer) => {
    const id = new URL(request.url).searchParams.get('id') ?? ''
    const { snap, entry, closed, isGeneral } = await entryOf(viewer, id)
    const known = snap.agents.map(row => row.session)
    const sessionRefs = entry ? members(entry, everyone) : []
    const described = await sessions.describe(sessionRefs, known, { finals: true })
    const comments = (entry?.comments ?? []).map((comment, i) => ({
      i,
      time: comment.time,
      text: String(comment.text ?? ''),
      who: who(comment.author, snap),
      mine: String(comment.author).toLowerCase() === viewer.person,
      me: mentions(comment, viewer.person),
    }))
    const milestones = described.flatMap(row => [
      row.createdAt && { kind: 'started', time: row.createdAt, session: row },
      row.final && { kind: 'finished', time: row.final.time, text: row.final.text, session: row },
    ].filter(Boolean)).map(m => ({ ...m, who: who(m.session.ref, snap) }))
    const counted = entry ? (await withCounts(viewer, [entry]))[0] : { read: 0 }
    const assigned = entry?.assignee ? described.find(row => sameSession(row.ref, entry.assignee)) ?? null : null
    const live = new Set(described.filter(row => row.state !== 'stored').map(row => row.ref))
    const defaults = entry ? recipients({ text: '', entry, people: everyone, live: ref => live.has(ref), assistant: assistantIn(snap).id ?? assistant.ref }) : { reach: assistant.ref ? [assistant.ref] : [] }
    const canPost = !closed && (viewer.level === 'all' || (entry !== null && visible(entry, viewer)))
    return json(200, {
      room: entry ? { ...roomOf(entry, { closed }), step: entry.step ?? null, for: entry.for ?? null, links: entry.links ?? [], general: isGeneral } : { id: 'general', kind: 'topic', title: general, general: true, count: 0 },
      assignee: assigned ? { ...who(assigned.ref, snap), ...assigned, dot: dot(assigned.state) } : null,
      sessions: described.map(row => ({ ...who(row.ref, snap), ...row, dot: dot(row.state) })),
      comments,
      milestones,
      read: counted.read,
      canPost,
      candidates: canPost ? candidates(entry, snap, viewer, described) : [],
      defaultTo: defaults.reach.map(ref => who(ref, snap)),
    })
  })

  const post = handle(async (request, viewer) => {
    const value = await body(request)
    const text = typeof value.text === 'string' ? value.text.trim() : ''
    if (text === '') return json(400, { error: 'An empty message says nothing.' })
    if (text.length > MAX_TEXT) return json(413, { error: `Keep it under ${MAX_TEXT} characters.` })
    let { snap, entry, closed } = await entryOf(viewer, value.id)
    if (closed) return json(409, { error: 'This issue is closed; its chat is read-only.' })
    if (viewer.level !== 'all' && !(entry !== null && visible(entry, viewer))) return json(403, { error: 'You can read this chat but not write in it.' })
    if (entry === null) {
      // The standing chat is a board topic, made by the first message sent to it.
      await board.topic(general, viewer.person)
      snap = await board.snapshot()
      entry = snap.topics.find(row => String(row.title).trim().toLowerCase() === general.toLowerCase())
      if (entry === undefined) return json(500, { error: 'The standing chat could not be made.' })
    }
    const known = snap.agents.map(row => row.session)
    const live = ref => sessions.live(ref, known)
    const plan = recipients({ text, entry, people: everyone, live, assistant: assistantIn(snap).id ?? assistant.ref })
    const ref = entry.kind === 'topic' ? String(entry.id) : `#${entry.number}`
    try {
      await board.comment(ref, text, viewer.person, plan.extra.map(target => (sessions.resolve(target, known) ?? target)))
    } catch (error) {
      return json(502, { error: `The board did not take it: ${error.message}` })
    }
    await marks.mark(viewer.person, roomOf(entry).id, (entry.comments?.length ?? 0) + 1)
    return json(200, { ok: true, to: plan.reach.map(target => who(target, snap)), people: plan.people, mentions: mentionsIn(text) })
  })

  const read = handle(async (request, viewer) => {
    const value = await body(request)
    if (!Number.isInteger(value.count) || value.count < 0) return json(400, { error: 'Send id and count.' })
    const { entry } = await entryOf(viewer, value.id)
    if (entry !== null) await marks.mark(viewer.person, roomOf(entry).id, Math.min(value.count, entry.comments?.length ?? 0), value.force === true)
    return json(200, { ok: true })
  })

  const summary = handle(async (_request, viewer) => {
    const { open, topic } = await seen(viewer)
    const counted = await withCounts(viewer, [...open, ...(topic ? [topic] : [])])
    return json(200, { mentions: counted.reduce((n, row) => n + row.mentioned, 0), unread: counted.reduce((n, row) => n + row.unread, 0) })
  })

  const events = handle(async (request, viewer) =>
    streams.respond(request, ({ send }) => changes.listen(viewer.person, what => send({ type: 'change', what, at: new Date().toISOString() }))))

  const words = async () => json(200, { tables: await strings() }, { 'cache-control': 'private, no-cache' })

  const get = (path, fetch) => ({ path: `${PREFIX}${path}`, methods: ['GET'], requestBody: 'buffered', fetch })
  const postRoute = (path, fetch) => ({ path: `${PREFIX}${path}`, methods: ['POST'], requestBody: 'buffered', fetch })
  return [
    get('/overview', overview),
    get('/live', live),
    get('/archived', archived),
    get('/room', room),
    postRoute('/post', post),
    postRoute('/read', read),
    get('/summary', summary),
    get('/events', events),
    get('/strings', words),
  ]
}
