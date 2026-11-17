/**
 * Who is asking, and what they may do.
 *
 * The caller comes from a `requestIdentity` service (dsh-oidc provides one): `current()` returns
 * `{ id, name? }` for the verified person behind an `/api` request, or null. The verified id maps
 * to a person id through `people` (and `peopleFile`), the same mapping other plugins of this kind
 * use; `access` then gives each person a level:
 *
 *   all        reads every room and writes in every room
 *   mentioned  reads and writes only in rooms where someone mentioned them
 *
 * Without any mapping (a DSH only its owner signs in to) everyone DSH lets in is the owner, at
 * level `all`. A broken people file maps nobody, so it never widens access.
 */
import { readFile, stat } from 'node:fs/promises'

export const LEVELS = Object.freeze(['all', 'mentioned'])

export const personKey = value => (typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : '')
export const expandHome = (path, home) => (typeof path === 'string' && (path === '~' || path.startsWith('~/')) ? home + path.slice(1) : path)

/** The verified id → person id mapping, re-read when the file changes. */
export function createPeople({ people = {}, peopleFile = '', peopleKey = '' }, { warn = () => {} } = {}) {
  const inline = Object.entries(people)
  const enabled = inline.length > 0 || peopleFile !== ''
  let cached = { tag: undefined, entries: [] }

  async function fromFile() {
    if (peopleFile === '') return []
    let tag
    try {
      const info = await stat(peopleFile)
      tag = `${info.size}:${info.mtimeMs}`
    } catch (error) {
      tag = `error:${error.code}`
    }
    if (tag === cached.tag) return cached.entries
    let entries = []
    try {
      let value = JSON.parse(await readFile(peopleFile, 'utf8'))
      if (peopleKey !== '') value = value?.[peopleKey]
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(peopleKey ? `no object at key ${peopleKey}` : 'not a JSON object')
      entries = Object.entries(value).filter(([, person]) => typeof person === 'string')
    } catch (error) {
      warn(`people file ${peopleFile}: ${error.message}; nobody is mapped from it`)
    }
    cached = { tag, entries }
    return entries
  }

  return {
    enabled,
    async personFor(userId) {
      if (typeof userId !== 'string' || userId === '') return undefined
      const person = new Map([...(await fromFile()), ...inline]).get(userId)
      return person === undefined ? undefined : personKey(person)
    },
  }
}

/**
 * The viewer of this request: `{ person, name, level }` (level null: may see nothing), or
 * `{ unavailable: true }` when a mapping is configured but no identity provider runs.
 * @param {ReturnType<typeof createPeople>} people
 * @param {Record<string, string>} access - person id → level
 * @param {string} owner - the person an unmapped (single-owner) DSH acts as
 */
export async function viewerOf(people, identityService, access, owner) {
  if (!people.enabled) return { person: owner, name: null, level: 'all' }
  if (typeof identityService?.current !== 'function') return { unavailable: true }
  const identity = identityService.current()
  const person = await people.personFor(identity?.id)
  if (person === undefined) return { person: null, name: null, level: null }
  const level = access[person]
  return { person, name: typeof identity?.name === 'string' ? identity.name : null, level: LEVELS.includes(level) ? level : null }
}
