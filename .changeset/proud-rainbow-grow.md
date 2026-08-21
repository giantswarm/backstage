---
'backend': patch
---

Stop serving the frontend source maps. The backend image now deletes
`packages/app/dist/**/*.map` after unpacking the bundle, so `/static/*.js.map`
returns 404 instead of the un-minified app source and anything inlined into it
at build time. Backend source maps are untouched.
