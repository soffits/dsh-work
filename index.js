/**
 * DeepSeek Harness Host plugin: the work page.
 *
 * A thin page over a work board kept by a command line (`companion board` from the companion
 * practice, or anything that answers the same JSON): the issues as board columns, and each issue
 * as a group chat of its comments, with milestones of the DSH sessions working on it. A message
 * posted here is a board comment written as the signed-in person; the board delivers it into
 * the sessions it is for through DSH's own steering. The plugin keeps nothing but read marks.
 */
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { LEVELS, createPeople, expandHome, personKey } from './src/access.js'
import { createBoard } from './src/board.js'
import { createChanges } from './src/changes.js'
import { readLocales, tables } from './src/locales.js'
import { createMarks } from './src/marks.js'
import { createRoutes } from './src/routes.js'
import { createSessions } from './src/sessions.js'

export const name = 'dsh-work'
export const inject = ['connection']

export const Config = z.object({
  command: z.array(z.string()).default(['companion', 'board'])
    .description('The board command, as an argument list. It must answer list/agents with --json and take comment and topic (the companion practice\'s `companion board`). A leading ~/ means the home folder.'),
  cwd: z.string().default('')
    .description('Where the command runs, so it finds its home. Empty: DSH\'s working folder.'),
  boardDir: z.string().default('')
    .description('The board\'s folder, watched (a stat per file) so open pages update as soon as anything is written. Empty: pages refresh every few seconds instead.'),
  dataDir: z.string().default('~/.dsh/work')
    .description('Where read marks are kept: <dataDir>/<person>/read.json.'),
  people: z.dict(z.string()).default({})
    .description('Verified user id (from the sign-in plugin, such as an OIDC sub) → person id. With any mapping configured, each request is checked against access.'),
  peopleFile: z.string().default('')
    .description('A JSON file with more of the same mapping, re-read when it changes.'),
  peopleKey: z.string().default('')
    .description('The top-level key in peopleFile that holds the mapping.'),
  access: z.dict(z.union(LEVELS)).default({})
    .description('Person id → all (reads and writes every room) or mentioned (only rooms where someone mentioned them). A person not listed sees nothing.'),
  owner: z.string().default('owner')
    .description('The person id comments are written as when no mapping is configured (a DSH only its owner uses).'),
  names: z.dict(z.string()).default({})
    .description('Person id → the name shown for them. Also the people a message can mention.'),
  assistant: z.string().default('')
    .description('The assistant\'s main session, as the board name it claims (`companion board whoami --name <name>`) or a session id. It gets every message a person posts here; a later main session takes over by claiming the name.'),
  assistantName: z.string().default('')
    .description('The name the assistant shows as, in comments and the @ list.'),
  general: z.string().default('general')
    .description('The title of the board topic that is the standing chat (made by its first message).'),
  doneDays: z.natural().min(1).max(60).default(7)
    .description('How many days closed issues stay in the Done column.'),
})

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx, config) {
  const logger = ctx.logger('work')
  const home = homedir()
  const absolute = path => {
    const expanded = expandHome(path, home)
    return isAbsolute(expanded) ? expanded : resolve(expanded)
  }
  const warn = message => logger.warn(message)
  const command = (config.command?.length ? config.command : ['companion', 'board']).map((part, i) => (i === 0 && part.startsWith('~/') ? absolute(part) : part))
  // A command named without a path is looked up on PATH, with the home's own bin folder added.
  const env = { ...process.env, PATH: [process.env.PATH, join(home, '.local', 'bin')].filter(Boolean).join(delimiter) }
  const board = createBoard({ command, cwd: config.cwd ? absolute(config.cwd) : '', dir: config.boardDir ? absolute(config.boardDir) : '', env })
  const marks = createMarks(absolute(config.dataDir || '~/.dsh/work'))
  const sessions = createSessions(() => ({ sessionQuery: ctx.get('sessionQuery'), agents: ctx.get('agents') }))
  const people = createPeople({ people: config.people ?? {}, peopleFile: config.peopleFile ? absolute(config.peopleFile) : '', peopleKey: config.peopleKey ?? '' }, { warn })
  const changes = createChanges({ boardSignature: () => board.signature(), marksPath: marks.path })
  const localeDir = fileURLToPath(new URL('./locale/', import.meta.url))
  const lower = map => Object.fromEntries(Object.entries(map ?? {}).map(([key, value]) => [personKey(key), value]))
  const routes = createRoutes({
    board, sessions, marks, people, changes,
    identity: () => ctx.get('requestIdentity'),
    // Read on each request, so an update that changes only words shows without a restart.
    strings: () => readLocales(localeDir).then(tables),
    settings: {
      access: lower(config.access),
      owner: personKey(config.owner || 'owner'),
      names: lower(config.names),
      assistant: { ref: config.assistant ?? '', name: config.assistantName ?? '' },
      general: config.general || 'general',
      doneDays: config.doneDays ?? 7,
    },
  })
  for (const route of routes) ctx.connection.fetch.register(route)
  // A session starting, stopping or ending its turn changes who is working now.
  for (const event of ['agent/created', 'agent/status', 'agent/disposed']) ctx.on(event, () => changes.announce('live'))
  ctx.on('dispose', () => changes.stop())
  logger.info(`work board via ${command.join(' ')}${config.boardDir ? `, watching ${config.boardDir}` : ''} (${people.enabled ? 'per person' : 'single owner'})`)
}
