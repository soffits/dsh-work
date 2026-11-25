import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBoard } from '../src/board.js'

const list = JSON.stringify({ entries: [{ number: 1, title: 'One', status: 'doing' }] })
const answers = { list: list, 'list --topics': '{"entries":[]}', 'list --closed': '{"entries":[]}' }

test('a command that answers the reads gives a snapshot', async () => {
  const board = createBoard({ command: ['board'], run: async argv => answers[argv.slice(1, -1).join(' ')] ?? '[]' })
  const snap = await board.snapshot()
  assert.equal(snap.open.length, 1)
})

test('a missing command is a 502 that names it', async () => {
  const board = createBoard({ command: ['no-such-board'], run: async () => { throw Object.assign(new Error('spawn no-such-board ENOENT'), { code: 'ENOENT' }) } })
  await assert.rejects(board.snapshot(), error => error.status === 502 && /"no-such-board" was not found/.test(error.message))
})

test('a command that prints no JSON is a 502', async () => {
  const board = createBoard({ command: ['board'], run: async () => 'hello' })
  await assert.rejects(board.snapshot(), error => error.status === 502 && /not JSON/.test(error.message))
})

test('a failing command passes on its last stderr line', async () => {
  const board = createBoard({ command: ['board'], run: async () => { throw new Error('the store is locked') } })
  await assert.rejects(board.snapshot(), error => error.status === 502 && /failed: the store is locked/.test(error.message))
})
