import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRoutes, PREFIX } from '../src/routes.js'
import { readLocales, tables } from '../src/locales.js'

test('the strings route serves the words on disk now, uncached', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'work-strings-'))
  try {
    await writeFile(join(dir, 'en.json'), JSON.stringify({ ui: { 'live.title': 'Working now' } }))
    const routes = createRoutes({
      board: {}, sessions: {}, marks: {}, people: {}, changes: {}, identity: () => null,
      settings: { access: {}, owner: 'owner', names: {}, assistant: {}, general: 'general', doneDays: 7 },
      strings: () => readLocales(dir).then(tables),
    })
    const route = routes.find(r => r.path === `${PREFIX}/strings`)
    const ask = async () => {
      const response = await route.fetch(new Request('http://host/api/work/strings'))
      return { cache: response.headers.get('cache-control'), body: await response.json() }
    }
    const first = await ask()
    assert.equal(first.body.tables.en['live.title'], 'Working now')
    assert.match(first.cache, /no-cache/)

    await writeFile(join(dir, 'en.json'), JSON.stringify({ ui: { 'live.title': 'Working now', 'live.noIssue': 'no issue' } }))
    const second = await ask()
    assert.equal(second.body.tables.en['live.noIssue'], 'no issue')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
