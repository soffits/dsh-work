import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveRows } from '../src/live.js'
import { createChanges } from '../src/changes.js'
import { createSessions } from '../src/sessions.js'

const MAIN = 'session-aaaaaaaa-0000-4000-8000-000000000001'
const HELPER = 'session-bbbbbbbb-0000-4000-8000-000000000002'
const LOOSE = 'session-cccccccc-0000-4000-8000-000000000003'
const names = { [MAIN]: 'Kit', [HELPER]: 'helper', [LOOSE]: 'cccccccc' }
const who = ref => ({ label: names[ref] ?? ref })

test('live rows: a session holding issues shows them, a child holding none is flagged, a main session is not', () => {
  const rows = liveRows({
    sessions: [
      { id: LOOSE, title: 'Check the logs', parent: MAIN },
      { id: HELPER, title: 'Fix the player', parent: MAIN },
      { id: MAIN, title: null, parent: null },
    ],
    open: [
      { number: '14', title: 'Second', assignee: 'bbbbbbbb' },
      { number: '9', title: 'First', assignee: HELPER },
      { number: '3', title: 'Not held', assignee: null },
    ],
    who,
  })
  assert.deepEqual(rows.map(row => [row.id, row.title, row.orphan]), [
    [HELPER, 'Fix the player', false],
    [MAIN, 'Kit', false],
    [LOOSE, 'Check the logs', true],
  ])
  assert.deepEqual(rows[0].issues, [{ number: 9, title: 'First' }, { number: 14, title: 'Second' }])
  assert.equal(rows[1].child, false)
  assert.equal(rows[2].child, true)
})

test('running sessions are the live agents with a turn open, children included', () => {
  const agents = { list: () => [{ id: 'a', status: 'running' }, { id: 'b', status: 'idle' }, { id: 'c', status: 'running' }] }
  assert.deepEqual(createSessions(() => ({ agents })).running(), ['a', 'c'])
  assert.deepEqual(createSessions(() => ({})).running(), [])
})

test('an announced change reaches every listener once, bursts merged, and nothing runs without listeners', async () => {
  const changes = createChanges({ boardSignature: async () => 'same', marksPath: () => '/nonexistent', intervalMs: 3600000, mergeMs: 5 })
  changes.announce('live')
  await new Promise(resolve => setTimeout(resolve, 20))
  const heard = []
  const stopA = changes.listen('ana', what => heard.push(['a', what]))
  const stopB = changes.listen('ben', what => heard.push(['b', what]))
  await new Promise(resolve => setTimeout(resolve, 20))
  heard.length = 0
  changes.announce('live')
  changes.announce('live')
  changes.announce('live')
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.deepEqual(heard, [['a', 'live'], ['b', 'live']])
  stopA()
  stopB()
  changes.stop()
})
