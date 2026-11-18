/*
 * The layout rules: pure functions over what `collect.mjs` measured in the
 * page. No dependencies, so `rules.test.mjs` runs with `node --test`.
 *
 * Each rule returns findings `{ rule, message, elements }`, where `elements`
 * are the one or two elements involved, each `{ role, name, path, box }`.
 */

/** Pixels below which a difference is rounding, not layout. */
export const TOLERANCE = 2;

/**
 * The least overlap, in both directions, that counts as a collision: a
 * control's box often reaches a pixel or two past what it draws (a touch
 * target, a focus ring's room).
 */
export const OVERLAP_MIN = 4;

const right = b => b.x + b.w;
const bottom = b => b.y + b.h;
const centerX = b => b.x + b.w / 2;
const centerY = b => b.y + b.h / 2;

function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(right(a), right(b));
  const btm = Math.min(bottom(a), bottom(b));
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : undefined;
}

const contains = (outer, inner) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  right(inner) <= right(outer) + 0.5 &&
  bottom(inner) <= bottom(outer) + 0.5;

const verticalOverlap = (a, b) =>
  Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);

const element = ({ role, name, path }, box) => ({ role, name, path, box });

/** The page scrolls sideways, or a control or icon sticks out of the viewport. */
export function overflowRule(layout) {
  const findings = [];
  if (layout.scrollWidth > layout.viewport.w + TOLERANCE) {
    findings.push({
      rule: 'overflow',
      message: layout.clipsX
        ? `the page's content is ${layout.scrollWidth}px wide in a ${layout.viewport.w}px viewport: the ${layout.scrollWidth - layout.viewport.w}px on the right are cut off`
        : `the page is ${layout.scrollWidth}px wide in a ${layout.viewport.w}px viewport and scrolls sideways`,
      elements: [],
    });
  }
  for (const el of layout.sticking) {
    findings.push({
      rule: 'overflow',
      message: `sticks out of the ${layout.viewport.w}px viewport`,
      elements: [element(el, el.box)],
    });
  }
  return findings;
}

/**
 * Two items of one layer overlap: controls, icons and lines of text, where
 * neither is inside the other. An overlay (a dialog, a popover, a sticky or
 * fixed bar) is a layer of its own, which may cover the page.
 */
