/**
 * What the person asking may do. Who they are comes from the shared people mapping
 * (`@soffits/dsh-host-kit`); `access` then gives each person a level:
 *
 *   all        reads every room and writes in every room
 *   mentioned  reads and writes only in rooms where someone mentioned them
 *
 * Without any mapping (a DSH only its owner signs in to) everyone DSH lets in is the owner, at
 * level `all`.
 */
import { viewerOf as identify } from '@soffits/dsh-host-kit'

export const LEVELS = Object.freeze(['all', 'mentioned'])

/**
 * The viewer of this request: `{ person, name, level }` (level null: may see nothing), or
 * `{ unavailable: true }` when a mapping is configured but no identity provider runs.
 * @param {ReturnType<import('@soffits/dsh-host-kit').createPeople>} people
 * @param {Record<string, string>} access - person id → level
 * @param {string} owner - the person an unmapped (single-owner) DSH acts as
 */
export async function viewerOf(people, identityService, access, owner) {
  const viewer = await identify(people, identityService)
  if (viewer.mode === 'owner') return { person: owner, name: null, level: 'all' }
  if (viewer.unavailable) return { unavailable: true }
  if (viewer.person === undefined) return { person: null, name: null, level: null }
  const level = access[viewer.person]
  return { person: viewer.person, name: viewer.name, level: LEVELS.includes(level) ? level : null }
}
