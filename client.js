/*
 * Browser half of dsh-work: the Work entry in the sidebar (with a red count of unread mentions of
 * the person signed in), and its page. Two views of one board: "Board", the issues as columns,
 * and "Chats", one group chat per issue plus the standing one. Tapping an issue anywhere opens
 * its chat, with the issue's fields pinned on top and the DSH sessions working on it as chips
 * that open DSH's own session view.
 *
 * Plain JavaScript in DSH's Client module format (no build step), built from DSH's own controls
 * (@deepseek-ai/dsh-client-ui-primitives) and the shared kit (ctx.uiKit: chat bubbles, the
 * composer with its @ picker, conversation rows, tiles and times). Everything comes from the
 * plugin's /api/work routes, which decide per request who is asking. Links: ?work=<issue number>,
 * ?work=general, ?work=board[&column=needs-owner|doing|waiting|done], ?work=chats.
 */
window.__ModuleLoader__.load({
  id: '@soffits/dsh-work',
  factory(require) {
    const React = require('react')
    const { Button, Pill, Tag, StateDot, SegmentedTabs, SegmentedControl, IconChevronLeftOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconCheckCircleOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore, Fragment } = React

    const NS = 'dsh-work'
    const PANEL = 'dsh-work'
    const LINK = 'work'
    const STYLE_ID = 'dsh-work-style'
    const SHOWN = { 'needs-owner': 8, doing: 6, waiting: 6, done: 4 }
    const TONE = { 'needs-owner': 'warn', doing: 'accent', waiting: 'muted', done: 'ok' }
    const TILE = { 'needs-owner': ['circle-alert', 'warn'], doing: ['activity', 'accent'], waiting: ['hourglass', 'muted'], done: ['circle-check', 'ok'] }
    const TAG = { 'needs-owner': 'warning', doing: 'info', waiting: 'neutral', paused: 'quiet', closed: 'success' }
    const api = path => new URL(`api/work/${path}`, document.baseURI).href

    // Only layout DSH's components don't cover: the page frame, the columns and cards, the two
    // panes of the chats view, the pinned facts and the jump buttons. Colours are DSH's tokens.
    const CSS = `
.wk-page{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6;line-break:strict;overflow-wrap:anywhere}
.wk-page :focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.wk-page .uk-composerInput:focus-visible{outline:none}
.wk-head{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:28px clamp(16px,3vw,40px) 12px}
[data-platform=darwin] .wk-head{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.wk-head h1{margin:0;font-size:20px;line-height:28px;font-weight:500}
.wk-headLive{flex:1;min-width:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.wk-tabCount{margin-left:6px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}
.wk-tabCount[data-alert]{display:inline-block;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:10px;font-weight:600;line-height:16px;text-align:center}
.wk-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.wk-board{padding:4px clamp(16px,3vw,40px) 40px}
.wk-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:start}
.wk-column{display:flex;flex-direction:column;gap:8px;min-width:0;padding:10px;border-radius:14px;background:var(--dsw-alias-bg-layer-1);transition:box-shadow .3s}
.wk-column[data-flash]{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.wk-columnHead{display:flex;align-items:center;gap:8px;padding:2px 4px;font-weight:500}
.wk-columnHead .wk-n{margin-left:auto}
.wk-dot{flex:none;width:8px;height:8px;border-radius:50%}
.wk-n{font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}
.wk-card{display:flex;flex-direction:column;gap:4px;width:100%;box-sizing:border-box;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .12s}
@media (hover:hover){.wk-card:hover{border-color:var(--dsw-alias-border-l3);box-shadow:0 2px 10px rgba(0,0,0,.06)}}
.wk-card:active{transform:scale(.985)}
.wk-card[data-live]{border-left:3px solid var(--dsw-alias-state-success-primary)}
.wk-cardTop{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wk-cardWorker{display:inline-flex;align-items:center;gap:4px;margin-left:auto;min-width:0;max-width:55%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary)}
.wk-card[data-live] .wk-cardWorker{color:var(--dsw-alias-state-success-primary)}
.wk-cardTitle{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;line-height:21px}
.wk-cardMeta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wk-cardMeta>span{display:inline-flex;align-items:center;gap:4px}
.wk-cardMeta [data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}
.wk-cardMeta [data-tone=ok]{color:var(--dsw-alias-state-success-primary)}
.wk-cardLast{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px;padding-top:6px;border-top:.5px solid var(--dsw-alias-border-l2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.wk-cardLast b{font-weight:500;color:var(--dsw-alias-label-primary)}
.wk-card[data-done] .wk-cardTitle{color:var(--dsw-alias-label-secondary)}
.wk-badges{display:inline-flex;gap:4px;margin-left:auto}
.wk-badge{min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:#fff;font-size:10px;font-weight:600;line-height:16px;text-align:center}
.wk-badge[data-alert]{background:var(--dsw-alias-state-error-primary)}
.wk-n[data-tone=warn]{font-weight:600;color:var(--dsw-alias-state-warn-primary)}
.wk-live{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;padding:10px;border-radius:14px;background:var(--dsw-alias-bg-layer-1)}
.wk-liveList{display:flex;flex-wrap:wrap;gap:6px 8px}
.wk-liveItem{display:inline-flex;align-items:center;gap:2px;min-width:0;max-width:100%;min-height:28px;padding:0 4px 0 0;border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base)}
.wk-liveItem[data-orphan]{border-color:var(--dsw-alias-state-warn-primary)}
.wk-liveSession,.wk-liveIssue{display:inline-flex;align-items:center;gap:6px;min-width:0;padding:0 6px 0 10px;border:0;border-radius:14px;background:none;color:inherit;font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.wk-liveSession>span:last-child{min-width:0;max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wk-liveIssue{flex:none;padding:0 8px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
@media (hover:hover){.wk-liveSession:hover,.wk-liveIssue:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.wk-more{align-self:flex-start}
.wk-switch{margin-bottom:12px}
.wk-chats{flex:1;min-height:0;display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);border-top:.5px solid var(--dsw-alias-border-l2)}
.wk-list{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:.5px solid var(--dsw-alias-border-l2)}
.wk-listTools{flex:none;display:flex;gap:8px;padding:10px 12px 6px}
.wk-listRows{flex:1;min-height:0;overflow:auto;padding:0 6px 24px}
.wk-section{display:flex;align-items:center;gap:6px;width:100%;padding:12px 10px 4px;border:0;background:none;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;text-align:left}
button.wk-section{cursor:pointer;min-height:36px}
.wk-room{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0}
.wk-roomHead{flex:none;display:flex;flex-direction:column;gap:8px;padding:12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.wk-roomTitle{display:flex;align-items:flex-start;gap:8px;min-width:0}
.wk-roomTitle h2{flex:1;min-width:0;margin:0;font-size:16px;line-height:24px;font-weight:500}
.wk-roomNumber{flex:none;font-size:13px;line-height:24px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.wk-facts{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-size:13px;line-height:20px}
.wk-facts dt{color:var(--dsw-alias-label-tertiary)}
.wk-facts dd{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;margin:0}
.wk-step{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wk-step[data-open]{-webkit-line-clamp:unset}
.wk-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;min-height:26px;padding:0 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:13px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;line-height:18px;cursor:pointer;transition:background-color .12s,transform .12s}
@media (hover:hover){.wk-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.wk-chip:active{transform:scale(.96)}
.wk-chip>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wk-timeline{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:16px clamp(12px,3vw,28px) 12px}
.wk-who{display:inline-flex;align-items:center;gap:5px;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.wk-who[disabled]{cursor:default}
.wk-milestone{display:flex;align-items:center;gap:6px;min-width:0}
.wk-milestone>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wk-jumps{position:absolute;right:20px;bottom:calc(var(--wk-dock,96px) + 12px);display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}
.wk-jumps>*{pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.14)}
.wk-dock{flex:none;padding:8px clamp(12px,3vw,28px) 14px;border-top:.5px solid var(--dsw-alias-border-l2)}
.wk-note{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.wk-empty{padding:48px 20px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.wk-error{margin:8px 16px;color:var(--dsw-alias-state-error-primary)}
.wk-placeholder{display:grid;place-items:center;height:100%;color:var(--dsw-alias-label-tertiary)}
.wk-sideIcon{position:relative;display:inline-flex}
.wk-sideBadge{position:absolute;top:-5px;right:-8px;min-width:14px;height:14px;padding:0 3px;box-sizing:border-box;border-radius:7px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:9px;font-weight:600;line-height:14px;text-align:center;pointer-events:none}
/* Chrome is not selectable; titles, steps and message text are. */
.wk-columnHead,.wk-liveItem,.wk-cardTop,.wk-cardMeta,.wk-n,.wk-section,.wk-facts dt,.wk-chip,.wk-tabCount,.wk-badge,.wk-sideIcon,.wk-who,.wk-jumps,.wk-listTools,.wk-roomNumber{-webkit-user-select:none;user-select:none}
.wk-card img,.wk-page svg{-webkit-user-drag:none}
@media (width<=760px){
.wk-head{padding:16px 12px 8px}
.wk-board{padding:0 12px 32px}
.wk-liveList{flex-direction:column}
.wk-liveItem{width:100%;box-sizing:border-box}
.wk-liveSession{flex:1;min-width:0}
.wk-liveSession>span:last-child{max-width:none}
.wk-chats{grid-template-columns:minmax(0,1fr)}
.wk-chats[data-open] .wk-list{display:none}
.wk-chats:not([data-open]) .wk-room{display:none}
.wk-list{border-right:0}
.wk-roomHead{padding:10px 12px}
.wk-jumps{right:12px}
}
@media (width<=760px),(pointer:coarse){.wk-page button:not(.wk-card):not(.uk-convo):not(.wk-step):not(.wk-who),.wk-chip{min-height:40px}.wk-liveItem{min-height:40px}.wk-liveSession,.wk-liveIssue{min-height:38px}.wk-who{min-height:28px}.wk-chip{padding:0 12px}}
@media (prefers-reduced-motion:reduce){.wk-card,.wk-chip,.wk-column{transition:none}.wk-card:active,.wk-chip:active{transform:none}}
`

    // ---- shared state ----

    const shared = { kit: null, workspace: null, mentions: 0, linked: null, version: 0, liveVersion: 0 }
    const listeners = new Set()
    const emit = () => { for (const listener of listeners) listener() }
    const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
    const useShared = select => useSyncExternalStore(subscribe, () => select(shared))

    async function call(path, value) {
      const init = value === undefined
        ? { credentials: 'same-origin', headers: { accept: 'application/json' } }
        : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(value) }
      const response = await fetch(api(path), init)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      return body
    }

    async function refreshBadge() {
      try {
        const { mentions } = await call('summary')
        if (mentions !== shared.mentions) { shared.mentions = mentions; emit() }
      } catch {
        // Signed out or DSH restarting: the next tick tries again.
      }
    }
    // A notice that only says who is running leaves the board's own reads alone.
    const changed = notice => {
      shared.liveVersion += 1
      if (notice?.what !== 'live') { shared.version += 1; refreshBadge() }
      emit()
    }

    /** Whether the page is phone-narrow: one pane at a time, one column at a time. */
    function useNarrow() {
      const query = '(max-width: 760px)'
      const [narrow, setNarrow] = useState(() => window.matchMedia?.(query).matches ?? false)
      useEffect(() => {
        const list = window.matchMedia?.(query)
        if (!list) return undefined
        const on = () => setNarrow(list.matches)
        list.addEventListener('change', on)
        return () => list.removeEventListener('change', on)
      }, [])
      return narrow
    }

    const openSession = id => { if (id && shared.workspace) shared.workspace.openSession(id) }

    /** A session as a chip: its state dot and name; a tap opens it in DSH. */
    function SessionChip({ person, t }) {
      if (!person) return null
      const title = person.title ? `${person.label} · ${person.title}` : person.label
      return h('button', {
        type: 'button', className: 'wk-chip', title: t('openSession', { name: title }), 'aria-label': t('openSession', { name: title }),
        onClick: () => openSession(person.id), disabled: !person.id || !shared.workspace,
      }, person.dot && h(StateDot, { state: person.dot }), h('span', null, person.label))
    }

    // ---- the board ----

    function Card({ room, kit, t, worker, onOpen }) {
      const today = room.next && room.next <= new Date().toISOString().slice(0, 10)
      return h('button', { type: 'button', className: 'wk-card', onClick: () => onOpen(room.id), 'data-live': worker?.state === 'running' ? 'true' : undefined, 'data-done': room.column === 'done' ? 'true' : undefined },
        h('span', { className: 'wk-cardTop' },
          room.number && h('span', null, `#${room.number}`),
          room.labels.slice(0, 2).map(label => h(Tag, { key: label, tone: 'quiet' }, label)),
          room.column === 'done'
            ? h('span', { className: 'wk-cardWorker' }, h(IconCheckCircleOutlineRegular, { size: 13 }), h(kit.RelativeDay, { date: room.closed }))
            : worker && h('span', { className: 'wk-cardWorker', title: worker.title || undefined }, h(StateDot, { state: worker.state === 'running' ? 'done' : 'idle' }), worker.label),
          (room.unread > 0 || room.mentioned > 0) && h('span', { className: 'wk-badges' },
            room.mentioned > 0 && h('span', { className: 'wk-badge', 'data-alert': 'true' }, '@'),
            room.unread > 0 && h('span', { className: 'wk-badge' }, room.unread))),
        h('span', { className: 'wk-cardTitle' }, room.title),
        room.column !== 'done' && h('span', { className: 'wk-cardMeta' },
          room.next && h('span', { 'data-tone': today || room.overdue ? 'warn' : undefined }, h(kit.Icon, { name: today || room.overdue ? 'calendar-clock' : 'calendar', size: 13 }), h(kit.RelativeDay, { date: room.next })),
          room.count > 0 && h('span', { 'aria-label': t('comments', { n: room.count }) }, h(kit.Icon, { name: 'message-square', size: 13 }), room.count),
          room.points && h('span', { 'data-tone': 'ok' }, h(kit.Icon, { name: 'sparkles', size: 13 }), t('points', { n: room.points }))),
        room.column !== 'done' && room.last && h('span', { className: 'wk-cardLast' }, h('b', null, room.last.who.label), ' ', room.last.text))
    }

    function Column({ id, rooms, kit, t, workers, onOpen, flash, doneDays }) {
      const [all, setAll] = useState(false)
      const shown = all ? rooms : rooms.slice(0, SHOWN[id])
      return h('section', { className: 'wk-column', id: `wk-col-${id}`, 'data-flash': flash ? 'true' : undefined, 'aria-label': t(`column.${id}`, { n: doneDays }) },
        h('div', { className: 'wk-columnHead' }, h('span', { className: 'wk-dot', style: { background: kit.toneColor(TONE[id]) } }), t(`column.${id}`, { n: doneDays }), h('span', { className: 'wk-n', 'data-tone': id === 'needs-owner' && rooms.length > 0 ? 'warn' : undefined }, rooms.length)),
        shown.map(room => h(Card, { key: room.id, room, kit, t, worker: workers[room.assignee], onOpen })),
        rooms.length > shown.length && h(Button, { variant: 'ghost', size: 'sm', className: 'wk-more', onClick: () => setAll(true) }, t('more', { n: rooms.length - shown.length })),
        all && rooms.length > SHOWN[id] && h(Button, { variant: 'ghost', size: 'sm', className: 'wk-more', onClick: () => setAll(false) }, t('less')))
    }

    /** Who is working now: each running session or child with its issue, or "no issue" for a child that holds none. */
    function LiveStrip({ kit, t, onOpen }) {
      const version = useShared(s => s.liveVersion)
      const [rows, setRows] = useState(null)
      useEffect(() => {
        let live = true
        call('live').then(body => { if (live) setRows(body.sessions) }, () => { if (live) setRows(null) })
        return () => { live = false }
      }, [version])
      if (rows === null) return null
      return h('section', { className: 'wk-live', 'aria-label': t('live.title') },
        h('div', { className: 'wk-columnHead' }, h('span', { className: 'wk-dot', style: { background: kit.toneColor('ok') } }), t('live.title'), h('span', { className: 'wk-n' }, rows.length)),
        rows.length === 0
          ? h('p', { className: 'wk-note' }, t('live.empty'))
          : h('div', { className: 'wk-liveList', role: 'list' }, rows.map(row => {
            const first = row.issues[0]
            return h('div', { key: row.id, className: 'wk-liveItem', role: 'listitem', 'data-orphan': row.orphan ? 'true' : undefined },
              h('button', {
                type: 'button', className: 'wk-liveSession', title: t('openSession', { name: `${row.label} · ${row.title}` }),
                onClick: () => openSession(row.id), disabled: !shared.workspace,
              }, h(StateDot, { state: 'ongoing' }), h('span', null, row.title)),
              first
                ? h('button', {
                  type: 'button', className: 'wk-liveIssue', title: row.issues.map(issue => `#${issue.number} ${issue.title}`).join('\n'),
                  onClick: () => onOpen(String(first.number)),
                }, `#${first.number}`, row.issues.length > 1 && ` +${row.issues.length - 1}`)
                : row.orphan && h(Tag, { tone: 'warning' }, t('live.noIssue')))
          })))
    }

    function BoardView({ data, kit, t, onOpen, focusColumn }) {
      const narrow = useNarrow()
      const byColumn = useMemo(() => {
        const out = Object.fromEntries(data.columns.map(id => [id, []]))
        for (const room of data.rooms) out[room.column]?.push(room)
        out.done = data.done
        for (const id of ['needs-owner', 'doing', 'waiting']) out[id].sort((a, b) => String(a.next ?? '9').localeCompare(String(b.next ?? '9')))
        return out
      }, [data])
      const [column, setColumn] = useState(focusColumn ?? 'doing')
      const [flash, setFlash] = useState(focusColumn ?? null)
      useEffect(() => {
        if (!focusColumn) return undefined
        setColumn(focusColumn)
        setFlash(focusColumn)
        document.getElementById(`wk-col-${focusColumn}`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
        const timer = setTimeout(() => setFlash(null), 1600)
        return () => clearTimeout(timer)
      }, [focusColumn])
      const doneDays = data.doneDays ?? 7
      if (data.rooms.length === 0 && data.done.length === 0) return h('p', { className: 'wk-empty' }, t('empty.board'))
      const columns = narrow ? [column] : data.columns
      return h('div', { className: 'wk-board' },
        data.me.level === 'all' && h(LiveStrip, { kit, t, onOpen }),
        narrow && h('div', { className: 'wk-switch' }, h(SegmentedControl, {
          id: 'wk-columns', value: column, label: t('columns'), onChange: setColumn,
          options: data.columns.map(id => ({ value: id, label: `${t(`column.${id}`, { n: doneDays }).split(',')[0]} ${byColumn[id].length}` })),
        })),
        h('div', { className: 'wk-columns' }, columns.map(id => h(Column, { key: id, id, rooms: byColumn[id], kit, t, workers: data.workers, onOpen, flash: flash === id, doneDays }))))
    }

    // ---- the chats ----

    function roomTile(kit, room) {
      if (room.kind === 'topic') return h(kit.Tile, { icon: 'hash', tone: 'muted', size: 40 })
      const [icon, tone] = TILE[room.column] ?? TILE.waiting
      return h(kit.Tile, { icon, tone, size: 40 })
    }

    function RoomRow({ room, kit, t, workers, active, onOpen }) {
      const worker = workers?.[room.assignee]
      const preview = room.closed ? room.outcome : room.last ? `${room.last.who.label}: ${room.last.text}` : ''
      return h(kit.ConversationRow, {
        icon: roomTile(kit, room),
        title: room.kind === 'topic' ? t('general') : room.number ? `#${room.number} ${room.title}` : room.title,
        dot: worker?.state === 'running' ? h(StateDot, { state: 'done' }) : null,
        preview,
        time: room.latest ? h(kit.TimeAgo, { at: room.latest }) : null,
        unread: room.unread ?? 0,
        mention: room.mentioned > 0,
        active,
        onClick: () => onOpen(room.id),
      })
    }

    function ChatList({ data, kit, t, open, onOpen }) {
      const [filter, setFilter] = useState('all')
      const [archive, setArchive] = useState(null)
      const [showArchive, setShowArchive] = useState(false)
      useEffect(() => {
        if (!showArchive || archive !== null) return
        call('archived').then(body => setArchive(body.rooms), () => setArchive([]))
      }, [showArchive, archive])
      const rooms = filter === 'mentions' ? data.rooms.filter(room => room.mentioned > 0) : data.rooms
      const general = data.general && (filter === 'all' || data.general.mentioned > 0) ? data.general : null
      return h('div', { className: 'wk-list' },
        h('div', { className: 'wk-listTools', role: 'group', 'aria-label': t('filters') },
          h(Pill, { active: filter === 'all', 'aria-pressed': filter === 'all', onClick: () => setFilter('all') }, t('filter.all')),
          h(Pill, { active: filter === 'mentions', 'aria-pressed': filter === 'mentions', onClick: () => setFilter('mentions') }, t('filter.mentions'),
            data.mentions > 0 && h('span', { className: 'wk-tabCount', 'data-alert': 'true' }, data.mentions))),
        h('div', { className: 'wk-listRows' },
          general && h(RoomRow, { room: general, kit, t, active: open === general.id, onOpen }),
          rooms.length > 0 && h('div', { className: 'wk-section' }, t('issues'), h('span', { className: 'wk-n' }, rooms.length)),
          rooms.map(room => h(RoomRow, { key: room.id, room, kit, t, workers: data.workers, active: open === room.id, onOpen })),
          filter === 'mentions' && rooms.length === 0 && !general && h('p', { className: 'wk-empty' }, t('empty.mentions')),
          filter === 'all' && data.archived > 0 && h('button', { type: 'button', className: 'wk-section', 'aria-expanded': showArchive, onClick: () => setShowArchive(value => !value) },
            h(showArchive ? IconChevronDownOutlineRegular : IconChevronRightOutlineRegular, { size: 14 }), t('archived'), h('span', { className: 'wk-n' }, data.archived)),
          showArchive && (archive ?? []).map(room => h(RoomRow, { key: room.id, room, kit, t, active: open === room.id, onOpen }))))
    }

    /** Comments and session milestones in time order, with day lines and the unread line. */
    function timeline(room, kit) {
      const rows = [
        ...room.comments.map(comment => ({ type: 'comment', time: comment.time, comment })),
        ...room.milestones.map(milestone => ({ type: 'milestone', time: milestone.time, milestone })),
      ].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
      const firstUnread = room.comments.find(comment => comment.i >= room.read && !comment.mine)
      const out = []
      let day = ''
      for (const row of rows) {
        const thisDay = new Date(row.time).toDateString()
        if (thisDay !== day) {
          day = thisDay
          out.push({ type: 'day', key: `day-${thisDay}`, time: row.time })
        }
        if (row.type === 'comment' && row.comment === firstUnread) out.push({ type: 'unread', key: 'unread' })
        out.push({ ...row, key: row.type === 'comment' ? `c-${row.comment.i}` : `m-${row.milestone.kind}-${row.milestone.session.id}` })
      }
      return { rows: out, firstUnread }
    }

    function RoomView({ id, data, kit, t, onBack, showBack }) {
      const version = useShared(s => s.version)
      const [room, setRoom] = useState(null)
      const [error, setError] = useState(null)
      const [draft, setDraft] = useState('')
      const [sending, setSending] = useState(false)
      const [sendError, setSendError] = useState(null)
      const [stepOpen, setStepOpen] = useState(false)
      const [atBottom, setAtBottom] = useState(true)
      const scroller = useRef(null)
      const placed = useRef(null)
      const drafts = useRef(new Map())

      useEffect(() => {
        let live = true
        call(`room?id=${encodeURIComponent(id)}`).then(body => { if (live) { setRoom(body); setError(null) } }, reason => { if (live) setError(reason.message) })
        return () => { live = false }
      }, [id, version])
      useEffect(() => {
        setDraft(drafts.current.get(id) ?? '')
        setStepOpen(false)
        placed.current = null
        setRoom(null)
      }, [id])

      const markRead = useCallback(() => {
        if (room && room.comments.length > room.read) call('read', { id, count: room.comments.length }).then(refreshBadge, () => {})
      }, [room, id])

      // On first show, start at the unread line (or the end); later updates keep the reader at the end if they were there.
      useEffect(() => {
        const el = scroller.current
        if (!el || !room) return
        if (placed.current !== id) {
          placed.current = id
          requestAnimationFrame(() => {
            const line = el.querySelector('[data-unread-line]')
            if (line) line.scrollIntoView({ block: 'start' })
            else el.scrollTop = el.scrollHeight
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
            setAtBottom(bottom)
            if (bottom) markRead()
          })
        } else if (atBottom) {
          requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
          markRead()
        }
      }, [room])

      const onScroll = () => {
        const el = scroller.current
        if (!el) return
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        if (bottom !== atBottom) setAtBottom(bottom)
        if (bottom) markRead()
      }

      if (error) return h('div', { className: 'wk-room' }, showBack && h(Button, { variant: 'ghost', size: 'sm', onClick: onBack }, h(IconChevronLeftOutlineRegular, { size: 16 }), t('back')), h('p', { className: 'wk-error', role: 'alert' }, t('error', { message: error })))
      if (!room) return h('div', { className: 'wk-room' }, showBack && h('div', { className: 'wk-roomHead' }, h(Button, { variant: 'ghost', size: 'sm', 'aria-label': t('back'), onClick: onBack }, h(IconChevronLeftOutlineRegular, { size: 18 }))), h('p', { className: 'wk-empty', role: 'status' }, t('loading')))

      const me = [data.me.person, data.me.name].filter(Boolean)
      const info = room.room
      const { rows, firstUnread } = timeline(room, kit)
      const unreadMention = room.comments.find(comment => comment.i >= room.read && comment.me)
      const title = info.general ? t('general') : info.title
      const byToken = new Map(room.candidates.map(candidate => [candidate.token.toLowerCase(), candidate.label ?? candidate.token]))
      const named = kit.mentionsIn(draft)
      const to = named.includes('all') ? [t('everyone')]
        : named.length > 0 ? [...named.map(token => byToken.get(token) ?? token), ...room.defaultTo.filter(w => w.kind === 'assistant').map(w => w.label)]
          : room.defaultTo.map(w => w.label)
      const send = async () => {
        setSending(true)
        setSendError(null)
        try {
          await call('post', { id, text: draft })
          setDraft('')
          drafts.current.delete(id)
          setAtBottom(true)
          changed()
        } catch (reason) {
          setSendError(t('sendFailed', { message: reason.message }))
        } finally {
          setSending(false)
        }
      }
      const jump = target => target?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

      return h('div', { className: 'wk-room' },
        h('header', { className: 'wk-roomHead' },
          h('div', { className: 'wk-roomTitle' },
            showBack && h(Button, { variant: 'ghost', size: 'sm', 'aria-label': t('back'), onClick: onBack }, h(IconChevronLeftOutlineRegular, { size: 18 })),
            info.number && h('span', { className: 'wk-roomNumber' }, `#${info.number}`),
            h('h2', null, title),
            info.status && !info.general && h(Tag, { tone: TAG[info.status] ?? 'neutral' }, t(`status.${info.status}`))),
          !info.general && h('dl', { className: 'wk-facts' },
            h('dt', null, t('field.assignee')),
            h('dd', null, (() => {
              const others = room.sessions.filter(row => row.id !== room.assignee?.id && row.state !== 'stored')
              if (!room.assignee && others.length === 0) return h('span', { className: 'wk-n' }, t('nobody'))
              return [room.assignee && h(SessionChip, { key: 'assignee', person: room.assignee, t }), ...others.map(row => h(SessionChip, { key: row.id, person: row, t }))]
            })()),
            info.next && h(Fragment, null, h('dt', null, t('field.next')), h('dd', null, h(kit.Icon, { name: 'calendar', size: 13 }), h(kit.RelativeDay, { date: info.next }))),
            info.step && h(Fragment, null, h('dt', null, t('field.step')),
              h('dd', null, h('button', { type: 'button', className: 'wk-step', 'data-open': stepOpen ? 'true' : undefined, 'aria-expanded': stepOpen, onClick: () => setStepOpen(value => !value) }, info.step))),
          )),
        h('div', { className: 'wk-timeline', ref: scroller, onScroll, role: 'log', 'aria-live': 'polite' },
          rows.length === 0 && h('p', { className: 'wk-empty' }, t('empty.chat')),
          rows.map(row => {
            if (row.type === 'day') return h(kit.ChatDivider, { key: row.key }, h(kit.DayLabel, { at: row.time }))
            if (row.type === 'unread') return h('div', { key: row.key, 'data-unread-line': 'true' }, h(kit.ChatDivider, { tone: 'accent' }, t('newCount', { n: room.comments.filter(c => c.i >= room.read && !c.mine).length })))
            if (row.type === 'milestone') {
              const m = row.milestone
              return h(kit.ChatBubble, { key: row.key, folded: true, time: m.time },
                h('span', { className: 'wk-milestone' },
                  h(kit.Icon, { name: m.kind === 'started' ? 'play' : 'circle-check', size: 13 }),
                  h(SessionChip, { person: { ...m.who, ...m.session, dot: m.session.dot }, t }),
                  h('span', null, m.kind === 'started' ? `${t('started')}${m.session.title ? ` · ${m.session.title}` : ''}` : `${t('finished')}: ${m.text}`)))
            }
            const c = row.comment
            const author = c.mine ? null : h('button', {
              type: 'button', className: 'wk-who', disabled: c.who.kind === 'person' || !c.who.id,
              onClick: () => openSession(c.who.id), title: c.who.kind !== 'person' && c.who.id ? t('openSession', { name: c.who.label }) : undefined,
            }, c.who.kind !== 'person' && h(kit.Icon, { name: c.who.kind === 'assistant' ? 'sparkles' : 'bot', size: 13 }), c.who.label)
            return h(kit.ChatBubble, { key: row.key, id: `wk-c-${c.i}`, side: c.mine ? 'end' : 'start', author, time: c.time, highlight: c.me },
              h(kit.MentionText, { text: c.text, me }))
          })),
        (!atBottom || unreadMention) && h('div', { className: 'wk-jumps' },
          unreadMention && h(Button, { variant: 'outline', size: 'sm', onClick: () => jump(document.getElementById(`wk-c-${unreadMention.i}`)) }, '@ ', t('jumpMention')),
          !atBottom && h(Button, { variant: 'outline', size: 'sm', onClick: () => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) } }, h(IconChevronDownOutlineRegular, { size: 14 }), t('jumpLatest'))),
        h('div', { className: 'wk-dock' },
          info.closed ? h('p', { className: 'wk-note' }, t('closedNote', { date: info.closed, outcome: info.outcome || '' }))
            : !room.canPost ? h('p', { className: 'wk-note' }, t('readOnly'))
              : h(kit.Composer, {
                value: draft,
                onChange: value => { setDraft(value); drafts.current.set(id, value) },
                onSend: send,
                candidates: room.candidates,
                recipients: to.length > 0 ? `→ ${to.join(', ')}` : null,
                placeholder: info.general ? t('placeholderGeneral') : t('placeholder', { room: info.number ? `#${info.number}` : title }),
                sending,
                error: sendError,
              })))
    }

    function ChatsView({ data, kit, t, open, onOpen, onBack }) {
      const narrow = useNarrow()
      return h('div', { className: 'wk-chats', 'data-open': open ? 'true' : undefined },
        h(ChatList, { data, kit, t, open, onOpen }),
        open ? h(RoomView, { key: open, id: open, data, kit, t, onBack, showBack: narrow }) : h('div', { className: 'wk-room' }, h('div', { className: 'wk-placeholder' }, h(kit.Icon, { name: 'message-square', size: 28 }))))
    }

    // ---- the page ----

    function WorkPage({ translate: t }) {
      const kit = useShared(s => s.kit)
      if (kit === null || typeof kit.Composer !== 'function') return h('div', { className: 'wk-page' }, h('p', { className: 'wk-empty' }, t('kitMissing')))
      return h(Work, { t, kit })
    }

    function Work({ t, kit }) {
      const version = useShared(s => s.version)
      const linked = useShared(s => s.linked)
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [view, setView] = useState('board')
      const [open, setOpen] = useState(null)
      const [from, setFrom] = useState(null)
      const [focusColumn, setFocusColumn] = useState(null)
      const stream = kit.useEventStream('api/work/events', changed)

      useEffect(() => {
        let live = true
        call('overview').then(body => { if (live) { setData(body); setError(null) } }, reason => { if (live) setError(reason.message) })
        return () => { live = false }
      }, [version])

      useEffect(() => {
        if (!linked) return
        shared.linked = null
        if (linked.view === 'board') { setView('board'); setOpen(null); setFocusColumn(linked.column ?? null) }
        else if (linked.view === 'chats') { setView('chats'); setOpen(null) }
        else { setView('chats'); setOpen(linked.room); setFrom(null) }
      }, [linked])

      const openRoom = id => { setFrom(view); setView('chats'); setOpen(id) }
      const back = () => { setOpen(null); if (from === 'board') setView('board'); setFrom(null) }
      const tabs = [
        { value: 'board', id: 'wk-tab-board', panelId: 'wk-panel', label: h(Fragment, null, t('view.board'), data && h('span', { className: 'wk-tabCount' }, data.rooms.length)) },
        { value: 'chats', id: 'wk-tab-chats', panelId: 'wk-panel', label: h(Fragment, null, t('view.chats'), data?.mentions > 0 && h('span', { className: 'wk-tabCount', 'data-alert': 'true' }, data.mentions)) },
      ]
      const narrow = useNarrow()
      const chatOpenOnPhone = narrow && view === 'chats' && open
      return h('div', { className: 'wk-page' },
        !chatOpenOnPhone && h('div', { className: 'wk-head' },
          h('h1', null, t('title')),
          h('span', { className: 'wk-headLive' }, h(kit.LiveStatus, { status: stream })),
          h(SegmentedTabs, { items: tabs, value: view, label: t('views'), size: 'sm', onChange: value => { setView(value); if (value === 'board') setOpen(null) } })),
        error && h('p', { className: 'wk-error', role: 'alert' }, t('error', { message: error })),
        data && view === 'board' && h('div', { className: 'wk-scroll', id: 'wk-panel' }, h(BoardView, { data, kit, t, onOpen: openRoom, focusColumn })),
        data && view === 'chats' && h(ChatsView, { data, kit, t, open, onOpen: id => { setFrom('chats'); setOpen(id) }, onBack: back }))
    }

    function KanbanGlyph({ size }) {
      const kit = useShared(s => s.kit)
      return kit === null ? null : h(kit.Icon, { name: 'square-kanban', size })
    }

    function SidebarIcon({ size }) {
      const mentions = useShared(s => s.mentions)
      return h('span', { className: 'wk-sideIcon' },
        h(KanbanGlyph, { size }),
        mentions > 0 && h('span', { className: 'wk-sideBadge' }, mentions > 99 ? '99+' : String(mentions)))
    }

    /** `?work=` as what to show: a view (with a column) or a room. */
    function parseLink(params) {
      const value = params.get(LINK)
      if (value === null) return null
      if (value === 'board' || value === '') return { view: 'board', column: params.get('column') || null }
      if (value === 'chats') return { view: 'chats' }
      return { view: 'room', room: value.replace(/^#/, '') }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          let disposers = []
          let live = true
          call('strings').then(({ tables }) => {
            if (!live) return
            disposers = Object.entries(tables).map(([tag, table]) => ctx.locale.register(NS, tag, table))
          }, reason => console.warn('work: words unavailable', reason))
          return () => { live = false; for (const dispose of disposers) dispose() }
        }, 'work: dictionaries')
        const t = ctx.locale.bind(NS)

        ctx.effect(() => {
          if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return () => {}
          const tag = document.createElement('style')
          tag.id = STYLE_ID
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'work: styles')

        ctx.inject(['uiKit'], scope => {
          scope.effect(() => {
            shared.kit = scope.uiKit
            emit()
            return () => { shared.kit = null; emit() }
          }, 'work: kit')
        })
        // DSH's own session view, for the session chips.
        ctx.inject(['uiWorkspace'], scope => {
          scope.effect(() => {
            shared.workspace = scope.uiWorkspace
            emit()
            return () => { shared.workspace = null; emit() }
          }, 'work: sessions')
        })

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: NS, inject: () => ({ translate: t }) }, WorkPage))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 12, locale: NS, label: () => t('panel') }, SidebarIcon))

        // The mention badge: checked while the page is visible, at once when it becomes visible.
        ctx.effect(() => {
          let timer
          const tick = () => {
            clearTimeout(timer)
            if (document.visibilityState === 'visible') refreshBadge()
            timer = setTimeout(tick, 30000)
          }
          const onVisible = () => { if (document.visibilityState === 'visible') tick() }
          document.addEventListener('visibilitychange', onVisible)
          tick()
          return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
        }, 'work: badge')

        ctx.effect(() => {
          const params = new URLSearchParams(location.search)
          const link = parseLink(params)
          if (link === null) return () => {}
          params.delete(LINK)
          params.delete('column')
          const query = params.toString()
          history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
          shared.linked = link
          emit()
          let tries = 0
          const timer = setInterval(() => {
            const layout = ctx.get('layout')
            try {
              layout?.selectPanel(PANEL)
              if (layout) clearInterval(timer)
            } catch {
              // The main slot entry is not registered yet.
            }
            if (++tries > 50) clearInterval(timer)
          }, 100)
          return () => clearInterval(timer)
        }, 'work: links')
      },
    }
  },
})
