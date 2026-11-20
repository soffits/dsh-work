import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { apply } from '../index.js'

// Cordis 4 has no 'dispose' event: a listener on it never runs. Only effects are torn down.
function fakeContext() {
  const disposers = []
  const handlers = new Map()
  const routes = []
  const logger = { info() {}, warn() {}, error() {} }
  const identity = { current: () => ({ provider: 'oidc', issuer: 'https://id.example', id: 'owner' }) }
  return {
    ctx: {
      logger: () => logger,
      get: name => (name === 'requestIdentity' ? identity : undefined),
      connection: { fetch: { register: route => routes.push(route) } },
      on(name, handler) { handlers.set(name, handler); return () => true },
      effect(execute) { disposers.push(execute()) },
    },
    routes,
    emit: name => handlers.get(name)?.(),
    unload: () => { for (const dispose of disposers.reverse()) dispose() },
  }
}

const nextChunk = async (reader, ms) => Promise.race([reader.read().then(({ value }) => new TextDecoder().decode(value)), sleep(ms).then(() => null)])

test('an open events stream ends once the plugin unloads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'work-life-'))
  const { ctx, routes, emit, unload } = fakeContext()
  const controller = new AbortController()
  try {
    apply(ctx, { command: ['true'], dataDir: dir })
    const events = routes.find(route => route.path.endsWith('/events'))
    const response = await events.fetch(new Request('http://work.test/api/work/events', { signal: controller.signal }))
    const reader = response.body.getReader()
    assert.match(await nextChunk(reader, 1000), /: open/)
    emit('agent/created')
    assert.match(await nextChunk(reader, 1000), /"what":"live"/)
    unload()
    emit('agent/created')
    const next = await Promise.race([reader.read(), sleep(1000).then(() => 'still open')])
    assert.equal(next.done, true, 'the page reconnects to the next instance instead of hanging on this one')
  } finally {
    controller.abort()
    await rm(dir, { recursive: true, force: true })
  }
})
