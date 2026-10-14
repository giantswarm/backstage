---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Bring the active chat session view to the Agent Platform prototype:

- The tool-call trace now defaults to a plain, readable register — each tool
  call as what it did, via which connector, and its status — with a single
  "Show technical details" toggle (remembered per user) that reveals the exact
  tool names, arguments and results as collapsible payloads.
- The HITL pending confirmation is restyled as the prototype's in-chat
  permission card: who asks, which tool would run (proxied calls unwrapped to
  the real tool and connector), the exact arguments Allow would run, the
  "Changes things" accent, and Allow/Decline buttons.
- The stats strip is replaced by a cost + memory chip in the session header,
  opening a popover with the estimated cost (labeled, with its basis),
  the runtime-reported cost where present, token totals, turns, and
  context-window usage. Window sizes come from the new app-config table
  `agentPlatform.models.contextWindows` ({ modelPattern: tokens }); a model the
  table does not name shows its raw token count. Costs show in the
  installation's configured currency, USD otherwise.
