# Analytics React

The portal's tracked actions: the typed list of events (`portalEvents`) and
`useTrackedMutation`, the `useMutation` every write in a Giant Swarm plugin goes
through. A tracked write reports its event through Backstage's analytics API
once it succeeded; the app's analytics connector decides where it goes, and a
portal without one drops it.

```typescript
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

const deploy = useTrackedMutation({
  mutationFn: (spec: AgentSpec) => client.createAgent(spec),
  event: () => ({
    name: 'AgentPlatform.agentCreated',
    attributes: { mode: 'deploy' },
  }),
});

const rename = useTrackedMutation({
  mutationFn: (title: string) => client.renameSession(title),
  event: null,
  untrackedReason:
    'Housekeeping on a session; sessionStarted measures sessions.',
});
```

The collected events and how to add one: `docs/telemetry.md` in the repository.
