import { test } from 'node:test'
import assert from 'node:assert/strict'
import { members, mentionsIn, recipients, roomOf, unreadOf, visible } from '../src/rooms.js'
import { createSessions, finalOf, firstLine } from '../src/sessions.js'

const A = 'session-9a11fc8c-1111-2222-3333-444455556666'
const B = 'bfa822d2-0000-1111-2222-333344445555'
const ASSISTANT = 'session-7e57a55e-0000-4000-8000-000000000001'
const people = new Set(['ana', 'ben'])
const issue = {
  number: '12', kind: 'issue', title: 'Player stuck', status: 'paused', assignee: '9a11fc8c', next: '2026-11-18', labels: ['media'],
  created: '2026-11-17', updated: '2026-11-17 11:50 by x',
  comments: [
    { time: '2026-11-17T15:00:00-05:00', author: A, text: 'Reproduced.' },
    { time: '2026-11-17T15:05:00-05:00', author: 'ana', text: '好的，周二之前能发吗？' },
    { time: '2026-11-17T15:10:00-05:00', author: B, text: '@ana 问一下@ben, see `@x` and @scope/pkg' },
  ],
}

test('a room: column from status, latest activity, last comment', () => {
  const room = roomOf(issue)
  assert.equal(room.id, '12')
  assert.equal(room.column, 'waiting')
  assert.equal(room.count, 3)
  assert.equal(room.latest, new Date('2026-11-17T15:10:00-05:00').toISOString())
  assert.equal(roomOf({ ...issue, closed: '2026-11-16' }, { closed: true }).column, 'done')
  assert.equal(roomOf({ id: 'general', kind: 'topic', number: '3', title: 'general', comments: [] }).id, 'general')
})

test('mentions follow the board rule', () => {
  assert.deepEqual(mentionsIn(issue.comments[2].text), ['ana', 'ben'])
})

test('members are the assignee and the sessions that commented, never people, each once', () => {
  assert.deepEqual(members(issue, people), ['9a11fc8c', B])
})

test('unread counts skip the reader\'s own comments and count mentions of them', () => {
  assert.deepEqual(unreadOf(issue, 0, 'ana'), { unread: 2, mentioned: 1 })
  assert.deepEqual(unreadOf(issue, 2, 'ana'), { unread: 1, mentioned: 1 })
  assert.deepEqual(unreadOf(issue, 3, 'ana'), { unread: 0, mentioned: 0 })
})

test('who a message reaches: workers and the assistant, @name, @all', () => {
  const live = ref => ref === B
  assert.deepEqual(recipients({ text: 'ship it', entry: issue, people, live, assistant: ASSISTANT }).reach, ['9a11fc8c', B, ASSISTANT])
  assert.deepEqual(recipients({ text: 'ship it', entry: issue, people, live: () => false, assistant: ASSISTANT }).extra, ['9a11fc8c', ASSISTANT])
  const named = recipients({ text: '@bfa822d2 and @ben', entry: issue, people, live, assistant: ASSISTANT })
  assert.deepEqual([named.reach, named.extra, named.people], [['bfa822d2', ASSISTANT], [ASSISTANT], ['ben']])
  assert.deepEqual(recipients({ text: '@all done?', entry: issue, people, live, assistant: ASSISTANT }).extra, [ASSISTANT])
})

test('a person at level mentioned sees only rooms that mention them', () => {
  assert.equal(visible(issue, { level: 'all', person: 'ben' }), true)
  assert.equal(visible(issue, { level: 'mentioned', person: 'ben' }), true)
  assert.equal(visible(issue, { level: 'mentioned', person: 'cy' }), false)
  assert.equal(visible(issue, { level: null, person: 'ana' }), false)
})

test('a finished session\'s last answer and when its turn ended', () => {
  const events = [
    { type: 'assistant/message', time: 1000, data: { message: { role: 'assistant', content: [{ type: 'text', text: 'working' }] } } },
    { type: 'assistant/message', time: 2000, data: { message: { role: 'assistant', content: [{ type: 'text', text: '\n## Done: 0.5.1 is out\nmore' }] } } },
    { type: 'assistant/message', time: 2100, data: { message: { role: 'assistant', content: [{ type: 'tool_use' }] } } },
    { type: 'turn/end', time: 2200, data: {} },
  ]
  assert.deepEqual(finalOf(events), { time: new Date(2200).toISOString(), text: 'Done: 0.5.1 is out' })
  assert.equal(finalOf([]), null)
  assert.equal(firstLine({ content: [] }), '')
})

test('a session is read through one observation, released after, without a full read', async () => {
  const events = [
    { type: 'session/title', seq: 0, time: 0, data: { title: 'Old' } },
    { type: 'assistant/message', time: 1, data: { message: { content: [{ type: 'text', text: 'Done.' }] } } },
    { type: 'turn/end', time: 2 },
    { type: 'session/title', seq: 3, time: 3, data: { title: 'Player fix' } },
  ]
  let released = 0
  let options = null
  const sessionQuery = {
    readSession: () => { throw new Error('reads the whole log') },
    readTitleSnapshot: () => { throw new Error('lists every stored session') },
    observeSession: async (id, given) => { options = given; return { header: { createdAt: 5, parentSession: 'p' }, events, [Symbol.dispose]: () => { released += 1 } } },
  }
  const sessions = createSessions(() => ({ sessionQuery, agents: new Map() }))
  const [row] = await sessions.describe(['abc'], [], { finals: true })
  assert.equal(row.title, 'Player fix')
  assert.equal(row.createdAt, new Date(5).toISOString())
  assert.equal(row.parent, 'p')
  assert.equal(row.final.text, 'Done.')
  assert.equal(row.final.time, new Date(2).toISOString())
  assert.deepEqual(options, { projectionMode: 'none' })
  assert.equal(released, 1)
  const [plain] = await sessions.describe(['abc'])
  assert.equal(plain.final, null)
  const broken = createSessions(() => ({ sessionQuery: { observeSession: async () => { throw new Error('unknown') } }, agents: new Map() }))
  assert.equal((await broken.describe(['x'], [], { finals: true }))[0].title, null)
})
