---
'backend': patch
---

OTLP trace export: the knex instrumentation is off. It named its spans after the connection's database, which a `pg` connection in `pluginDivisionMode: schema` does not set, so spans read `raw undefined`, and a schema-builder query produced a span without a name. That span failed the exporter's serializer and dropped the whole batch as an unhandled rejection. The pg instrumentation traces the same queries under proper names.
