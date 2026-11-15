---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

`/profile`'s Environments section lists every environment as a toggle chip with its access health, with All on, All off and Undo, and Sign in again while a session has expired, sharing its state with the classic sidebar's Cluster access widget. gs exports `useClusterAccessStatus`, `useMutedInstallations`, `useSignInAgain` and the shared access state labels and tones (`CLUSTER_ACCESS_STATE_LABELS` and its neighbours), and `MutedInstallationsApi` gains `setMutedMany`; ui-react's `StatusDot` takes `ring`.
