---
'app': patch
'backend': patch
'@giantswarm/backstage-plugin-gs-backend': patch
---

Decouple custom branding from the gs-backend plugin. Branding asset serving moves to a dedicated `branding` backend plugin colocated in `packages/backend/src/branding/`, registered unconditionally so it works in deployments without a `gs:` config block. The frontend hook now resolves assets via the `branding` discovery prefix at `/api/branding/*`.

**Breaking config change:** rename `gs.branding.assetsPath` to `app.branding.assetsPath` in `app-config.yaml`. The Helm chart's `branding.*` values are unchanged and emit the new key automatically.
