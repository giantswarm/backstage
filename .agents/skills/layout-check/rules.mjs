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
      message: `the page is ${layout.scrollWidth}px wide in a ${layout.viewport.w}px viewport and scrolls sideways`,
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
      if (a.layer !== b.layer || a.id === b.id) continue;
      if (a.ancestors.includes(b.id) || b.ancestors.includes(a.id)) continue;
      // Placed over its neighbours on purpose: a badge, an icon in a field.
      if (a.placed !== b.placed) continue;
      // Two lines of the same element's text, or text beside text in one
      // element: the browser lays them out, they do not collide.
      if (a.kind === 'text' && b.kind === 'text' && a.id === b.id) continue;
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
  for (const flex of layout.flexRows) {
    const groups = flex.children
      .filter(c => c.controls.length > 0)
      .map(c => ({ child: c, rows: rowsOf(c.controls.map(x => x.box)) }))
      .filter(({ child, rows }) => {
        const span = bottom(rows[rows.length - 1]) - rows[0].y;
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
          // Each pair is seen from both sides: report it once.
          if (i > j && x.rows.length === 1) continue;
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
 * Text cut off where a person cannot read the rest: clipped without an
 * ellipsis, or squeezed to a few letters.
 */
export function truncationRule(layout) {
  const findings = [];
  for (const t of layout.truncated) {
    // Two letters or less: narrower than two em.
    const squeezed =
      t.axis === 'x' && t.shown < 2 * (t.fontSize ?? 14) && t.shown < 0.5 * t.needed;
    if (!t.ellipsis) {
      findings.push({
        rule: 'truncation',
        message: `"${t.text}" is cut off without an ellipsis (${t.shown} of ${t.needed}px)`,
        elements: [element(t, t.box)],
      });
    } else if (squeezed) {
      findings.push({
        rule: 'truncation',
        message: `"${t.text}" is squeezed to ${t.shown} of the ${t.needed}px it needs`,
        elements: [element(t, t.box)],
      });
    }
  }
  return findings;
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
};

/** Every rule on one measurement; `shift` needs two and runs separately. */
export function checkLayout(layout, rules = Object.keys(RULES)) {
  return rules.flatMap(name => RULES[name]?.(layout) ?? []);
}

/** One finding as a line or two of the report. */
export function formatFinding(f) {
  const where = `${f.page} @ ${f.width}px, scenario ${f.scenario}, state "${f.state}"`;
  const els = f.elements
    .map(e => `    ${e.role} "${e.name}" (${e.path})${e.box ? ` at ${fmtBox(e.box)}` : ''}`)
    .join('\n');
  return `${f.rule}: ${where}\n  ${f.elements[0] ? `${f.elements[0].role} "${f.elements[0].name}" ` : ''}${f.message}${els ? `\n${els}` : ''}`;
}

export const fmtBox = b =>
  `x=${Math.round(b.x)} y=${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}`;
