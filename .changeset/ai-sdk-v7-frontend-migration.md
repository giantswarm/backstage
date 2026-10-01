---
'@giantswarm/backstage-plugin-ai-chat': minor
---

Move the AI chat frontend to `ai@7` and the assistant-ui 0.15 line, so the
whole AI chat stack is on one generation of the Vercel AI SDK.

- Bump `ai` → `^7.0.101`, `@assistant-ui/react` → `^0.15.22`,
  `@assistant-ui/react-ai-sdk` → `^1.4.13`, `@assistant-ui/react-markdown` →
  `^0.14.17`, `@assistant-ui/react-devtools` → `^1.2.21`, and
  `@assistant-ui/tap` → `^0.9.19`.
- Drop the root `resolutions` that held the frontend on the `ai@6` line
  (`@assistant-ui/tap`, `@assistant-ui/core`, `assistant-stream`, the scoped
  `.../ai-chat-backend/ai` override, and the `@ai-sdk/provider-utils@4.0.41`
  pin) and the `.yarnrc.yml` `zustand` package extension for
  `@assistant-ui/core`, which `@assistant-ui/core@0.3` no longer needs.
- The `@assistant-ui/tap` "Maximum update depth exceeded" freeze that kept tap
  pinned to 0.9.12 does not occur on the 0.15 line
  (assistant-ui/assistant-ui#6133).
- Lift the Renovate holds on `ai`/`@ai-sdk/*` majors and on the assistant-ui
  packages; both families stay grouped into one PR each.
