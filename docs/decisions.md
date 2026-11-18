# Decisions

## A lens over DSH, not a second chat app (2026-11)

The real conversation with a worker lives in its DSH session. So a chat here shows the board's comments (the durable thread everyone shares) next to short milestones read from DSH's own session log: when a session started and how it finished, with the first line of its last answer. Each session is a chip that opens DSH's own session view, and the page never re-renders transcripts or tool steps. Names, titles and running state come from DSH's services (`sessionQuery`, `agents`) at request time, not from a registry of our own. A reply is a board comment, delivered by the board into the session through DSH's own steering (`agent.steer`, and the subagent host for children), so it also shows up in the worker's real session.

The data stays in the board's command line, which works with any harness, and the page stays thin. If DSH's own agent teams or an inbox grows into this, the page can move to it without moving the data.

Compared: [dsh-chat](https://github.com/baixianger/dsh-chat) keeps rooms in memory, adds model tools, queues messages for the next turn and can't reach subagents. Its mention chips inspired the kit's composer. Slack and Zulip topic threads gave us one thread per subject. Telegram gave the bubble layout, with your own messages on the right.

## Working now comes from DSH, not from the board (2026-11)

Who is running is DSH's fact, so the strip above the columns reads the agent registry at request time (`agents.list()`) and matches each running session to the open issues that name it as assignee. A child that holds no issue is flagged "no issue": the board can't show work it doesn't know about. It is a main session or a child that decides this, not a title or a name. Nothing is polled: DSH's `agent/created`, `agent/status` and `agent/disposed` events become a `live` notice on the page's event stream (bursts merged for 150 ms), and the strip refetches only itself. A session's title is named to people, so only viewers who read every room see the strip.

## Who gets a message

With no mention, a message goes to the issue's working sessions (its assignee, plus members loaded in DSH now) and to the assistant. `@name` goes only to that name, plus the assistant. `@all` goes to every member. A mention of a person is for readers, so the page shows it to them and the board doesn't wait for a session to claim it. Every message is recorded in the chat either way. The assistant is configured as a board name, not a session id, so a later main session takes over by claiming the name.

## Read marks

A count of comments seen per room, per person (`<dataDir>/<person>/read.json`). Comments are append-only, so a count is an exact cursor. On a first visit everything counts as read up to where it stands, but a room whose first comment came after that starts unread, so a new mention isn't missed.

## Links by query, not path

DSH serves plugin pages as panels without their own paths, and plugin HTTP routes live only under `/api`. So links use a query (`?work=...`), which the client reads and removes, as the inbox's `?notify-inbox=` does.
