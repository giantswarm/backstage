#!/usr/bin/env node
// Lays out the Agent Platform sitemap for the Miro board: reads sitemap.tsv,
// sitemap.state.tsv and the screenshots, and prints a JSON plan with the
// position and size of every card, group box, label, image and line. The
// drawing rules are in SKILL.md; this file is their one implementation.
//
//   node .claude/skills/ui-sitemap/layout.mjs [--out plan.json]
//     [--svg board.svg] [--uploads uploads.tsv] [--update-all]
//     [--screens dir | --no-screens] [--board-sitemap file]
//     [--sitemap file] [--state file] [--origin x,y]
//   node .claude/skills/ui-sitemap/layout.mjs --write-state
//     --result result.svg[,more.svg] [--images images.tsv]
//     [--skipped skipped.tsv] [--commit sha] [--origin x,y] ...
//
// No dependencies, so it runs from the repo root without an install.

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const BOARD_URL = 'https://miro.com/app/board/uXjVEXNCTFU=/';

export const SITEMAP_COLUMNS = [
  'id',
  'parent',
  'kind',
  'name',
  'path',
  'reach',
  'note',
];
export const STATE_COLUMNS = [
  'id',
  'captured',
  'commit',
  'viewport',
  'card',
  'image',
  'label',
  'edge',
  'skipped',
];

export const KINDS = [
  'page',
  'tabs',
  'tab',
  'wizard',
  'step',
  'dialog',
  'state',
];

// The children each kind may have. `tab` and `step` live inside their group;
// `dialog` and `state` sit beside their owner; the rest start a new row.
const ALLOWED_CHILDREN = {
  page: ['page', 'tabs', 'wizard', 'dialog', 'state'],
  tabs: ['tab', 'dialog', 'state'],
  tab: ['page', 'tabs', 'wizard', 'dialog', 'state'],
  wizard: ['step', 'dialog', 'state'],
  step: ['dialog', 'state'],
  dialog: [],
  state: [],
};
const MEMBER_KIND = { tabs: 'tab', wizard: 'step' };
const SIDE_KINDS = new Set(['dialog', 'state']);

// Per level: the screenshot's placed width, the card padding, and the name
// and path font sizes. Deeper levels use the last entry.
const LEVELS = [
  { width: 1440, padding: 48, nameSize: 64, pathSize: 32 },
  { width: 960, padding: 32, nameSize: 44, pathSize: 22 },
  { width: 720, padding: 24, nameSize: 32, pathSize: 16 },
  { width: 540, padding: 18, nameSize: 24, pathSize: 12 },
];

export const STYLE = {
  cardFill: '#f0f5fd',
  stateFill: '#fff8e6',
  groupFill: '#f7f7f7',
  groupBorder: '#e7e7e7',
  groupBorderWidth: 2,
  nameColor: '#1a1a1a',
  pathColor: '#767676',
  lineColor: '#313131',
  lineWidth: 4,
  titleSize: 160,
  subtitleSize: 56,
  levelSize: 64,
  levelColor: '#767676',
  // Miro renders a text box about 1.43 times its font size high.
  lineHeight: 1.45,
  fontFamily: 'noto_sans',
};

const TITLE = 'Agent Platform map';
const SUBTITLE =
  'Every page, tab, wizard step and dialog of the Agent Platform UI, as a tree. Kept by the ui-sitemap skill in giantswarm/backstage.';

const ROW_GAP = 480;
const LEVEL_MARKER_WIDTH = 480;
const LEVEL_MARKER_GAP = 240;
// The screenshot a node without one is drawn as: a 1440×900 viewport.
const DEFAULT_ASPECT = 900 / 1440;
// A PNG counts as new only when written more than this after the state's
// `captured`, so a capture time written at second precision never makes an
// unchanged PNG look new.
const CAPTURE_TOLERANCE_MS = 1000;

export function levelSpec(level) {
  return LEVELS[Math.min(level, LEVELS.length - 1)];
}

const textHeight = size => Math.round(size * STYLE.lineHeight);

// ---------------------------------------------------------------- input ----

/** Parses a tab-separated file with one header row into objects. */
export function parseTsv(text, columns, file = 'TSV') {
  const lines = text.split('\n').map(line => line.replace(/\r$/, ''));
  const header = lines.shift()?.split('\t') ?? [];
  if (header.join('\t') !== columns.join('\t')) {
    throw new Error(
      `${file}: the header must be "${columns.join('\\t')}", not "${header.join('\\t')}"`,
    );
  }
  const rows = [];
  lines.forEach((line, index) => {
    if (line.trim() === '') {
      return;
    }
    const cells = line.split('\t');
    if (cells.length > columns.length) {
      throw new Error(
        `${file}:${index + 2}: ${cells.length} cells, the header has ${columns.length}`,
      );
    }
    // Trailing empty cells may be missing: editors and the trailing-whitespace
    // hook strip trailing tabs.
    rows.push(
      Object.fromEntries(columns.map((c, i) => [c, (cells[i] ?? '').trim()])),
    );
  });
  return rows;
}

/** Reads a PNG's pixel size from its IHDR chunk. */
export function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString('hex') !== signature ||
    buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new Error('not a PNG');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** `1440x2400x2` → `{ width: 1440, height: 2400, scale: 2 }`. */
