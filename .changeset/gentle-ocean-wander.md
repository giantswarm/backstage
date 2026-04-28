---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

Persist conversations to the database. Adds Knex migrations for the conversations table and a message preview column, a `ConversationStore` service, and conversation routes (CRUD + list).
