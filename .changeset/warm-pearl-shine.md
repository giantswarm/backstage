---
'@giantswarm/backstage-plugin-gs': minor
---

Add GSSecretYamlValuesEditor scaffolder field extension that routes secret values through the template secrets context instead of regular parameters, preventing them from being persisted in the scaffolder task database. Also fix potential secret content leak in YAML validation console logging.
