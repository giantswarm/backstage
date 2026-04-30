---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

Make AI-chat skills configurable per deployment. The plugin still ships a default set of bundled skills, but deployments can now opt out via `aiChat.skills.bundled: false` and/or extend them with additional sources: `aiChat.skills.dir` (path to a directory of `*.md` files, e.g. mounted from a Kubernetes ConfigMap) and `aiChat.skills.inline` (an array of `{ name, content }` entries in `app-config`). Merge order is bundled → `dir` → `inline`, with later sources overriding earlier ones on name collision. When no skills end up loaded, the `listSkills` and `getSkill` tools are omitted from the toolset entirely.