export function parseViewport(viewport) {
  const match = /^(\d+)x(\d+)(?:x(\d+(?:\.\d+)?))?$/.exec(viewport ?? '');
  if (!match) {
    return undefined;
  }
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    scale: Number(match[3] ?? 1),
  };
}

/** Checks the sitemap's rows and returns them as a tree. */
export function buildTree(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(row.id)) {
      throw new Error(`"${row.id}": an id is lowercase kebab-case`);
    }
    if (byId.has(row.id)) {
      throw new Error(`"${row.id}": the id is used twice`);
    }
    if (!KINDS.includes(row.kind)) {
      throw new Error(`"${row.id}": unknown kind "${row.kind}"`);
    }
    if (row.name === '') {
      throw new Error(`"${row.id}": a node needs a name`);
    }
    for (const [column, value] of [
      ['name', row.name],
      ['path', row.path],
    ]) {
      if (/[<>]/.test(value)) {
        throw new Error(
          `"${row.id}": no < or > in the ${column} (Miro drops them); write a placeholder like :installation`,
        );
      }
    }
    byId.set(row.id, { ...row, children: [] });
  }
  let root;
  for (const node of byId.values()) {
    if (node.parent === '') {
      if (root) {
        throw new Error(`"${node.id}" and "${root.id}" both have no parent`);
      }
      root = node;
      continue;
    }
    const parent = byId.get(node.parent);
    if (!parent) {
      throw new Error(`"${node.id}": unknown parent "${node.parent}"`);
    }
    if (!ALLOWED_CHILDREN[parent.kind].includes(node.kind)) {
      throw new Error(
        `"${node.id}": a ${node.kind} cannot sit under a ${parent.kind} ("${parent.id}")`,
      );
    }
    parent.children.push(node);
  }
  if (!root) {
    throw new Error('the sitemap needs one root, a node without a parent');
  }
  if (root.kind !== 'page' && root.kind !== 'tabs') {
    throw new Error(`the root "${root.id}" must be a page or tabs`);
  }
  for (const node of byId.values()) {
    if (
      (node.kind === 'tab' || node.kind === 'step') &&
      !MEMBER_KIND[byId.get(node.parent)?.kind]
    ) {
      throw new Error(`"${node.id}": a ${node.kind} sits under its group`);
    }
    for (const [kind, member] of Object.entries(MEMBER_KIND)) {
      if (node.kind === kind && !node.children.some(c => c.kind === member)) {
        throw new Error(`"${node.id}": a ${kind} needs at least one ${member}`);
      }
    }
  }
  // Every node is reached from the root: a cycle would leave some unreached.
  const seen = new Set();
  const walk = node => {
    seen.add(node.id);
    node.children.forEach(walk);
  };
  walk(root);
  const unreached = [...byId.keys()].filter(id => !seen.has(id));
  if (unreached.length > 0) {
    throw new Error(`not reachable from the root: ${unreached.join(', ')}`);
  }
  return { root, byId };
}

// --------------------------------------------------------------- layout ----

/** Whether a PNG is newer than the capture the state records for it. */
export function isNewCapture(row, png) {
  const captured = Date.parse(row?.captured ?? '');
  return (
    !row?.image ||
    Number.isNaN(captured) ||
    (png.mtimeMs ?? 0) > captured + CAPTURE_TOLERANCE_MS
  );
}

/**
 * The plan: every item to draw, by a stable key, with its geometry. `x`/`y`
 * are the top-left corner (as in SVG); images also carry `cx`/`cy`, their
 * centre, which is what `image_create` takes. `origin` is the drawing's
 * top-left corner: the title's, and the level markers' left edge.
 */
