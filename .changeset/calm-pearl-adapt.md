---
'backend': patch
---

Fix TechDocs generation failure on Python 3.13 by adding setuptools dependency to the Docker image. The `distutils` module was removed from the Python standard library in 3.12, breaking `mkdocs-monorepo-plugin`.
