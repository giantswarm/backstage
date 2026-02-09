---
'@giantswarm/backstage-plugin-gs': patch
---

Fix AsyncValue component to properly handle falsy values

- Make `value` prop required instead of optional
- Use explicit loading/error state checks instead of truthiness check on value, so falsy values (empty string, `0`, `null`) render correctly
- Update consumers to handle nullable values with explicit `<NotAvailable />` fallbacks
