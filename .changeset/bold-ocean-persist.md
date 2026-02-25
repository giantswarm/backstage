---
'app': minor
---

Migrate icons, sign-in page, and feature flags from legacy `convertLegacyAppOptions` to NFS extensions. Icons use `IconBundleBlueprint`, sign-in page uses `SignInPageBlueprint`, and feature flags use `createFrontendModule({ featureFlags })`. The `convertLegacyAppOptions` compat bridge is now fully removed.
