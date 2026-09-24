---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent details: the system prompt renders as Markdown instead of raw source in a
code block, and a long prompt is cut to a preview with **Show full prompt**.
The copy button in the card header still copies the source verbatim. The copy
buttons of code blocks and session payloads are ui-react's `CopyButton`, so a
failed copy is reported instead of failing silently.
