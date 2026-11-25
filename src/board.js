/**
 * The work board, through its command line (`kith board` or anything that answers the same
 * JSON): this plugin keeps no copy of it. Reads are cached until the board folder changes (a stat
 * of its files, cheap) or, without a folder to watch, for a few seconds. Commands run with
 * execFile and an argument list, never a shell, so text from the page is only ever data.
 */
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const TTL_MS = 5000
const TIMEOUT_MS = 30000
const MAX_OUTPUT = 32 * 1024 * 1024

/** Run a command; resolves with stdout, rejects with an error that carries stderr's last line. */
export function runCommand(argv, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(argv[0], argv.slice(1), { cwd: cwd || undefined, env, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const said = String(stderr || error.message).trim().split('\n').filter(Boolean).pop() ?? 'failed'
        reject(Object.assign(new Error(said), { code: error.code }))
      } else {
        resolve(stdout)
      }
    })
  })
}

/** The error the page shows when the board command can't be run or answers something that isn't JSON. */
export function unreadable(command, error) {
  const name = command[0]
  const why = error.code === 'ENOENT' ? `"${name}" was not found. Set \`command\` on the work row to your board command.`
    : error instanceof SyntaxError ? `"${name}" printed something that is not JSON.`
    : `"${name}" failed: ${error.message}`
  return Object.assign(new Error(`The board command ${why}`), { status: 502 })
}

/** A cheap fingerprint of a folder's files: names, sizes and times, closed/ included. */
export async function folderSignature(dir) {
  const parts = []
  for (const sub of ['', 'closed']) {
    let names
    try {
      names = await readdir(join(dir, sub))
    } catch {
      continue
    }
    for (const name of names.sort()) {
      if (!name.endsWith('.md') && !name.endsWith('.json')) continue
      try {
        const info = await stat(join(dir, sub, name))
        parts.push(`${sub}/${name}:${info.size}:${info.mtimeMs}`)
      } catch {
        // Gone between the listing and the stat: the next look sees it.
      }
    }
  }
  return parts.join('|')
}

/**
 * @param {object} options
 * @param {string[]} options.command - the board command as an argument list, e.g. ['kith', 'board']
 * @param {string} [options.cwd] - where to run it (a home it finds from there)
 * @param {string} [options.dir] - the board folder, to notice changes; empty: re-read every few seconds
 * @param {Record<string, string>} [options.env]
 * @param {typeof runCommand} [options.run]
 */
export function createBoard({ command, cwd, dir = '', env, run = runCommand }) {
  let cache = null          // { key, at, value: Promise }
  let writing = Promise.resolve()

  const call = async args => {
    const out = await run([...command, ...args], { cwd, env })
    return out
  }
  const json = async args => JSON.parse(await call([...args, '--json']))

  async function signature() {
    return dir ? folderSignature(dir) : ''
  }

  /** Everything the page shows: open issues, topics, closed ones and the sessions the board knows. */
  async function snapshot() {
    const key = await signature()
    if (cache !== null && (dir ? cache.key === key : Date.now() - cache.at < TTL_MS)) return cache.value
    const value = Promise.all([
      json(['list']),
      json(['list', '--topics']),
      json(['list', '--closed']),
      json(['agents']).catch(() => []),
    ]).catch(error => { throw unreadable(command, error) }).then(([open, topics, closed, agents]) => ({
      today: open.today ?? null,
      open: open.entries ?? [],
      topics: topics.entries ?? [],
      closed: closed.entries ?? [],
      agents: Array.isArray(agents) ? agents : [],
    }))
    cache = { key, at: Date.now(), value }
    value.catch(() => { if (cache?.value === value) cache = null })
    return value
  }

  /** Writes go one at a time, and the next read sees them. */
  function write(args) {
    const done = writing.then(() => call(args))
    writing = done.catch(() => {})
    return done.finally(() => { cache = null })
  }

  return {
    snapshot,
    signature,
    /** Append a comment as `by`, delivered to its mentions and to `to` (session ids or names). */
    // Options first and `--` before the text, so a message that starts with "-" stays a message.
    comment: (ref, text, by, to = []) => write(['comment', '--by', by, ...to.flatMap(target => ['--to', target]), '--', ref, text]),
    /** A new topic (the standing chat), returns the board's answer. */
    topic: (title, by) => write(['topic', '--by', by, '--', title]),
    forget: () => { cache = null },
  }
}
