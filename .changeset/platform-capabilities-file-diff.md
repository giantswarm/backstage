---
'@giantswarm/backstage-plugin-platform-capabilities': minor
---

The Capabilities tab shows one annotated diff per file.

- The comparison asks the manager for the files' content and shows every
  file that differs as one group headed by its path (`<repository>:<path>`,
  once), opening to the unified diff of the file on record against the file
  the definition renders, with each difference annotated on its line: the
  reason sentence of a planned change, `differs by input: <input>`, or the
  drift mark, in the mark's colour. Unchanged stretches fold behind an
  expander. A group is open when a difference is to apply and closed while
  every change in it is planned.
- A file whose content the answer does not carry, and a difference the
  diff cannot place, keep the one-line list, without the file name in the
  line.
- The features with differences stay as the summary lines; a dimension's
  own facts (a reason, a probe's requests, an object) keep their lines.
- The types follow the manager: `current` on a plan's file, `line` and
  `currentLine` on a difference.
