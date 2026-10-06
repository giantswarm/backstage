---
'app': patch
---

TelemetryDeck: an empty `app.telemetrydeck.appID` no longer breaks the frontend's initialisation silently. The app skips TelemetryDeck with one console warning and sends nothing; an initialisation failure (a missing salt, for one) is logged to the console once instead of dropping every signal without a word.