export function layout({
  rows,
  state = [],
  screenSize = () => undefined,
  origin = { x: 0, y: 0 },
}) {
  const { root, byId } = buildTree(rows);
  const stateById = new Map(state.map(row => [row.id, row]));

  // The screenshot's aspect ratio (height / width) and where it came from. A
  // PNG counts only when it is newer than what the board shows: a node
  // without an image on the board, or a file written after the state's
  // `captured`. An older file left in `screens/` is what the board shows.
  const imageOf = node => {
    const png = screenSize(node.id);
    if (png && isNewCapture(stateById.get(node.id), png)) {
      return {
        aspect: png.height / png.width,
        source: 'png',
        width: png.width,
        height: png.height,
      };
    }
    const viewport = parseViewport(stateById.get(node.id)?.viewport);
    if (viewport) {
      return {
        aspect: viewport.height / viewport.width,
        source: 'state',
        width: Math.round(viewport.width * viewport.scale),
        height: Math.round(viewport.height * viewport.scale),
      };
    }
    return { aspect: DEFAULT_ASPECT, source: 'default' };
  };

  // A card: name, path and screenshot, at a level's sizes.
  const measureCard = (node, level) => {
    const spec = levelSpec(level);
    const image = imageOf(node);
    const imageHeight = Math.round(spec.width * image.aspect);
    const nameHeight = textHeight(spec.nameSize);
    const pathHeight = node.path ? textHeight(spec.pathSize) : 0;
    const labelGap = Math.round(spec.padding / 2);
    return {
      node,
      level,
      spec,
      image,
      imageHeight,
      nameHeight,
      pathHeight,
      labelGap,
      width: spec.width + 2 * spec.padding,
      height:
        2 * spec.padding + nameHeight + pathHeight + labelGap + imageHeight,
    };
  };

  // A side card (dialog, state) at its owner's level: a dialog at the same
  // size, a state one level smaller.
  const measureSide = (node, level) =>
    measureCard(node, node.kind === 'state' ? level + 1 : level);

  const rowChildren = owner =>
    owner.children.filter(
      c => !SIDE_KINDS.has(c.kind) && c.kind !== MEMBER_KIND[owner.kind],
    );

  // An owner's dialogs and states, a chain to its right, each joined to the
  // card before it so no line crosses another card. `x` is relative to the
  // owner's left edge; returns the chain and the right edge of its last card.
  const chainOf = (owner, level, ownerWidth) => {
    const sideGap = 6 * levelSpec(level).padding;
    let x = ownerWidth;
    let previous;
    const sides = owner.children
      .filter(c => SIDE_KINDS.has(c.kind))
      .map(side => {
        x += sideGap;
        const card = { ...measureSide(side, level), x, y: 0 };
        card.joinedTo = previous;
        x += card.width;
        previous = card;
        return card;
      });
    return { sides, right: x };
  };

  // The gap between the subtrees of a row whose tops are at `level`.
  const subtreeGap = level => 4 * levelSpec(level).padding;

  // Subtrees side by side in sitemap order, `gap` apart; `x` is each one's
  // left edge from the first one's.
  const sideBySide = (subtrees, gap) => {
    let x = 0;
    const placed = subtrees.map((t, index) => {
      if (index > 0) {
        x += gap;
      }
      const at = { t, x };
      x += t.width;
      return at;
    });
    return { placed, width: x };
  };

  // The horizontal middle of a row of subtrees: the middle of the span from
  // the first one's top box to the last one's.
  const middleOf = ({ placed }) => {
    const first = placed[0];
    const last = placed.at(-1);
    return (
      (first.x + first.t.top.x + last.x + last.t.top.x + last.t.top.width) / 2
    );
  };

  // A tidy tree. A column is a card (a page, or a tab or step inside its
  // group) with its dialogs and states beside it and its row children side by
  // side below, the card centred over the middle of its children. Every `x`
  // is relative to the column's left edge, which is the leftmost edge of
  // anything in it.
  const column = (node, level) => {
    const card = measureCard(node, level);
    const chain = chainOf(node, level, card.width);
    const kids = sideBySide(
      rowChildren(node).map(child => subtree(child, level + 1)),
      subtreeGap(level + 1),
    );
    const cardX =
      kids.placed.length > 0 ? middleOf(kids) - card.width / 2 : 0;
    const left = Math.min(0, cardX);
    const right = Math.max(kids.width, cardX + chain.right);
    return {
      type: 'column',
      node,
      level,
      card,
      sides: chain.sides,
      cardX: cardX - left,
      kids: kids.placed.map(({ t, x }) => ({ t, x: x - left })),
      width: right - left,
      height: Math.max(card.height, ...chain.sides.map(s => s.height)),
      top: { x: cardX - left, width: card.width },
    };
  };

  // A tabs or wizard group: a column per member, side by side, each member
  // centred over its own subtree, and the group box stretched across all
  // the members' cards. The group's own dialogs and states sit to its right.
  const group = (node, level) => {
    const spec = levelSpec(level);
    const memberGap = node.kind === 'wizard' ? 4 * spec.padding : spec.padding;
    const columns = sideBySide(
      node.children
        .filter(c => c.kind === MEMBER_KIND[node.kind])
        .map(member => column(member, level)),
      Math.max(memberGap, subtreeGap(level + 1)),
    );
    const headerHeight = textHeight(spec.nameSize);
    const inset = spec.padding + headerHeight + spec.padding;
    const cardsLeft = Math.min(...columns.placed.map(c => c.x + c.t.cardX));
    const cardsRight = Math.max(
      ...columns.placed.map(
        c => c.x + c.t.cardX + Math.max(c.t.card.width, sidesRight(c.t)),
      ),
    );
    const boxX = cardsLeft - spec.padding;
    const boxWidth = cardsRight - cardsLeft + 2 * spec.padding;
    const boxHeight =
      inset + Math.max(...columns.placed.map(c => c.t.height)) + spec.padding;
    const chain = chainOf(node, level, boxWidth);
    const left = Math.min(0, boxX);
    const right = Math.max(columns.width, boxX + chain.right);
    return {
      type: 'group',
      node,
      level,
      spec,
      headerHeight,
      inset,
      boxX: boxX - left,
      boxWidth,
      boxHeight,
      sides: chain.sides,
      columns: columns.placed.map(({ t, x }) => ({ t, x: x - left })),
      width: right - left,
      height: Math.max(boxHeight, ...chain.sides.map(s => s.height)),
      top: { x: boxX - left, width: boxWidth },
    };
  };

  // The right edge of a column's side chain, from its card's left edge.
  const sidesRight = t =>
    t.sides.length > 0 ? t.sides.at(-1).x + t.sides.at(-1).width : 0;

  const subtree = (node, level) =>
    MEMBER_KIND[node.kind] ? group(node, level) : column(node, level);

  const tree = subtree(root, 0);

  // Rows: every block of a level starts at the same y.
  const kidsOf = t =>
    t.type === 'group' ? t.columns.flatMap(c => c.t.kids) : t.kids;
  const rowHeights = [];
  const collectHeights = t => {
    rowHeights[t.level] = Math.max(rowHeights[t.level] ?? 0, t.height);
    kidsOf(t).forEach(k => collectHeights(k.t));
  };
  collectHeights(tree);
  const treeTop =
    origin.y +
    textHeight(STYLE.titleSize) +
    textHeight(STYLE.subtitleSize) +
    ROW_GAP;
  const treeLeft = origin.x + LEVEL_MARKER_WIDTH + LEVEL_MARKER_GAP;
  const rowTops = [];
  rowHeights.reduce((y, height, level) => {
    rowTops[level] = y;
    return y + height + ROW_GAP;
  }, treeTop);

  const items = [];
  const nodes = [];
  const images = [];
  const lines = [];
  const add = item => {
    items.push(item);
    return item;
  };
  const round = n => Math.round(n);
  const miro = (id, column, index = 0) =>
    (stateById.get(id)?.[column] ?? '').split(',')[index]?.trim() || undefined;

  const drawLabels = (node, spec, x, y, column = 'label') => {
    add({
      key: `${node.id}/name`,
      node: node.id,
      type: 'text',
      role: 'name',
      text: node.name,
      x: round(x),
      y: round(y),
      width: spec.width,
      height: textHeight(spec.nameSize),
      fontSize: spec.nameSize,
      bold: true,
      color: STYLE.nameColor,
      stateColumn: column,
      miroId: miro(node.id, column, 0),
    });
    if (node.path) {
      add({
        key: `${node.id}/path`,
        node: node.id,
        type: 'text',
        role: 'path',
        text: node.path,
        x: round(x),
        y: round(y + textHeight(spec.nameSize)),
        width: spec.width,
        height: textHeight(spec.pathSize),
        fontSize: spec.pathSize,
        bold: false,
        color: STYLE.pathColor,
        stateColumn: column,
        miroId: miro(node.id, column, 1),
      });
    }
  };

  // Absolute boxes by node id, for the lines.
  const boxes = new Map();

  const summary = (node, level) => {
    const s = stateById.get(node.id);
    return {
      id: node.id,
      kind: node.kind,
      level,
      name: node.name,
      path: node.path,
      reach: node.reach || undefined,
      note: node.note || undefined,
      captured: s?.captured || undefined,
      commit: s?.commit || undefined,
      skipped: s?.skipped || undefined,
      onBoard: Boolean(s?.card),
    };
  };

  // A card at its absolute top-left corner.
  const drawCard = (card, x, y, level) => {
    const { node, spec } = card;
    const box = {
      key: `${node.id}/card`,
      node: node.id,
      type: 'card',
      kind: node.kind,
      x: round(x),
      y: round(y),
      width: round(card.width),
      height: round(card.height),
      fill: node.kind === 'state' ? STYLE.stateFill : STYLE.cardFill,
      radius: spec.padding,
      stateColumn: 'card',
      miroId: miro(node.id, 'card'),
    };
    add(box);
    boxes.set(node.id, box);
    drawLabels(node, spec, x + spec.padding, y + spec.padding);
    const imageY =
      y + spec.padding + card.nameHeight + card.pathHeight + card.labelGap;
    const file = card.image.source === 'png' ? `screens/${node.id}.png` : null;
    images.push({
      key: `${node.id}/image`,
      node: node.id,
      type: 'image',
      title: `${node.name} ${node.path}`.trim(),
      file,
      source: card.image.source,
      pixelWidth: card.image.width,
      pixelHeight: card.image.height,
      x: round(x + spec.padding),
      y: round(imageY),
      width: spec.width,
      height: card.imageHeight,
      cx: round(x + spec.padding + spec.width / 2),
      cy: round(imageY + card.imageHeight / 2),
      stateColumn: 'image',
      miroId: miro(node.id, 'image'),
    });
    nodes.push(summary(node, level));
    return box;
  };

  const line = (child, from, to, options) => {
    const item = {
      key: `${child.id}/edge`,
      node: child.id,
      type: 'line',
      from: from.key,
      to: to.key,
      color: STYLE.lineColor,
      strokeWidth: STYLE.lineWidth,
      arrow: 'end',
      stateColumn: 'edge',
      miroId: miro(child.id, 'edge'),
      ...options,
    };
    lines.push(item);
    return item;
  };

  // A side chain at its owner's absolute corner: each card, and a straight
  // dashed line from the right edge of the card before it to its left.
  const drawSides = (sides, ownerBox, level) => {
    for (const side of sides) {
      const box = drawCard(side, ownerBox.x + side.x, ownerBox.y, level);
      const from = side.joinedTo ? boxes.get(side.joinedTo.node.id) : ownerBox;
      const y = round(from.y + Math.min(from.height, box.height) / 2);
      line(side.node, from, box, {
        shape: 'straight',
        dashed: true,
        fromSide: 'right',
        toSide: 'left',
        label: side.node.kind === 'dialog' ? 'Dialog' : 'State',
        points: [
          [from.x + from.width, y],
          [box.x, y],
        ],
      });
    }
  };

  // Elbowed from the bottom of the parent to the top of the child, the elbow
  // halfway down the gap above the child's row.
  const levelLine = (node, level, parentBox, topBox) => {
    const from = [
      round(parentBox.x + parentBox.width / 2),
      parentBox.y + parentBox.height,
    ];
    const to = [round(topBox.x + topBox.width / 2), topBox.y];
    const elbowY = round(rowTops[level] - ROW_GAP / 2);
    line(node, parentBox, topBox, {
      shape: 'elbowed',
      dashed: false,
      fromSide: 'bottom',
      toSide: 'top',
      points:
        from[0] === to[0]
          ? [from, to]
          : [from, [from[0], elbowY], [to[0], elbowY], to],
    });
  };

  // A wizard's arrow from one step to the next: straight, or over the top of
  // the previous step's dialogs and states.
  const stepArrow = (node, from, box, overTop, padding) => {
    if (overTop) {
      const y = round(box.y - padding / 2);
      const fromX = round(from.x + from.width / 2);
      const toX = round(box.x + box.width / 2);
      line(node, from, box, {
        shape: 'elbowed',
        dashed: false,
        fromSide: 'top',
        toSide: 'top',
        points: [
          [fromX, from.y],
          [fromX, y],
          [toX, y],
          [toX, box.y],
        ],
      });
    } else {
      const y = round(box.y + Math.min(from.height, box.height) / 2);
      line(node, from, box, {
        shape: 'straight',
        dashed: false,
        fromSide: 'right',
        toSide: 'left',
        points: [
          [from.x + from.width, y],
          [box.x, y],
        ],
      });
    }
  };

  const drawSubtree = (t, left, parentBox) =>
    t.type === 'group'
      ? drawGroup(t, left, parentBox)
      : drawColumn(t, left, rowTops[t.level], parentBox);

  // A column at its absolute left edge, its card at `y`.
  const drawColumn = (t, left, y, parentBox) => {
    const box = drawCard(t.card, left + t.cardX, y, t.level);
    drawSides(t.sides, box, t.level);
    if (parentBox) {
      levelLine(t.node, t.level, parentBox, box);
    }
    for (const kid of t.kids) {
      drawSubtree(kid.t, left + kid.x, box);
    }
    return box;
  };

  const drawGroup = (t, left, parentBox) => {
    const { node, spec } = t;
    const y = rowTops[t.level];
    const groupBox = add({
      key: `${node.id}/card`,
      node: node.id,
      type: 'group',
      kind: node.kind,
      x: round(left + t.boxX),
      y: round(y),
      width: round(t.boxWidth),
      height: round(t.boxHeight),
      fill: STYLE.groupFill,
      border: STYLE.groupBorder,
      borderWidth: STYLE.groupBorderWidth,
      radius: spec.padding,
      stateColumn: 'card',
      miroId: miro(node.id, 'card'),
    });
    boxes.set(node.id, groupBox);
    drawLabels(
      { ...node, path: '' },
      spec,
      left + t.boxX + spec.padding,
      y + spec.padding,
    );
    nodes.push(summary(node, t.level));
    let previous;
    for (const c of t.columns) {
      const box = drawColumn(c.t, left + c.x, y + t.inset, undefined);
      if (node.kind === 'wizard' && previous) {
        stepArrow(
          c.t.node,
          previous.box,
          box,
          previous.t.sides.length > 0,
          spec.padding,
        );
      }
      previous = { box, t: c.t };
    }
    drawSides(t.sides, groupBox, t.level);
    if (parentBox) {
      levelLine(node, t.level, parentBox, groupBox);
    }
  };

  drawSubtree(tree, treeLeft, undefined);

  // The level markers, left of each row, and the title above the tree.
  const markerX = origin.x;
  rowTops.forEach((y, level) =>
    add({
      key: `_level-${level}`,
      type: 'text',
      role: 'level',
      text: `Level ${level}`,
      x: markerX,
      y,
      width: LEVEL_MARKER_WIDTH,
      height: textHeight(STYLE.levelSize),
      fontSize: STYLE.levelSize,
      bold: true,
      color: STYLE.levelColor,
      stateColumn: 'label',
      miroId: miro(`_level-${level}`, 'label'),
    }),
  );
  const titleWidth = Math.max(
    tree.width + LEVEL_MARKER_GAP + LEVEL_MARKER_WIDTH,
    4000,
  );
  const titleY = origin.y;
  const subtitleY = titleY + textHeight(STYLE.titleSize);
  add({
    key: '_title',
    type: 'text',
    role: 'title',
    text: TITLE,
    x: markerX,
    y: titleY,
    width: titleWidth,
    height: textHeight(STYLE.titleSize),
    fontSize: STYLE.titleSize,
    bold: true,
    color: STYLE.nameColor,
    stateColumn: 'label',
    miroId: miro('_title', 'label'),
  });
  add({
    key: '_subtitle',
    type: 'text',
    role: 'subtitle',
    text: SUBTITLE,
    x: markerX,
    y: subtitleY,
    width: titleWidth,
    height: textHeight(STYLE.subtitleSize),
    fontSize: STYLE.subtitleSize,
    bold: false,
    color: STYLE.pathColor,
    stateColumn: 'label',
    miroId: miro('_subtitle', 'label'),
  });

  // Draw order: boxes and labels, then lines, then images on top.
  const all = [...items, ...lines, ...images];
  const boxed = all.filter(i => i.type !== 'line');
  const left = Math.min(...boxed.map(i => i.x));
  const top = Math.min(...boxed.map(i => i.y));
  const right = Math.max(...boxed.map(i => i.x + i.width));
  const bottom = Math.max(...boxed.map(i => i.y + i.height));
  return {
    board: BOARD_URL,
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    nodes,
    items: all,
  };
}

