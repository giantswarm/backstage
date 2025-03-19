# Testing notifications

First export a token to use in development.

```shell
export STATIC_API_TOKEN="MY_TOKEN_CONTENT"
```

Set up a static auth token in the `app-config.local.yaml` file:

```yaml
backend:
  # ...
  auth:
    externalAccess:
      - type: static
        options:
          token: ${STATIC_API_TOKEN}
          subject: notifications-test
```

Execute curl commands like these to create broadcast notifications:

```nohighlight
curl -k -X POST https://localhost:7007/api/notifications \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${STATIC_API_TOKEN}" \
    -d '{"recipients": {"type":"broadcast"}, "payload": {"title": "Critical severity notification with link", "link": "https://example.com/", "severity": "critical", "topic": "release"}}'

curl -k -X POST https://localhost:7007/api/notifications \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${STATIC_API_TOKEN}" \
    -d '{"recipients": {"type":"broadcast"}, "payload": {"title": "High severity notification with link", "link": "https://example.com/", "severity": "high", "topic": "release"}}'

curl -k -X POST https://localhost:7007/api/notifications \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${STATIC_API_TOKEN}" \
    -d '{"recipients": {"type":"broadcast"}, "payload": {"title": "Normal severity notification", "severity": "normal", "topic": "release"}}'

curl -k -X POST https://localhost:7007/api/notifications \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${STATIC_API_TOKEN}" \
    -d '{"recipients": {"type":"broadcast"}, "payload": {"title": "Low severity notification", "severity": "low", "topic": "release"}}'

```
