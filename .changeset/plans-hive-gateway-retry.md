---
'@giantswarm/backstage-plugin-plans': patch
---

Hive tabs retry a request the gateway answered for a backend that did not
answer (a 502, 503 or 504 without the backend's error body, as while a pod
stops), name it in words instead of a bare status, and offer "Try again" on
every failed source. The backend's own 503 stays final.
