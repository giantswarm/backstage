---
'@giantswarm/backstage-plugin-scaffolder-backend-module-gs': minor
'@giantswarm/backstage-plugin-gs-node': minor
---

New scaffolder action `gs:oci:tagExists`: checks whether a tag exists in an OCI registry repository and outputs `exists`, so a template can branch on whether a chart version is published. A registry 404 means `false` (gsoci also returns it for a missing repository); any other registry error fails the step. It supports dry runs. `ContainerRegistryService` and `OciRegistryClient` gain the `tagExists` method it uses.
