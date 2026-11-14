# Date formatting comparison

The screenshots render the actual `DateComponent` Local story in Chromium,
using `en-US`, `Europe/Paris`, an 800 × 260 viewport and the timestamp
`2026-10-25T01:30:12Z` (after the autumn DST transition).

- `before.png`: the main-branch date component and formatter, temporarily
  replayed in the same story and restored after capture.
- `after.png`: the updated component, including the exact-time control.

These are component previews. They do not establish agentlab deployment or
page-level visual validation.

Run the browser interaction checks against a running Storybook:

```bash
node .yarn/releases/yarn-4.18.1.cjs storybook --ci --port 6007
node .yarn/releases/yarn-4.18.1.cjs playwright test --config .storybook/playwright.config.ts
```
