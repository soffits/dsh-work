/**
 * Who is working right now: the sessions DSH has running, each with the open issues that name it
 * as assignee. A child (a session another session started) that holds no issue is work nobody
 * can see on the board, so it is flagged; a main session with no issue is just a conversation.
 * Pure: the caller says who a session is and which issues are open.
 */
import { sameSession } from './rooms.js'

/**
 * @param {object} o
 * @param {Array<{ id: string, title: string|null, parent: string|null }>} o.sessions - running sessions, as `sessions.describe` read them
 * @param {Array<{ number: string|number, title: string, assignee?: string }>} o.open - open board issues
 * @param {(ref: string) => { label: string }} o.who - how a session is named
 * @returns {Array<{ id: string, label: string, title: string, child: boolean, issues: Array<{ number: number, title: string }>, orphan: boolean }>}
 */
export function liveRows({ sessions, open, who }) {
  const rows = sessions.map(session => {
    const issues = open
      .filter(entry => entry.assignee && sameSession(entry.assignee, session.id))
      .map(entry => ({ number: Number(entry.number), title: String(entry.title ?? '') }))
      .sort((a, b) => a.number - b.number)
    const label = who(session.id).label
    const child = Boolean(session.parent)
    return { id: session.id, label, title: session.title || label, child, issues, orphan: child && issues.length === 0 }
  })
  return rows.sort((a, b) => Number(a.orphan) - Number(b.orphan) || a.title.localeCompare(b.title))
}
