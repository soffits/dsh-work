/**
 * The page's words: one `locale/<tag>.json` per language, `{ meta, ui }`.
 * Which languages exist is whatever files are there; adding one needs no code.
 * Each table the page gets is complete: a key missing from `zh-CN` comes from
 * `zh`, then from `en`.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const BASE = 'en'
const TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

/** `{ tag: ui }` for every `<tag>.json` in the folder with a `ui` object. */
export async function readLocales(dir) {
  const out = {}
  for (const name of (await readdir(dir)).sort()) {
    const tag = name.replace(/\.json$/, '')
    if (tag === name || !TAG.test(tag)) continue
    const value = JSON.parse(await readFile(join(dir, name), 'utf8'))
    if (typeof value?.ui === 'object' && value.ui !== null) out[tag] = value.ui
  }
  return out
}

const primary = tag => tag.split('-')[0]

/**
 * Complete tables by tag: exact tag, then its primary subtag, then the base
 * language. A regional file without its primary one also answers for the
 * primary tag, so `zh-CN.json` alone serves a page set to `zh`.
 */
export function tables(locales) {
  const base = locales[BASE] ?? {}
  const out = {}
  for (const tag of Object.keys(locales)) {
    out[tag] = { ...base, ...(locales[primary(tag)] ?? {}), ...locales[tag] }
    if (out[primary(tag)] === undefined && locales[primary(tag)] === undefined) out[primary(tag)] = out[tag]
  }
  return out
}