/**
 * The sitemap rows the board shows: those with a card in the state, under a
 * parent that is drawn too, and groups with a member drawn.
 */
export function drawnRows(rows, state) {
  const drawn = new Set(state.filter(row => row.card).map(row => row.id));
  let kept = rows.filter(row => drawn.has(row.id));
  for (;;) {
    const ids = new Set(kept.map(row => row.id));
    const next = kept.filter(
      row =>
        (row.parent === '' || ids.has(row.parent)) &&
        (!MEMBER_KIND[row.kind] ||
          kept.some(
            child =>
              child.parent === row.id && child.kind === MEMBER_KIND[row.kind],
          )),
    );
    if (next.length === kept.length) {
      return kept;
    }
    kept = next;
  }
}

// Fields that say nothing about how an item looks.
const BOOKKEEPING = new Set(['miroId', 'action', 'file', 'source']);
const look = item =>
  JSON.stringify(
    Object.entries(item).filter(([field]) => !BOOKKEEPING.has(field)),
  );

/**
 * What a run does to the board, from the state's Miro ids. `board` is the
 * plan the board was drawn from (`layout` of `drawnRows`, sized by the state
 * alone); without it every item with an id is updated. Sets each item's
 * `action` and returns the keys per action, and the Miro ids to delete:
 * every id in the state that no item keeps, `_` rows included, and the old
 * image of every replaced screenshot.
 */
