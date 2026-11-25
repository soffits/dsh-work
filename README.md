# dsh-work

A work page for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Your agents' open work, from a work board, shown two ways:

- **Board**: the issues in columns (Needs you, Doing, Waiting, Done in the last few days), each headed by its count. Above them, **Working now** lists every session DSH has running, children included, each with the issue it holds, or "no issue" for a child that holds none, so work nobody put on the board is seen too. It follows DSH's own session events, so it changes the moment a session starts or stops. Each card shows its number, labels, the session working on it, the next date, how many comments it has and the last one, and, when the board reports them, the points answering earns.
- **Chats**: one group chat per issue, the newest activity first, plus a standing general chat and an archive of closed issues. A chat shows the issue's comments next to milestones of the DSH sessions working on it (started, finished, with their last line). Each session is a chip that opens DSH's own view of it. The issue's status, assignee, next date and next step are pinned on top.

You write in a chat as yourself. With no @mention, your message goes to the sessions working on the issue and to the assistant. `@name` reaches only that one (and the assistant), and `@all` reaches everyone in the chat. The composer shows who will get it before you send. When an agent mentions you, the chat's row gets a red @, the sidebar entry counts your unread mentions, and the message is highlighted with a button that jumps to it.

The page keeps no copy of the board. It reads and writes through a work board command line (anything that answers the JSON in "Board contract" below). The board then delivers each message into the sessions it is for with DSH's own steering, so it shows up in the worker's real session too.

## Install

```sh
dsh plugin --profile web add @soffits/dsh-work @soffits/dsh-plugin-sdk
```

Then point the `work` row at your board in your profile's `cordis.patch.yml`:

```yaml
- id: work
  config:
    command: [kith, board]
    cwd: ~/my-home
    boardDir: ~/my-home/notes/board
    assistant: assistant          # the board name the assistant's main session claims
    assistantName: Kit
```

With several people signing in (through a plugin that provides `requestIdentity`, such as dsh-oidc), map their ids to people and give each a level:

```yaml
    peopleFile: ~/my-home/config/people.json
    peopleKey: oidc_users
    access: { ana: all, ben: mentioned }
    names: { ana: Ana, ben: Ben }
```

`all` reads and writes every chat. `mentioned` sees only the chats where someone mentioned that person, and can answer there. Anyone not listed sees nothing.

## Links

`?work=<issue number>` opens that issue's chat, `?work=general` the standing chat, `?work=board` the columns (`&column=needs-owner|doing|waiting|done` picks one) and `?work=chats` the list.

## Board contract

`list --json` entries may carry `points` (what a needs-owner issue earns its owner when answered). The command must answer `list --json`, `list --topics --json`, `list --closed --json` and `agents --json` (sessions with their names), and take `comment --by <person> [--to <session>]... -- <ref> <text>` and `topic --by <person> -- <title>`. See `docs/decisions.md` for why the page is this thin.

## Licence

MIT. See `NOTICE` for credits.