export function overlapRule(layout) {
  const findings = [];
  const items = layout.items;
  const seen = new Set();
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      // One element's own lines of text are laid out by the browser.
      if (a.layer !== b.layer || a.id === b.id) continue;
      if (a.ancestors.includes(b.id) || b.ancestors.includes(a.id)) continue;
      // Placed over its neighbours on purpose: a badge, an icon in a field.
      if (a.placed !== b.placed) continue;
      for (const ra of a.rects) {
        let hit;
        for (const rb of b.rects) {
          const overlap = intersect(ra, rb);
          if (!overlap || overlap.w < OVERLAP_MIN || overlap.h < OVERLAP_MIN) continue;
          // One box inside the other is a design (an icon in a field, a
          // badge on its control), not a collision.
          if (contains(ra, rb) || contains(rb, ra)) continue;
          // Lines of text whose boxes touch by their leading.
          if (
            a.kind === 'text' &&
            b.kind === 'text' &&
            overlap.h < 0.3 * Math.min(ra.h, rb.h)
          ) {
            continue;
          }
          hit = { ra, rb, overlap };
          break;
        }
        if (hit) {
          const key = `${a.id}:${b.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            findings.push({
              rule: 'overlap',
              message: `${a.kind} and ${b.kind} overlap by ${Math.round(hit.overlap.w)}×${Math.round(hit.overlap.h)}px`,
              elements: [element(a, hit.ra), element(b, hit.rb)],
            });
          }
          break;
        }
      }
    }
  }
  return findings;
}

/** Groups boxes into rows: boxes that overlap vertically share a row. */
export function rowsOf(boxes) {
  const rows = [];
  for (const b of [...boxes].sort((p, q) => p.y - q.y)) {
    const row = rows.find(r => verticalOverlap(r, b) > TOLERANCE);
    if (row) {
      const y = Math.min(row.y, b.y);
      row.h = Math.max(bottom(row), bottom(b)) - y;
      row.y = y;
      row.x = Math.min(row.x, b.x);
      row.w = Math.max(right(row), right(b)) - row.x;
      row.members.push(b);
    } else {
      rows.push({ ...b, members: [b] });
    }
  }
  return rows;
}

/**
 * Side by side in a flex row, a control sits between the rows of controls
 * beside it, or is aligned with none of its row's tops, centres and bottoms.
 * Only children that are rows of controls count (their box no taller than
 * their controls' rows): a card's buttons follow the card's text.
 */
export function alignmentRule(layout) {
  const findings = [];
  const pairs = new Set();
  for (const flex of layout.flexRows) {
    const groups = flex.children
      .filter(c => c.controls.length > 0)
      .map(c => ({ child: c, rows: rowsOf(c.controls.map(x => x.box)) }))
      .filter(({ child, rows }) => {
        const span = Math.max(...rows.map(bottom)) - rows[0].y;
        return child.box.h <= span + 12;
      });
    for (let i = 0; i < groups.length; i++) {
      for (let j = 0; j < groups.length; j++) {
        if (i === j) continue;
        const x = groups[i];
        const y = groups[j];
        // Beside each other, on one line of the flex container.
        if (verticalOverlap(x.child.box, y.child.box) <= 0) continue;
        if (intersect(x.child.box, y.child.box)) continue;
        if (x.rows.length < 2 && y.rows.length !== 1) continue;
        for (const control of y.child.controls) {
          const b = control.box;
          // Rows of controls like this one: a button beside a title and its
          // links is centred on the block, not on a row of it.
          const like = rowsOf(
            x.child.controls
              .map(c => c.box)
              .filter(c => c.h >= 0.75 * b.h && c.h <= b.h / 0.75),
          );
          const touched = like.filter(r => verticalOverlap(r, b) > TOLERANCE);
          if (touched.length >= 2) {
            findings.push({
              rule: 'alignment',
              message: `sits between two rows of the controls beside it (rows at y=${Math.round(touched[0].y)} and y=${Math.round(touched[1].y)})`,
              elements: [
                element(control, b),
                element(x.child, x.child.box),
              ],
            });
            continue;
          }
          if (touched.length !== 1 || y.rows.length !== 1) continue;
          const row = touched[0];
          // Two single controls are seen from both sides: report them once.
          const pair = [JSON.stringify(b), JSON.stringify({ x: row.x, y: row.y, w: row.w, h: row.h })]
            .sort()
            .join('|');
          if (pairs.has(pair)) continue;
          pairs.add(pair);
          const off = Math.min(
            Math.abs(row.y - b.y),
            Math.abs(centerY(row) - centerY(b)),
            Math.abs(bottom(row) - bottom(b)),
          );
          if (off > TOLERANCE) {
            findings.push({
              rule: 'alignment',
              message: `is ${Math.round(off)}px off the row beside it: neither its top, its centre nor its bottom lines up`,
              elements: [element(control, b), element(x.child, row)],
            });
          }
        }
      }
    }
  }
  return dedupe(findings);
}

/**
 * Text cut off where a person cannot read the rest: cut off without an
 * ellipsis, or squeezed to a letter or two (with a tooltip or not: a person
 * cannot tell what it is without pointing at it). Cut off with an ellipsis
 * but with no title or tooltip holding the full text is a warning
 * (`severity: 'warning'`), which does not fail the check.
 */
export function truncationRule(layout) {
  const findings = [];
  for (const t of layout.truncated) {
    const across = t.axis === 'x';
    const unit = across ? 'px wide' : 'px high';
    // Two letters or less: narrower than two em.
    const squeezed =
      across && t.shown < 2 * (t.fontSize ?? 14) && t.shown < 0.5 * t.needed;
    let message;
    let severity;
    if (squeezed) {
      message = `"${t.text}" is squeezed to ${t.shown} of the ${t.needed}px it needs`;
    } else if (!t.ellipsis) {
      message = `"${t.text}" is cut off without an ellipsis (${t.shown} of ${t.needed}${unit} shown)`;
    } else if (!t.fullText) {
      message = `"${t.text}" ends in an ellipsis with no title or tooltip holding the rest (${t.shown} of ${t.needed}${unit} shown)`;
      severity = 'warning';
    }
    if (message) {
      findings.push({
        rule: 'truncation',
        message,
        elements: [element(t, t.box)],
        ...(severity && { severity }),
      });
    }
  }
  return findings;
}

// The patterns of a short value, each matching one part of it.
const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const WEEKDAY =
  '(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs?(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\\.?';
const TIME = '\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s?[ap]\\.?m\\.?)?(?:\\s(?:utc|gmt))?';
const DAY = '\\d{1,2}(?:st|nd|rd|th)?';
const DATE = [
  '\\d{4}-\\d{2}-\\d{2}(?:[t ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:z|[+-]\\d{2}:?\\d{2})?)?',
  '\\d{1,2}[./]\\d{1,2}[./]\\d{2,4}',
  `(?:${WEEKDAY}\\s)?(?:${MONTH}\\s${DAY}|${DAY}\\s${MONTH})(?:\\s\\d{4})?`,
  'today|yesterday|tomorrow|just now|now|never',
  WEEKDAY,
].join('|');
const DATETIME = `(?:(?:${DATE})(?:\\s(?:at\\s)?${TIME})?|${TIME})`;
const VERSION = 'v?\\d+(?:\\.\\d+)+(?:[-+][0-9a-z.-]+)?';
// A number with up to two words of unit after it: `144 vCPUs`, `$0.98/h now`,
// `3 hours ago`, `42 %`, `1h 23m` (two of them).
const NUMBER = "[~≈<>≤≥±+\\-−]?[$€£]?\\d+(?:[.,'\\u00a0\\u202f]\\d+)*";
const UNIT = '(?:%|‰|°[cf]?|/\\p{L}{1,8}|[\\p{L}µ]{1,12}(?:/\\p{L}{1,8})?)';
const QUANTITY = `${NUMBER}(?:\\s?${UNIT})?(?:\\s${UNIT})?`;
const QUALIFIER = '(?:(?:about|almost|over|under|nearly|less than|more than|up to|in|~)\\s)?';
const SHORT_PART = new RegExp(
  `^${QUALIFIER}(?:${DATETIME}|${VERSION}|${QUANTITY}(?:\\s${QUANTITY})*)$`,
  'iu',
);
/** What joins the parts of a combined value: `·`, `|`, a dash, `, `, ` / `. */
const PART_SEPARATOR = /\s*(?:·|•|\||–|—)\s*|,\s+|\s+\/\s+/;

/**
 * Whether a table cell's text is a short value by its shape, which must fit
 * its column without wrapping or an ellipsis: a date or a time, a duration
 * or an age, a number with or without a unit, a version, or a combination of
 * those joined by `·`, `,` or `/` (`144 vCPUs · 1152 GiB`, `Nov 12, 2026,
 * 14:03`, `about 2 months ago`, `0.4.1, 0.3.0`). Everything else is free
 * text (names, descriptions, IDs, URLs, paths), which may end in an
 * ellipsis. A status label is short whatever its text, by where it sits: the
 * collector marks it `status`.
 */
export function isShortValue(text) {
  const t = (text ?? '').trim();
  if (!t || t.length > 40) return false;
  const parts = t.split(PART_SEPARATOR).filter(Boolean);
  return parts.length > 0 && parts.every(p => SHORT_PART.test(p));
}

/**
 * In a table, typical content fits its column, and the rule owns all text in
 * tables (the `truncation` rule leaves it out). Failing: a column header cut
 * off (with an ellipsis or not, with a tooltip or not) or wrapped onto a
 * second line; a short value (a status label, or `isShortValue`) cut off or
 * wrapped. Free text is held to what `truncation` holds text to: cut off
 * without an ellipsis or squeezed to a letter or two fails; an ellipsis with
 * no title or tooltip holding the rest is a warning. One finding per table,
 * column and kind, with the number of other rows it holds for.
 */
export function tableFitRule(layout) {
  const squeezed = squeezedColumns(layout);
  const groups = new Map();
  for (const c of layout.cells ?? []) {
    const short = c.header || c.status || isShortValue(c.text);
    let kind;
    if (c.kind === 'unit') {
      if (short && c.lines > 1) kind = c.header ? 'header-wrap' : 'wrap';
    } else if (c.header) {
      if (c.cut) kind = 'header-cut';
      else if (c.lines > 1) kind = 'header-wrap';
    } else if (short) {
      if (c.cut) kind = 'cut';
      else if (c.lines > 1) kind = 'wrap';
    } else if (c.cut) {
      const squeezed =
        c.axis === 'x' && c.shown < 2 * (c.fontSize ?? 14) && c.shown < 0.5 * c.needed;
      if (squeezed) kind = 'squeezed';
      else if (!c.ellipsis) kind = 'clipped';
      else if (!c.fullText) kind = 'no-hover';
    }
    if (!kind) continue;
    // A column squeezed beside columns with room to spare is reported as that.
    if (kind === 'squeezed' && squeezed.has(`${c.table}|${c.col}`)) continue;
    const key = `${c.table}|${c.col}|${kind}`;
    const group = groups.get(key);
    if (group) group.rows.add(c.row);
    else groups.set(key, { kind, cell: c, rows: new Set([c.row]) });
  }
  const columnFindings = [...squeezed.values()].map(({ cell: c, rows, spare }) => {
    const others = rows.size - 1;
    const more = others > 0 ? `, and in ${others} more row${others > 1 ? 's' : ''}` : '';
    const room = spare
      .map(s => `${s.column ? `"${s.column}"` : `column ${s.col + 1}`} (${Math.round(s.spare)}px)`)
      .join(', ');
    return {
      rule: 'table-fit',
      message: `column "${c.column ?? c.col + 1}" is squeezed until its text cannot be read ("${c.text}" shows ${Math.round(c.shown)} of ${Math.round(c.needed)}px${more}) while ${spare.length > 1 ? 'columns' : 'column'} ${room} ${spare.length > 1 ? 'keep' : 'keeps'} room to spare`,
      elements: [element(c, c.box)],
    };
  });
  return [...columnFindings, ...[...groups.values()].map(({ kind, cell: c, rows }) => {
    const column = c.column ? ` in column "${c.column}"` : '';
    const unit = c.axis === 'y' ? 'px high' : 'px';
    const shown = `${Math.round(c.shown)} of ${Math.round(c.needed)}${unit} shown`;
    const others = rows.size - 1;
    const more = others > 0 ? `, and in ${others} more row${others > 1 ? 's' : ''}` : '';
    const ellipsis = c.ellipsis ? ' with an ellipsis' : '';
    const message = {
      'header-cut': `column header "${c.text}" is cut off${ellipsis} (${shown}): a header always fits its column`,
      'header-wrap': `column header "${c.text}" wraps onto ${c.lines} lines: a header fits its column on one line`,
      cut: `short value "${c.text}"${column} is cut off${ellipsis} (${shown})${more}: a short value fits its column`,
      wrap: `short value "${c.text}"${column} wraps onto ${c.lines} lines${more}: a short value fits its column on one line`,
      squeezed: `"${c.text}"${column} is squeezed to ${shown}${more}`,
      clipped: `"${c.text}"${column} is cut off without an ellipsis (${shown})${more}`,
      'no-hover': `"${c.text}"${column} ends in an ellipsis with no title or tooltip holding the rest (${shown})${more}`,
    }[kind];
    return {
      rule: 'table-fit',
      message,
      elements: [element(c, c.box)],
      ...(kind === 'no-hover' && { severity: 'warning' }),
    };
  })];
}

/** Room a column keeps to spare that counts, per column and in all. */
export const SPARE_MIN = 16;
export const SPARE_TOTAL_MIN = 56;

/**
 * Columns squeezed until their text cannot be read while other columns of
 * the table keep room to spare: in half or more of its rows, a column's text
 * is cut to less than six em and less than half of it, and the other
 * columns keep at least `SPARE_TOTAL_MIN` px they leave empty in every row
 * (`SPARE_MIN` or more each). The space a column keeps is what its widest
 * content, header included, leaves of the cell. Keyed `table|col`, each
 * with a cut cell, its rows and the columns with room to spare.
 */
export function squeezedColumns(layout) {
  const result = new Map();
  const bodyRows = new Map();
  const spareOf = new Map();
  for (const s of layout.space ?? []) {
    const key = `${s.table}|${s.col}`;
    if (!s.header) {
      if (!bodyRows.has(key)) bodyRows.set(key, new Set());
      bodyRows.get(key).add(s.row);
    }
    const spare = Math.max(0, s.inner - s.used);
    const known = spareOf.get(key);
    if (!known || spare < known.spare) {
      spareOf.set(key, { table: s.table, col: s.col, column: s.column, spare });
    }
  }
  const tight = new Map();
  for (const c of layout.cells ?? []) {
    if (c.kind !== 'leaf' || c.header || !c.cut || c.axis !== 'x') continue;
    const em = c.fontSize ?? 14;
    if (!(c.shown < 6 * em && c.shown < 0.5 * c.needed)) continue;
    const key = `${c.table}|${c.col}`;
    const entry = tight.get(key);
    if (entry) entry.rows.add(c.row);
    else tight.set(key, { cell: c, rows: new Set([c.row]) });
  }
  for (const [key, { cell, rows }] of tight) {
    const total = bodyRows.get(key)?.size ?? rows.size;
    if (rows.size < total / 2) continue;
    const spare = [...spareOf.values()]
      .filter(s => s.table === cell.table && s.col !== cell.col && s.spare >= SPARE_MIN)
      .sort((a, b) => b.spare - a.spare);
    if (spare.reduce((sum, s) => sum + s.spare, 0) < SPARE_TOTAL_MIN) continue;
    result.set(key, { cell, rows, spare });
  }
  return result;
}

/**
 * A table wider than the box that holds it, at a width where the page itself
 * does not scroll sideways (the `overflow` rule's): it scrolls sideways
 * inside its card, or is cut off. Typical content fits a table without
 * scrolling (the `tables` skill). A table that scrolls sideways by design
 * says so with `data-layout-check="scroll-x"`.
 */
export function tableScrollRule(layout) {
  if (layout.scrollWidth > layout.viewport.w + TOLERANCE) return [];
  return (layout.tableScrolls ?? [])
    .filter(t => !t.allowed && t.content - t.client > TOLERANCE)
    .map(t => {
      const hidden = t.content - t.client;
      const columns = t.columns?.length
        ? ` (columns ${t.columns.map(c => `"${c}"`).join(', ')})`
        : '';
      return {
        rule: 'table-scroll',
        message: t.cut
          ? `${columns ? `${columns.slice(1)} ` : ''}is ${t.content}px wide in a ${t.client}px box that cuts off the ${hidden}px on the right`
          : `${columns ? `${columns.slice(1)} ` : ''}scrolls sideways: ${t.content}px of table in a ${t.client}px box, ${hidden}px out of view`,
        elements: [element(t, t.box), element(t.container, t.container.box)],
      };
    });
}

/** A control cut off by an ancestor that hides its overflow. */
export function clippedRule(layout) {
  return layout.items
    .filter(i => i.kind === 'control' && i.clippedBy)
    .map(i => ({
      rule: 'truncation',
      message: `is cut off by ${i.clippedBy.path}: ${Math.round(i.rects[0].w)}×${Math.round(i.rects[0].h)} of ${Math.round(i.box.w)}×${Math.round(i.box.h)}px shown`,
      elements: [element(i, i.box), element(i.clippedBy, undefined)],
    }));
}

/**
 * The text and icons of a button-like control are off its centre: vertically
 * always, horizontally where the control centres its content. Padding is
 * accounted for.
 */
export function centeringRule(layout) {
  const findings = [];
  for (const c of layout.centering) {
    const { box, content, padding } = c;
    if (content.h > box.h - padding.top - padding.bottom + TOLERANCE) continue;
    const innerCenterY = box.y + padding.top + (box.h - padding.top - padding.bottom) / 2;
    const dy = centerY(content) - innerCenterY;
    if (Math.abs(dy) > TOLERANCE) {
      findings.push({
        rule: 'centering',
        message: `its content sits ${Math.abs(Math.round(dy * 10) / 10)}px ${dy < 0 ? 'above' : 'below'} its centre`,
        elements: [element(c, box), { role: 'content', name: c.name, path: '', box: content }],
      });
      continue;
    }
    const flow = c.flow ?? content;
    if (c.centeredX && flow.w < box.w - padding.left - padding.right) {
      const innerCenterX = box.x + padding.left + (box.w - padding.left - padding.right) / 2;
      const dx = centerX(flow) - innerCenterX;
      if (Math.abs(dx) > TOLERANCE) {
        findings.push({
          rule: 'centering',
          message: `its content sits ${Math.abs(Math.round(dx * 10) / 10)}px ${dx < 0 ? 'left' : 'right'} of its centre`,
          elements: [element(c, box), { role: 'content', name: c.name, path: '', box: content }],
        });
      }
    }
  }
  return findings;
}

/**
 * Controls that move or change size from one state to the next. Rows of
 * lists and tables are left out (they reorder by design), and so are
 * overlays. `pos` is relative to the scroll container's content, so a
 * scroll is not a move.
 */
export function shiftRule(before, after) {
  const findings = [];
  const earlier = new Map(
    before.items
      .filter(i => i.kind === 'control' && !i.inList && i.layer === 0)
      .map(i => [i.key, i]),
  );
  for (const now of after.items) {
    if (now.kind !== 'control' || now.inList || now.layer !== 0) continue;
    const then = earlier.get(now.key);
    if (!then) continue;
    const a = then.pos;
    const b = now.pos;
    // Only across: content above that grows or shrinks (a list re-sorted, a
    // section loaded) moves what is below it down or up, by design.
    const moved = Math.abs(a.x - b.x) > TOLERANCE;
    const resized = Math.abs(a.w - b.w) > TOLERANCE || Math.abs(a.h - b.h) > TOLERANCE;
    if (!moved && !resized) continue;
    const what = [
      moved ? `moves by ${Math.round(b.x - a.x)},${Math.round(b.y - a.y)}px` : undefined,
      resized ? `changes size from ${Math.round(a.w)}×${Math.round(a.h)} to ${Math.round(b.w)}×${Math.round(b.h)}px` : undefined,
    ]
      .filter(Boolean)
      .join(' and ');
    findings.push({
      rule: 'shift',
      message: what,
      elements: [element(then, then.box), element(now, now.box)],
    });
  }
  return findings;
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter(f => {
    const key = `${f.rule}|${f.elements.map(e => `${e.path}|${e.name}|${JSON.stringify(e.box)}`).join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const RULES = {
  overflow: overflowRule,
  overlap: overlapRule,
  alignment: alignmentRule,
  truncation: layout => [...truncationRule(layout), ...clippedRule(layout)],
  centering: centeringRule,
  'table-fit': tableFitRule,
  'table-scroll': tableScrollRule,
};

/** Every rule on one measurement; `shift` needs two and runs separately. */
export function checkLayout(layout, rules = Object.keys(RULES)) {
  return rules.flatMap(name => RULES[name]?.(layout) ?? []);
}

/** One finding as a line or two of the report. */
export const isWarning = f => f.severity === 'warning';

/**
 * Warnings counted by scenario, in the order the scenarios first appear:
 * `[[scenario, count], …]`.
 */
export function warningCounts(warnings) {
  const counts = new Map();
  for (const w of warnings) counts.set(w.scenario, (counts.get(w.scenario) ?? 0) + 1);
  return [...counts];
}

export function formatFinding(f) {
  const where = `${f.page} @ ${f.width}px, scenario ${f.scenario}, state "${f.state}"`;
  const els = f.elements
    .map(e => `    ${e.role} "${e.name}" (${e.path})${e.box ? ` at ${fmtBox(e.box)}` : ''}`)
    .join('\n');
  return `${f.rule}${isWarning(f) ? ' (warning)' : ''}: ${where}\n  ${f.elements[0] ? `${f.elements[0].role} "${f.elements[0].name}" ` : ''}${f.message}${els ? `\n${els}` : ''}`;
}

export const fmtBox = b =>
  `x=${Math.round(b.x)} y=${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}`;

/**
 * Why a path is a route template rather than a page (`/sessions/:installation/:id`,
 * `/*`), or null. A template loads the portal's not-found page.
 */
export function routeTemplateOf(pagePath) {
  const segment = pagePath
    .split(/[?#]/)[0]
    .split('/')
    .find(s => s.startsWith(':') || s.includes('*'));
  return segment
    ? `${pagePath} is a route template (${segment}), not a page: pass a path to a real record, or a spec that opens one`
    : null;
}

/**
 * Why the loaded page is a not-found page instead of the page asked for, or
 * null: the portal's 404 page, or a page's own "… not found" heading (a
 * record the path names does not exist). `page` is `{ errorPage, headings }`
 * as `collectPageKind` reads it.
 */
export function notFoundOf({ errorPage, headings }) {
  if (errorPage && /\b404\b|not found/i.test(errorPage)) {
    return 'the portal\'s "page not found" page';
  }
  const heading = headings.find(h => h.length <= 80 && /\bnot found\.?$/i.test(h));
  return heading ? `the heading "${heading}"` : null;
}

/**
 * Why the loaded page is the app's error panel instead of the page, or null:
 * an extension that threw shows an alert titled "Error in <plugin>" (its
 * title line reads "Error: Error in app"), the error's message under
 * "Message", and a crashed page has no layout to check. `page` is
 * `{ alerts }` as `collectPageKind` reads it: the text of each alert.
 */
export function crashOf({ alerts }) {
  for (const text of alerts ?? []) {
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const title = lines
      .map(l => /^(?:Error:\s*)?(Error in \S+)$/.exec(l)?.[1])
      .find(Boolean);
    if (!title) continue;
    const at = lines.indexOf('Message');
    const message = at >= 0 ? (lines[at + 1] ?? '').slice(0, 160) : '';
    return `the error panel "${title}"${message ? `: ${message}` : ''}`;
  }
  return null;
}

/** Runs in the page: what `notFoundOf` and `crashOf` read. */
export function collectPageKind() {
  const error = document.querySelector('[data-testid="error"]');
  return {
    alerts: [...document.querySelectorAll('[role="alert"]')].map(a =>
      (a.innerText || '').slice(0, 2000),
    ),
    errorPage: error ? error.textContent.trim().slice(0, 200) : null,
    headings: [...document.querySelectorAll('h1, h2, [role="heading"][aria-level="1"], [role="heading"][aria-level="2"]')]
      .map(h => h.textContent.trim())
      .filter(Boolean),
  };
}
