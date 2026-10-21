#!/usr/bin/env node
// Lays out the Agent Platform sitemap for the Miro board: reads sitemap.tsv,
// sitemap.state.tsv and the screenshots, and prints a JSON plan with the
// position and size of every card, group box, label, image and line. The
// drawing rules are in SKILL.md; this file is their one implementation.
//
//   node .claude/skills/ui-sitemap/layout.mjs [--out plan.json]
//     [--screens dir | --no-screens] [--board-sitemap file]
//     [--sitemap file] [--state file] [--origin x,y]
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
  lineHeight: 1.3,
};

const TITLE = 'Agent Platform map';
const SUBTITLE =
  'Every page, tab, wizard step and dialog of the Agent Platform UI, as a tree. Kept by the ui-sitemap skill in giantswarm/backstage.';

const ROW_GAP = 480;
const LEVEL_MARKER_WIDTH = 480;
const LEVEL_MARKER_GAP = 240;
// The screenshot a node without one is drawn as: a 1440×900 viewport.
const DEFAULT_ASPECT = 900 / 1440;

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

/**
 * The plan: every item to draw, by a stable key, with its geometry. `x`/`y`
 * are the top-left corner (as in SVG); images also carry `cx`/`cy`, their
 * centre, which is what `image_create` takes.
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
  const isNew = (id, png) => {
    const row = stateById.get(id);
    const captured = Date.parse(row?.captured ?? '');
    return (
      !row?.image || Number.isNaN(captured) || (png.mtimeMs ?? 0) > captured
    );
  };
  const imageOf = node => {
    const png = screenSize(node.id);
    if (png && isNew(node.id, png)) {
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

  // The row's own boxes of a row node (a page, or a tabs/wizard group), with
  // the slots its next-row children hang from. Coordinates are relative to
  // the block's top-left corner.
  const measureBlock = (node, level) => {
    const spec = levelSpec(level);
    const sideGap = 6 * spec.padding;
    const block = { node, level, cards: [], group: undefined, slots: [] };
    // A chain to the owner's right, each joined to the card before it, so no
    // line crosses another card.
    const placeSides = (owner, ownerCard, startX) => {
      let x = startX;
      let previous = ownerCard;
      for (const side of owner.children.filter(c => SIDE_KINDS.has(c.kind))) {
        x += sideGap;
        const card = { ...measureSide(side, level), x, y: ownerCard.y };
        card.joinedTo = previous;
        block.cards.push(card);
        x += card.width;
        previous = card;
      }
      return x;
    };
    const rowChildren = owner =>
      owner.children.filter(
        c => !SIDE_KINDS.has(c.kind) && c.kind !== MEMBER_KIND[owner.kind],
      );

    if (MEMBER_KIND[node.kind]) {
      const member = MEMBER_KIND[node.kind];
      const gap = node.kind === 'wizard' ? 4 * spec.padding : spec.padding;
      const headerHeight = textHeight(spec.nameSize);
      const top = spec.padding + headerHeight + spec.padding;
      let x = spec.padding;
      let previous;
      for (const child of node.children.filter(c => c.kind === member)) {
        if (previous) {
          x += gap;
        }
        const card = { ...measureCard(child, level), x, y: top };
        card.previous = node.kind === 'wizard' ? previous : undefined;
        block.cards.push(card);
        x = placeSides(child, card, x + card.width);
        card.hasSides = x > card.x + card.width;
        block.slots.push({ card, children: rowChildren(child) });
        previous = card;
      }
      const innerHeight = Math.max(
        ...block.cards.map(card => card.y + card.height),
      );
      block.group = {
        node,
        level,
        spec,
        x: 0,
        y: 0,
        width: x + spec.padding,
        height: innerHeight + spec.padding,
        headerHeight,
      };
      const right = placeSides(node, block.group, block.group.width);
      block.width = right;
      block.height = Math.max(
        block.group.height,
        ...block.cards.map(card => card.y + card.height),
      );
    } else {
      const card = { ...measureCard(node, level), x: 0, y: 0 };
      block.cards.push(card);
      block.width = placeSides(node, card, card.width);
      block.height = Math.max(...block.cards.map(c => c.y + c.height));
      block.slots.push({ card, children: rowChildren(node) });
    }
    return block;
  };

  // Lays out a subtree: its block, and each slot's children centred under the
  // slot, pushed right where they would overlap the previous slot's. Returns
  // the subtree's width and the block's offset in it.
  const subtree = (node, level) => {
    const block = measureBlock(node, level);
    const gap = 4 * levelSpec(level + 1).padding;
    let previousRight = -Infinity;
    let minLeft = 0;
    let maxRight = block.width;
    block.clusters = block.slots.map(slot => {
      const children = slot.children.map(child => subtree(child, level + 1));
      if (children.length === 0) {
        return { slot, children, left: 0 };
      }
      const width =
        children.reduce((sum, c) => sum + c.width, 0) +
        gap * (children.length - 1);
      const ideal = slot.card.x + slot.card.width / 2 - width / 2;
      const left = Math.max(ideal, previousRight + gap);
      previousRight = left + width;
      minLeft = Math.min(minLeft, left);
      maxRight = Math.max(maxRight, previousRight);
      return { slot, children, left, width };
    });
    return {
      block,
      gap,
      offset: -minLeft,
      width: maxRight - minLeft,
    };
  };

  const tree = subtree(root, 0);

  // Rows: every block of a level starts at the same y.
  const rowHeights = [];
  const collectHeights = (t, level) => {
    rowHeights[level] = Math.max(rowHeights[level] ?? 0, t.block.height);
    t.block.clusters.forEach(cluster =>
      cluster.children.forEach(child => collectHeights(child, level + 1)),
    );
  };
  collectHeights(tree, 0);
  const rowTops = [];
  rowHeights.reduce((y, height, level) => {
    rowTops[level] = y;
    return y + height + ROW_GAP;
  }, origin.y);

  const items = [];
  const nodes = [];
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

  const drawCard = (card, bx, by, level) => {
    const { node, spec } = card;
    const x = bx + card.x;
    const y = by + card.y;
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
      onBoard: Boolean(s?.card),
    };
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

  // Side lines: straight from the right edge of the card before it in the
  // chain to the side card's left.
  const sideLine = (card, ownerBox) => {
    const box = boxes.get(card.node.id);
    const y = round(ownerBox.y + Math.min(ownerBox.height, box.height) / 2);
    line(card.node, ownerBox, box, {
      shape: 'straight',
      dashed: true,
      fromSide: 'right',
      toSide: 'left',
      label: card.node.kind === 'dialog' ? 'Dialog' : 'State',
      points: [
        [ownerBox.x + ownerBox.width, y],
        [box.x, y],
      ],
    });
  };

  const images = [];
  const lines = [];

  const draw = (t, left, level, parentBox) => {
    const { block } = t;
    const bx = left + t.offset;
    const by = rowTops[level];
    let topBox;
    if (block.group) {
      const { group, node } = block;
      topBox = add({
        key: `${node.id}/card`,
        node: node.id,
        type: 'group',
        kind: node.kind,
        x: round(bx),
        y: round(by),
        width: round(group.width),
        height: round(group.height),
        fill: STYLE.groupFill,
        border: STYLE.groupBorder,
        borderWidth: STYLE.groupBorderWidth,
        radius: group.spec.padding,
        stateColumn: 'card',
        miroId: miro(node.id, 'card'),
      });
      boxes.set(node.id, topBox);
      drawLabels(
        { ...node, path: '' },
        group.spec,
        bx + group.spec.padding,
        by + group.spec.padding,
      );
      nodes.push(summary(node, level));
    }
    for (const card of block.cards) {
      const box = drawCard(card, bx, by, level);
      if (!topBox && card === block.cards[0]) {
        topBox = box;
      }
      if (card.previous) {
        const from = boxes.get(card.previous.node.id);
        if (card.previous.hasSides) {
          // Over the top: the previous step's dialogs and states sit between.
          const y = round(box.y - card.spec.padding / 2);
          const fromX = round(from.x + from.width / 2);
          const toX = round(box.x + box.width / 2);
          line(card.node, from, box, {
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
          line(card.node, from, box, {
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
      }
    }
    for (const card of block.cards.filter(c => c.joinedTo)) {
      sideLine(card, boxes.get(card.joinedTo.node.id));
    }
    if (parentBox) {
      const from = [
        round(parentBox.x + parentBox.width / 2),
        parentBox.y + parentBox.height,
      ];
      const to = [round(topBox.x + topBox.width / 2), topBox.y];
      const elbowY = round(rowTops[level] - ROW_GAP / 2);
      line(block.node, parentBox, topBox, {
        shape: 'elbowed',
        dashed: false,
        fromSide: 'bottom',
        toSide: 'top',
        points:
          from[0] === to[0]
            ? [from, to]
            : [from, [from[0], elbowY], [to[0], elbowY], to],
      });
    }
    for (const cluster of block.clusters) {
      const from = boxes.get(cluster.slot.card.node.id);
      let x = bx + cluster.left;
      for (const child of cluster.children) {
        draw(child, x, level + 1, from);
        x += child.width + t.gap;
      }
    }
  };

  draw(tree, origin.x, 0, undefined);

  // The level markers, left of each row, and the title above the tree.
  const markerX = origin.x - LEVEL_MARKER_GAP - LEVEL_MARKER_WIDTH;
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
  const subtitleY = origin.y - ROW_GAP - textHeight(STYLE.subtitleSize);
  const titleY = subtitleY - textHeight(STYLE.titleSize);
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

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      `${readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('\n')
        .slice(1, 11)
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
      'layout.mjs: no committed sitemap for the state; comparing against the current one, so a renamed node is not updated\n',
    );
  }
  const boardRows = drawnRows(
    boardText
      ? parseTsv(boardText, SITEMAP_COLUMNS, 'the board sitemap')
      : rows,
    state,
  );
  const board =
    boardRows.length > 0
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
