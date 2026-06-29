---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': patch
---

The SBOM dependency processor now only adds a `dependsOn` entry for components that actually exist in the catalog. Giant Swarm Go packages without a catalog component (e.g. archived libraries like `versionbundle`) are skipped, so they no longer appear as dangling relations ("Entities not found are: ...") on the entity page. If the catalog can't be queried, all dependencies are kept to avoid dropping real dependencies on a transient error.
