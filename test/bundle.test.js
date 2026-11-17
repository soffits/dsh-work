import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

test('the bundle layer inserts the work row with config the schema takes', async () => {
  const require = createRequire(import.meta.url)
  const yaml = require('yaml')
  const layer = yaml.parse(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  const row = layer[0].insert[0]
  assert.equal(row.id, 'work')
  const { Config } = await import('../index.js')
  assert.deepEqual(Config(row.config).assistant, 'assistant')
})
