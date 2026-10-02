---
'@giantswarm/backstage-plugin-ui-react': minor
---

`ConditionsList`: new optional `order` prop. Given a list of condition types in the order the controller evaluates them, the list follows that order instead of the transition time, so the first failing condition, which starts expanded, is the root cause rather than a later stage it blocks.
