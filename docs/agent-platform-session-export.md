# Session export format

A **Session export** is the JSON file the session page's **Export session**
item saves: one session and all of its tasks, as kagent stores them. The
agent-platform plugin is its only producer, so this is where the format is
described. Readers are evaluation tooling and people investigating a session
after the fact.

## The file

One JSON object with five keys, indented by two spaces for reading in an
editor or a diff (`jq -c` makes it compact):

```json
{
  "formatVersion": 1,
  "exportedAt": "2026-10-22T09:15:00.000Z",
  "installation": "example",
  "session": {
    "id": "…",
    "agent": { "namespace": "…", "name": "…" },
    "creator": "…",
    "preparedRevision": "…"
  },
  "tasks": [
    {
      "id": "…",
      "contextId": "…",
      "status": { "state": "TASK_STATE_COMPLETED" },
      "history": [],
      "artifacts": []
    }
  ]
}
```

| Key             | Content                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `formatVersion` | An integer, `1` today. It goes up with any change a reader has to know about; reject a version you do not know.                            |
| `exportedAt`    | When the file was made, as an RFC 3339 UTC timestamp. The session may have moved on since: a turn running at export time shows as running. |
| `installation`  | The installation the session runs on, as the session page's URL names it (`/sessions/<installation>/<id>`).                                |
| `session`       | kagent's `Session` (`SessionService/GetSession`), verbatim: owner (`creator`), agent reference, the opaque agent revision id, state.       |
| `tasks`         | Every A2A task of the session (`A2AService/ListTasks`), verbatim, oldest first, with full history and artifacts.                           |

`session` and `tasks` are kagent's proto3 JSON: the same keys and content that
agent-manager's `get_session` tool returns at `detail: full`, so one reader
handles both.

Nothing is normalized. Tool calls and results are left as kagent stored them,
nested MCP results included (a function response whose `response` carries an
MCP `content` list or `structuredContent` stays nested).

The file holds **everything the agent saw**: prompts, tool arguments, tool
results, cluster data, anything a tool returned. Nothing is redacted. Handle it
as customer data.

It holds no agent configuration (system prompt, model, tool bindings, skills):
kagent offers no read of a revision's content. The session names the agent and
the revision it last ran on.

## Complete or nothing

The portal saves a file only when it read the whole session. The tasks route
reads up to 1,000 tasks, fewer for a session with large messages (it reads
those in smaller pages, and a read stops after 100 calls). A session it could
not read to the end is not exported from the portal, and the person is
pointed to agent-manager's `get_session` with `detail: full` and a large
`maxBytes`, which returns the whole session. A failed read saves no file.

Only the session's owner can export it: both reads go to kagent with the
person's own token, and a session that is someone else's, or deleted, answers
"not found".

## Caveats

- **Older sessions' context id.** Some sessions recorded by older controllers
  have an A2A context id (`session.contextId`) that differs from the session
  id. The tasks route lists tasks by the session id, so it would find none of
  theirs: the portal refuses to export such a session rather than save it
  without its tasks. In an export, `contextId` (where present) equals
  `session.id`.
- **"Verbatim" as far as the generated client goes.** The Backstage backend
  decodes kagent's answers with its generated kagent client and re-encodes
  them as proto3 JSON. A field kagent added after the client was last
  generated is dropped. Regenerating the client with kagent upgrades keeps the
  export lossless. `get_session` has the same property with agent-manager's
  client.
- **Tool-call part types in older history.** Current kagent marks tool-call
  parts only with the metadata key `kagent.dev/a2a/part-type`
  (`function_call`, `function_response`, …). History recorded by older
  controllers can carry `adk_type` or `kagent_type` instead. Check all three.
- **proto3 JSON leaves defaults out.** An empty list, a zero and an empty
  string are absent, not present and empty. A session that has never run
  exports `"tasks": []`.
