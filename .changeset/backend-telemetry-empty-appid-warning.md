---
'backend': patch
---

Log one warning at startup when telemetry is enabled (`app.telemetrydeck` set) but `app.telemetrydeck.appID` is empty: such a portal sends no usage data at all, not even page views. A portal with its own app ID, or with `app.telemetrydeck: null`, logs nothing new.
