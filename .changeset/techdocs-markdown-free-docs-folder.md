---
'@giantswarm/backstage-plugin-techdocs-backend-module-gs': patch
---

TechDocs builds no longer fail for a repository whose `docs` folder holds no
Markdown file.

The preparer moved every `docs` folder into a `docs-component` sub-directory for
mkdocs-monorepo-plugin, and wrote a fallback `mkdocs.yaml` without a `nav` key.
mkdocs-monorepo-plugin scaffolds that missing `nav` from the Markdown files in
the folder, so an asset-only folder produced an empty nav and the build aborted
with "does not contain a valid 'nav' key". A `docs` folder without Markdown
files now becomes `docs/docs` inside the generated docs root instead, which
keeps its assets reachable under the path that relative links from the
repository root use.