export function planChanges(plan, state, board) {
  const before = new Map(board?.items.map(item => [item.key, item]));
  const changes = { create: [], update: [], replace: [], delete: [] };
  const kept = new Set();
  for (const item of plan.items) {
    if (!item.miroId) {
      item.action = item.type === 'image' && !item.file ? 'none' : 'create';
    } else if (item.type === 'image' && item.file) {
      item.action = 'replace';
    } else {
      const old = before.get(item.key);
      item.action = old && look(old) === look(item) ? 'keep' : 'update';
      kept.add(item.miroId);
    }
    if (item.action !== 'keep' && item.action !== 'none') {
      changes[item.action].push(item.key);
    }
  }
  for (const row of state) {
    for (const column of ['card', 'image', 'label', 'edge']) {
      for (const cell of row[column]?.split(',') ?? []) {
        const miroId = cell.trim();
        if (miroId && !kept.has(miroId)) {
          changes.delete.push({ node: row.id, column, miroId });
        }
      }
    }
  }
  return changes;
}

// ----------------------------------------------------------------- board ----

/** The local SVG id of a plan item: its key, made safe for an XML id. */
export const localId = key => `k_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;

const escapeXml = text =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The Canvas Composer SVG for the plan's boxes, labels and lines to create or
 * update (images go through image_create). Each element's local id is its
 * item key (`localId`), so a result SVG maps back to the plan; an item to
 * update carries its Miro id. A line whose card is not in the document gets
 * that card as a stub (its local id and Miro id only), because a connector
 * joins local ids and a stub changes nothing on the board.
 */
export function boardSvg(plan) {
  const byKey = new Map(plan.items.map(item => [item.key, item]));
  const sent = new Set();
  const out = [];
  const miro = item => (item.miroId ? ` data-miro-id="${item.miroId}"` : '');
  for (const item of plan.items) {
    if (!['create', 'update'].includes(item.action) || item.type === 'line') {
      continue;
    }
    if (item.type === 'image') {
      // A new image goes through image_create; a moved one is updated here,
      // without its height: Miro derives it from the image and refuses an
      // update that names one a pixel off.
      if (item.action === 'update') {
        out.push(
          `<image data-type="image" data-miro-id="${item.miroId}" x="${item.x}" y="${item.y}" width="${item.width}" />`,
        );
      }
      continue;
    }
    sent.add(item.key);
    if (item.type === 'card' || item.type === 'group') {
      const stroke =
        item.type === 'group'
          ? ` stroke="${item.border}" stroke-width="${item.borderWidth}"`
          : ' stroke="none"';
      out.push(
        `<rect id="${localId(item.key)}"${miro(item)} x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="${item.radius}" fill="${item.fill}"${stroke} />`,
      );
    } else if (item.type === 'text') {
      const text = escapeXml(item.text);
      out.push(
        `<textArea id="${localId(item.key)}"${miro(item)} x="${item.x}" y="${item.y}" width="${item.width}" font-size="${item.fontSize}" font-family="${STYLE.fontFamily}" fill="${item.color}">${item.bold ? `<b>${text}</b>` : text}</textArea>`,
      );
    }
  }
  const stubs = [];
  for (const item of plan.items) {
    if (item.type !== 'line' || !['create', 'update'].includes(item.action)) {
      continue;
    }
    for (const end of [item.from, item.to]) {
      if (!sent.has(end)) {
        sent.add(end);
        stubs.push(
          `<rect id="${localId(end)}" data-miro-id="${byKey.get(end).miroId}" />`,
        );
      }
    }
    const [x1, y1] = item.points[0];
    const [x2, y2] = item.points.at(-1);
    out.push(
      `<line id="${localId(item.key)}"${miro(item)} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${item.color}" stroke-width="${item.strokeWidth}" data-arrow="${item.arrow}" data-start="${localId(item.from)}" data-end="${localId(item.to)}" data-shape="${item.shape}" data-start-side="${item.fromSide}" data-end-side="${item.toSide}"${item.dashed ? ' stroke-dasharray="5,5"' : ''}${item.label ? ` data-content="${escapeXml(item.label)}"` : ''} />`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg">\n${[...stubs, ...out].join('\n')}\n</svg>\n`;
}

/** The images to upload: one row per new or replaced screenshot. */
export function uploadsTsv(plan) {
  const rows = plan.items
    .filter(i => i.type === 'image' && ['create', 'replace'].includes(i.action))
    .map(i => [i.node, i.file, i.title, i.width, i.cx, i.cy]);
  return [['node', 'file', 'title', 'width', 'cx', 'cy'], ...rows]
    .map(row => `${row.join('\t')}\n`)
    .join('');
}

/** Local id → Miro id, from Canvas Composer result SVGs. */
export function miroIdsFromSvg(svgs) {
  const ids = new Map();
  for (const svg of svgs) {
    for (const element of svg.match(/<[a-zA-Z]+\s[^>]*>/g) ?? []) {
      const id = /\sid="([^"]+)"/.exec(element)?.[1];
      const miroId = /\sdata-miro-id="(\d+)"/.exec(element)?.[1];
      if (id && miroId) {
        ids.set(id, miroId);
      }
    }
  }
  return ids;
}

/**
 * The state after a run: one row per node with a card on the board, in
 * sitemap order, then the board's own items. Ids come from the result SVGs
 * (`ids`, by local id), the uploaded images (`images`, node → Miro id) or the
 * state already; a new screenshot's row gets its capture time (the PNG's
 * modification time, rounded up to the second), `commit` and viewport.
 * `skipped` (node → reason) records why a node has no screenshot; a reason
 * stays until the node gets one.
 */
export function stateRows({
  rows,
  plan,
  state = [],
  ids = new Map(),
  images = new Map(),
  skipped = new Map(),
  commit,
  mtimeOf = () => undefined,
}) {
  const previous = new Map(state.map(row => [row.id, row]));
  const byKey = new Map(plan.items.map(item => [item.key, item]));
  const idOf = key => {
    const item = byKey.get(key);
    return item ? (ids.get(localId(key)) ?? item.miroId ?? '') : '';
  };
  const out = [];
  for (const { id } of rows) {
    const card = idOf(`${id}/card`);
    if (!card) {
      continue;
    }
    const before = previous.get(id) ?? {};
    const row = {
      id,
      captured: before.captured ?? '',
      commit: before.commit ?? '',
      viewport: before.viewport ?? '',
      card,
      image: before.image ?? '',
      label: [idOf(`${id}/name`), idOf(`${id}/path`)]
        .filter(Boolean)
        .join(','),
      edge: idOf(`${id}/edge`),
      skipped: before.skipped ?? '',
    };
    const image = byKey.get(`${id}/image`);
    if (images.has(id) && image?.file) {
      const mtimeMs = mtimeOf(image.file);
      row.image = images.get(id);
      row.captured = new Date(Math.ceil(mtimeMs / 1000) * 1000)
        .toISOString()
        .replace('.000Z', 'Z');
      row.commit = commit ?? '';
      row.viewport = `${image.pixelWidth / 2}x${image.pixelHeight / 2}x2`;
    } else if (image && !image.miroId && !images.has(id)) {
      row.image = '';
    }
    if (skipped.has(id)) {
      row.skipped = skipped.get(id);
    }
    if (row.image) {
      row.skipped = '';
    }
    out.push(row);
  }
  for (const item of plan.items.filter(i => i.key.startsWith('_'))) {
    const label = idOf(item.key);
    if (label) {
      out.push({ id: item.key, label });
    }
  }
  return out;
}

/**
 * The state file's text. Trailing empty cells are left off, as
 * `parseTsv` allows: the repo's trailing-whitespace hook would strip their
 * tabs anyway.
 */
export function stateTsv(rows) {
  return `${[
    STATE_COLUMNS.join('\t'),
    ...rows.map(row =>
      STATE_COLUMNS.map(c => row[c] ?? '')
        .join('\t')
        .replace(/\t+$/, ''),
    ),
  ].join('\n')}\n`;
}

/** The sitemap as it was when the state was last committed, if git knows. */
function committedSitemap(sitemapFile, stateFile) {
  try {
    const cwd = dirname(stateFile);
    const git = (...args) =>
      execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    const commit = git('log', '-1', '--format=%H', '--', stateFile).trim();
    if (!commit || git('status', '--porcelain', '--', stateFile).trim()) {
      return undefined;
    }
    return git('show', `${commit}:./${relative(cwd, sitemapFile)}`);
  } catch {
    return undefined;
  }
}

/** A PNG's pixel size and modification time, from its first 24 bytes. */
function readPngSize(file) {
  const header = Buffer.alloc(24);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, header, 0, 24, 0);
  } finally {
    closeSync(fd);
  }
  return { ...pngSize(header), mtimeMs: statSync(file).mtimeMs };
}

// ------------------------------------------------------------------ cli ----

function parseArgs(argv) {
  const args = {
    sitemap: join(HERE, 'sitemap.tsv'),
    state: join(HERE, 'sitemap.state.tsv'),
    screens: join(HERE, 'screens'),
    origin: { x: 0, y: 0 },
    result: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) {
        throw new Error(`${flag} needs a value`);
      }
      return v;
    };
    switch (flag) {
      case '--sitemap':
        args.sitemap = resolve(value());
        break;
      case '--state':
        args.state = resolve(value());
        break;
      case '--screens':
        args.screens = resolve(value());
        break;
      case '--no-screens':
        args.screens = undefined;
        break;
      case '--board-sitemap':
        args.boardSitemap = resolve(value());
        break;
      case '--out':
        args.out = resolve(value());
        break;
      case '--svg':
        args.svg = resolve(value());
        break;
      case '--uploads':
        args.uploads = resolve(value());
        break;
      case '--write-state':
        args.writeState = true;
        break;
      case '--update-all':
        args.updateAll = true;
        break;
      case '--result':
        args.result.push(...value().split(',').map(f => resolve(f)));
        break;
      case '--images':
        args.images = resolve(value());
        break;
      case '--skipped':
        args.skipped = resolve(value());
        break;
      case '--commit':
        args.commit = value();
        break;
      case '--origin': {
        const [x, y] = value().split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error('--origin takes x,y');
        }
        args.origin = { x, y };
        break;
      }
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`unknown argument ${flag}`);
    }
  }
  return args;
}

/** A two-column TSV without a header (`key<TAB>value`) as a map. */
function readPairs(file) {
  if (!file) {
    return new Map();
  }
  return new Map(
    readFileSync(file, 'utf8')
      .split('\n')
      .map(line => line.replace(/\r$/, ''))
      .filter(line => line.trim() !== '' && !line.startsWith('#'))
      .map(line => {
        const [key, ...rest] = line.split('\t');
        return [key.trim(), rest.join('\t').trim()];
      }),
  );
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      `${readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('\n')
        .slice(1, 16)
        .map(l => l.replace(/^\/\/ ?/, ''))
        .join('\n')}\n`,
    );
    return;
  }
  const rows = parseTsv(
    readFileSync(args.sitemap, 'utf8'),
    SITEMAP_COLUMNS,
    relative(process.cwd(), args.sitemap),
  );
  const state = existsSync(args.state)
    ? parseTsv(
        readFileSync(args.state, 'utf8'),
        STATE_COLUMNS,
        relative(process.cwd(), args.state),
      )
    : [];
  const screenSize = id => {
    if (!args.screens) {
      return undefined;
    }
    const file = join(args.screens, `${id}.png`);
    return existsSync(file) ? readPngSize(file) : undefined;
  };
  const plan = layout({ rows, state, screenSize, origin: args.origin });
  // The board as the state says it was drawn: the sitemap of the state's
  // commit, the drawn nodes only, sized by the state.
  const boardText = args.boardSitemap
    ? readFileSync(args.boardSitemap, 'utf8')
    : committedSitemap(args.sitemap, args.state);
  if (!boardText && state.some(row => row.card)) {
    process.stderr.write(
      'layout.mjs: no committed sitemap for the state; comparing against the current one, so a renamed node is not updated (pass --board-sitemap with the sitemap the board was drawn from)\n',
    );
  }
  const boardRows = drawnRows(
    boardText
      ? parseTsv(boardText, SITEMAP_COLUMNS, 'the board sitemap')
      : rows,
    state,
  );
  // After a change to this file the board was drawn by other rules, which a
  // layout of the drawn rows can't show: --update-all updates every item.
  const board =
    boardRows.length > 0 && !args.updateAll
      ? layout({ rows: boardRows, state, origin: args.origin })
      : undefined;
  plan.changes = planChanges(plan, state, board);
  if (args.screens) {
    for (const item of plan.items) {
      if (item.file) {
        item.file = relative(
          process.cwd(),
          join(args.screens, `${item.node}.png`),
        );
      }
    }
  }
  if (args.writeState) {
    const next = stateRows({
      rows,
      plan,
      state,
      ids: miroIdsFromSvg(args.result.map(f => readFileSync(f, 'utf8'))),
      images: readPairs(args.images),
      skipped: readPairs(args.skipped),
      commit:
        args.commit ??
        execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
          cwd: HERE,
          encoding: 'utf8',
        }).trim(),
      mtimeOf: file => statSync(resolve(file)).mtimeMs,
    });
    writeFileSync(args.state, stateTsv(next));
    const pending = plan.changes.delete.map(d => d.miroId);
    if (pending.length > 0) {
      process.stderr.write(
        `layout.mjs: the state no longer lists ${pending.length} Miro id(s) the plan deletes; delete them on the board: ${pending.join(', ')}\n`,
      );
    }
    return;
  }
  if (args.svg) {
    mkdirSync(dirname(args.svg), { recursive: true });
    writeFileSync(args.svg, boardSvg(plan));
  }
  if (args.uploads) {
    mkdirSync(dirname(args.uploads), { recursive: true });
    writeFileSync(args.uploads, uploadsTsv(plan));
  }
  const json = `${JSON.stringify(plan, null, 2)}\n`;
  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, json);
  } else {
    process.stdout.write(json);
  }
}

/** Whether node runs this file, also through a symlinked path. */
function isMain() {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`layout.mjs: ${error.message}\n`);
    process.exitCode = 1;
  }
}
