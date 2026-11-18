/*
 * The measurement, run inside the page by `layout-check.mjs` through
 * Playwright's `page.evaluate`. `collectLayout` must stay self-contained (no
 * imports, no closures over this module): Playwright sends its source to the
 * browser. It returns plain data, which the rules in `rules.mjs` read.
 *
 * Boxes are `{ x, y, w, h }` in CSS pixels, in viewport coordinates, except
 * `pos` of a control, which is in the coordinates of its nearest scroll
 * container's content, so a scroll between two states does not read as a
 * move.
 */

/**
 * @param {{ ignore?: string[] }} options CSS selectors of subtrees to leave out.
 */
export function collectLayout(options) {
  const ignore = (options && options.ignore) || [];
  const doc = document.documentElement;
  const body = document.body;
  const viewport = { w: doc.clientWidth, h: window.innerHeight };

  const CONTROL =
    'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=combobox], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=slider], [role=spinbutton], [role=searchbox], [role=textbox]';
  // Classes of the design systems' buttons: a link styled as one is checked
  // for centring like a button.
  const BUTTON_CLASS = /^(bui-Button|bui-ButtonIcon|MuiButton-root|MuiIconButton-root)$/;
  // Roles whose element starts a layer of its own: an overlay over the page.
  const LAYER_ROLES = new Set([
    'dialog',
    'alertdialog',
    'tooltip',
    'menu',
    'listbox',
  ]);
  // Ancestors whose content is a list of records: rows reorder, appear and
  // go between states by design, so they are not compared across states.
  const LIST_ROLES = new Set([
    'list',
    'listitem',
    'grid',
    'gridcell',
    'row',
    'rowgroup',
    'table',
    'treegrid',
    'tree',
    'feed',
    'listbox',
  ]);
  const LIST_TAGS = new Set(['UL', 'OL', 'TABLE', 'TBODY', 'TR', 'LI']);
  const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION']);

  const memo = fn => {
    const cache = new Map();
    return el => {
      if (cache.has(el)) return cache.get(el);
      const value = fn(el);
      cache.set(el, value);
      return value;
    };
  };

  const style = memo(el => getComputedStyle(el));
  const rectOf = memo(el => el.getBoundingClientRect());

  const round = n => Math.round(n * 10) / 10;
  const box = r => ({
    x: round(r.left ?? r.x),
    y: round(r.top ?? r.y),
    w: round(r.width ?? r.w),
    h: round(r.height ?? r.h),
  });
  const intersect = (a, b) => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.w, b.x + b.w);
    const btm = Math.min(a.y + a.h, b.y + b.h);
    return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : undefined;
  };
  const hides = v => v === 'hidden' || v === 'clip';
  const scrolls = v => v === 'auto' || v === 'scroll';

  const ignored = memo(
    el =>
      Boolean(el.closest('[data-layout-check="ignore"]')) ||
      ignore.some(sel => el.closest(sel)),
  );

  /** Text with its whitespace collapsed, as a person reads it. */
  const norm = v => (v || '').replace(/\s+/g, ' ').trim();

  /**
   * Whether `e` holds the full value of `text` for hover or focus: a
   * `title`, `data-full-text`, or an `aria-describedby` naming a description
   * that holds all of the text. Not any description: react-aria describes
   * every sortable column header by its sort hint.
   */
  const holdsFullText = (e, text) => {
    if (e.title || e.getAttribute('data-full-text')) return true;
    const by = e.getAttribute('aria-describedby');
    const full = norm(text);
    if (!by || !full) return false;
    return by.split(/\s+/).some(id => {
      const d = norm(document.getElementById(id)?.textContent);
      return d.length >= full.length && d.includes(full);
    });
  };

  /**
   * Rendered: not `display: none`, `visibility: hidden` nor, with
   * `opacity`, transparent. Whatever its size.
   */
  const renders = (el, opacity) =>
    typeof el.checkVisibility !== 'function' ||
    el.checkVisibility({ opacityProperty: opacity, visibilityProperty: true });
  const rendered = memo(el => renders(el, true));
  /** Visible as a person sees it: rendered, not transparent, more than a hairline. */
  const visible = memo(el => {
    if (!rendered(el)) return false;
    const r = rectOf(el);
    return r.width > 1 && r.height > 1;
  });
  /**
   * Laid out, taking room, though maybe transparent: row actions shown on
   * hover or focus keep their place in the cell.
   */
  const laidOut = memo(el => {
    if (!renders(el, false)) return false;
    const r = rectOf(el);
    return r.width > 1 && r.height > 1;
  });

  const ids = new Map();
  const idOf = el => {
    let id = ids.get(el);
    if (id === undefined) {
      id = ids.size + 1;
      ids.set(el, id);
    }
    return id;
  };

  /** The element that starts `el`'s layer, or undefined for the page itself. */
  const layerOf = memo(el => {
    for (let e = el; e && e !== doc; e = e.parentElement) {
      const s = style(e);
      if (s.position === 'fixed' || s.position === 'sticky') return e;
      if (s.position === 'absolute' && s.zIndex !== 'auto') return e;
      const role = e.getAttribute('role');
      if (role && LAYER_ROLES.has(role)) return e;
      if (e.hasAttribute('popover') || e.tagName === 'DIALOG') return e;
    }
    return undefined;
  });
  const layerIdOf = el => {
    const layer = layerOf(el);
    return layer ? idOf(layer) : 0;
  };

  /** Whether `e` is the containing block of an absolutely positioned descendant. */
  const containsAbsolute = e => {
    const s = style(e);
    return (
      s.position !== 'static' ||
      s.transform !== 'none' ||
      s.filter !== 'none' ||
      s.perspective !== 'none' ||
      /paint|layout|strict|content/.test(s.contain)
    );
  };

  /**
   * The ancestors at or above `from` that may cut off what `from` holds:
   * each one's inner box and how it treats overflow on each axis. Only the
   * containing-block chain counts: an absolutely positioned element escapes
   * an overflow: hidden ancestor that is not its containing block, and a
   * fixed one escapes them all. An inline box is no clipper: overflow does
   * not apply to it.
   */
  const clipChain = memo(from => {
    const chain = [];
    let needsContainer = false;
    for (let e = from; e && e !== doc && e !== body; e = e.parentElement) {
      const s = style(e);
      if (!needsContainer || containsAbsolute(e)) {
        // Overflow does not apply to an inline box (MUI's `noWrap` text in
        // a span, say): it cuts nothing, and its zero client size would read
        // as cutting everything.
        const clips = s.display !== 'inline' && s.display !== 'contents';
        if (clips && (s.overflowX !== 'visible' || s.overflowY !== 'visible')) {
          const r = rectOf(e);
          chain.push({
            el: e,
            x: r.left + e.clientLeft,
            y: r.top + e.clientTop,
            w: e.clientWidth,
            h: e.clientHeight,
            overflowX: s.overflowX,
            overflowY: s.overflowY,
          });
        }
        needsContainer = s.position === 'absolute';
      }
      if (s.position === 'fixed') break;
    }
    return chain;
  });

  /**
   * What of `rect` is not cut off by `chain`, and the nearest ancestor that
   * cuts it without letting a person scroll to the rest (null when a scroll
   * container cut it first).
   */
  const applyClip = (rect, chain) => {
    let clipper;
    for (const c of chain) {
      const inner = {
        x: c.overflowX === 'visible' ? -1e7 : c.x,
        w: c.overflowX === 'visible' ? 2e7 : c.w,
        y: c.overflowY === 'visible' ? -1e7 : c.y,
        h: c.overflowY === 'visible' ? 2e7 : c.h,
      };
      const next = intersect(rect, inner);
      const cutX = c.overflowX !== 'visible' && (!next || next.w < rect.w - 1);
      const cutY = c.overflowY !== 'visible' && (!next || next.h < rect.h - 1);
      if ((cutX || cutY) && clipper === undefined) {
        clipper =
          (cutX && hides(c.overflowX)) || (cutY && hides(c.overflowY)) ? c.el : null;
      }
      if (!next) return { rect: undefined, clipper };
      rect = next;
    }
    return { rect, clipper };
  };

  /** An element's own box, clipped by its ancestors. */
  const clipOf = memo(el =>
    el.parentElement && el.parentElement !== body
      ? applyClip(box(rectOf(el)), position(el) === 'fixed' ? [] : chainAbove(el))
      : { rect: box(rectOf(el)), clipper: undefined },
  );
  const position = el => style(el).position;
  /** The clip chain of what is above `el`, for `el`'s own box. */
  const chainAbove = el => {
    if (position(el) !== 'absolute') return clipChain(el.parentElement);
    // Absolute: start at its containing block.
    for (let e = el.parentElement; e && e !== doc && e !== body; e = e.parentElement) {
      if (containsAbsolute(e)) return clipChain(e);
    }
    return [];
  };

  const scrollerOf = memo(el => {
    for (let e = el.parentElement; e && e !== doc && e !== body; e = e.parentElement) {
      const s = style(e);
      if (scrolls(s.overflowY) || scrolls(s.overflowX)) return e;
    }
    return undefined;
  });

  /** Position in the content of the nearest scroll container. */
  const contentPos = el => {
    const r = rectOf(el);
    const sc = scrollerOf(el);
    if (!sc) {
      return {
        x: round(r.left + window.scrollX),
        y: round(r.top + window.scrollY),
        w: round(r.width),
        h: round(r.height),
      };
    }
    const sr = rectOf(sc);
    return {
      x: round(r.left - sr.left + sc.scrollLeft),
      y: round(r.top - sr.top + sc.scrollTop),
      w: round(r.width),
      h: round(r.height),
    };
  };

  const inList = el => {
    for (let e = el.parentElement; e && e !== doc; e = e.parentElement) {
      const role = e.getAttribute('role');
      if (role ? LIST_ROLES.has(role) : LIST_TAGS.has(e.tagName)) return true;
    }
    return false;
  };

  const roleOf = el => {
    const role = el.getAttribute('role');
    if (role) return role;
    switch (el.tagName) {
      case 'A':
        return 'link';
      case 'BUTTON':
        return 'button';
      case 'SELECT':
        return 'combobox';
      case 'TEXTAREA':
        return 'textbox';
      case 'INPUT':
        if (['button', 'submit', 'reset'].includes(el.type)) return 'button';
        if (el.type === 'checkbox' || el.type === 'radio') return el.type;
        return 'textbox';
      default:
        return el.tagName.toLowerCase();
    }
  };

  const nameOf = el => {
    const label = el.getAttribute('aria-label');
    if (label) return label.trim().slice(0, 60);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
      if (text) return norm(text).slice(0, 60);
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return (el.getAttribute('placeholder') || el.name || '').slice(0, 60);
    }
    return norm(el.textContent || el.getAttribute('title')).slice(0, 60);
  };

  /** A short CSS-like path: the last few ancestors, with an id or a class. */
  const pathOf = el => {
    const parts = [];
    for (let e = el; e && e !== doc && parts.length < 4; e = e.parentElement) {
      let part = e.tagName.toLowerCase();
      // React's generated ids (`:r1:`, `«r1»`) and react-aria's say nothing.
      if (e.id && !/^[:«]r|react-aria/.test(e.id)) part += `#${e.id}`;
      else {
        const cls =
          [...e.classList].find(c => /^(bui-|Mui[A-Z])/.test(c)) ||
          [...e.classList].find(
            c => !/^(jss|makeStyles-|css-)\d*/.test(c) && !/-\d+$/.test(c),
          );
        if (cls) part += `.${cls}`;
      }
      parts.unshift(part);
    }
    return parts.join(' > ');
  };

  const describe = el => ({ role: roleOf(el), name: nameOf(el), path: pathOf(el) });

  const elementOf = new Map(); // id -> element, for ancestry checks below
  const items = [];

  /**
   * The nearest absolutely positioned element at or above `el` within its
   * layer: something placed over its neighbours on purpose (a badge on a
   * button, an icon in a field).
   */
  const placedOf = (el, layer) => {
    for (let e = el; e && e !== doc && e !== layer; e = e.parentElement) {
      if (position(e) === 'absolute') return e;
    }
    return undefined;
  };

  const add = (el, kind, rects, extra) => {
    const id = idOf(el);
    elementOf.set(id, el);
    const layer = layerOf(el);
    const placed = placedOf(el, layer);
    items.push({
      id,
      kind,
      ...describe(el),
      layer: layer ? idOf(layer) : 0,
      placed: placed ? idOf(placed) : 0,
      rects,
      ...extra,
    });
  };

  // One pass over the page: the controls, the icons, the flex rows and the
  // elements holding text.
  const controls = [];
  const icons = [];
  const flexContainers = new Set();
  const textHolders = [];
  for (const el of body.querySelectorAll('*')) {
    if (ignored(el)) continue;
    if (el.matches(CONTROL)) controls.push(el);
    else if (
      (el.matches('svg, img, [role=img]') && !el.parentElement?.closest('svg'))
    ) {
      icons.push(el);
    }
    const s = style(el);
    if (
      (s.display === 'flex' || s.display === 'inline-flex') &&
      s.flexDirection.startsWith('row')
    ) {
      flexContainers.add(el);
    }
    if (
      !SKIP_TEXT.has(el.tagName) &&
      [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim())
    ) {
      textHolders.push(el);
    }
  }
  const visibleControls = controls.filter(visible);

  // Controls, keyed for the shift rule by role, name and their place among
  // the controls of that role and name (a banner shown above them does not
  // re-key them).
  const seenKeys = new Map();
  for (const el of visibleControls) {
    const { rect, clipper } = clipOf(el);
    // Visually hidden (a native select behind a custom one): cut to a pixel.
    if (!rect || rect.w <= 1 || rect.h <= 1) continue;
    const full = box(rectOf(el));
    const { role, name } = describe(el);
    const base = `${role}|${name}`;
    const n = seenKeys.get(base) ?? 0;
    seenKeys.set(base, n + 1);
    add(el, 'control', [rect], {
      box: full,
      pos: contentPos(el),
      key: `${base}|${n}`,
      inList: inList(el),
      clippedBy:
        clipper && (rect.w < full.w - 1 || rect.h < full.h - 1)
          ? describe(clipper)
          : undefined,
    });
  }

  // Icons: the outermost svg, images.
  const visibleIcons = icons.filter(visible);
  for (const el of visibleIcons) {
    const { rect } = clipOf(el);
    if (!rect || rect.w <= 1 || rect.h <= 1) continue;
    add(el, 'icon', [rect]);
  }

  // Text: each text node's line boxes, cut only where an element hides its
  // overflow (its own, when it does, and its ancestors'): text that spills
  // out of a box that lets it paints over what is beside it.
  const range = document.createRange();
  for (const el of textHolders) {
    if (!visible(el)) continue;
    const chain = clipChain(el);
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue.trim()) continue;
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()]
        .map(box)
        .map(r => applyClip(r, chain).rect)
        .filter(r => r && r.w > 1 && r.h > 1);
      if (rects.length === 0) continue;
      add(el, 'text', rects, { text: node.nodeValue.trim().slice(0, 60) });
    }
  }

  // Ancestry between items, for the overlap rule: an item never overlaps
  // its own ancestor.
  for (const item of items) {
    const el = elementOf.get(item.id);
    const ancestors = [];
    for (let e = el.parentElement; e && e !== doc; e = e.parentElement) {
      if (ids.has(e)) ancestors.push(ids.get(e));
    }
    item.ancestors = ancestors;
  }

  /** Whether something between `el` and `top` is taken out of the flow. */
  const placedBelow = (el, top) => {
    for (let e = el; e && e !== top; e = e.parentElement) {
      if (['absolute', 'fixed'].includes(position(e))) return true;
    }
    return false;
  };

  // Content of button-like controls, for the centering rule: buttons, tabs,
  // select triggers, menu items, switches, and links styled as buttons.
  const centering = [];
  for (const el of visibleControls) {
    const role = roleOf(el);
    const buttonLike =
      ['button', 'tab', 'combobox', 'menuitem', 'switch'].includes(role) ||
      (role === 'link' && [...el.classList].some(c => BUTTON_CLASS.test(c)));
    if (!buttonLike) continue;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) continue;
    const s = style(el);
    if (
      s.display.startsWith('inline') &&
      !s.display.includes('flex') &&
      !s.display.includes('grid') &&
      !s.display.includes('block')
    ) {
      continue;
    }
    const contentBoxes = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = tw.nextNode(); node; node = tw.nextNode()) {
      if (!node.nodeValue.trim() || !visible(node.parentElement)) continue;
      if (placedBelow(node.parentElement, el)) continue;
      range.selectNodeContents(node);
      for (const cr of range.getClientRects()) {
        if (cr.width > 1 && cr.height > 1) contentBoxes.push(box(cr));
      }
    }
    for (const icon of el.querySelectorAll('svg, img')) {
      if (icon.parentElement?.closest('svg') || !visible(icon)) continue;
      if (!placedBelow(icon, el)) contentBoxes.push(box(rectOf(icon)));
    }
    if (contentBoxes.length === 0) continue;
    const x = Math.min(...contentBoxes.map(b => b.x));
    const y = Math.min(...contentBoxes.map(b => b.y));
    const content = {
      x,
      y,
      w: round(Math.max(...contentBoxes.map(b => b.x + b.w)) - x),
      h: round(Math.max(...contentBoxes.map(b => b.y + b.h)) - y),
    };
    // Across, the boxes of what the control lays out (its in-flow children
    // and its own text): a child may reserve room its text does not fill.
    const flowBoxes = [];
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim()) {
        range.selectNodeContents(n);
        for (const cr of range.getClientRects()) if (cr.width > 1) flowBoxes.push(box(cr));
      } else if (
        n.nodeType === Node.ELEMENT_NODE &&
        visible(n) &&
        !['absolute', 'fixed'].includes(position(n))
      ) {
        flowBoxes.push(box(rectOf(n)));
      }
    }
    const fx = flowBoxes.length ? Math.min(...flowBoxes.map(b => b.x)) : content.x;
    const flow = flowBoxes.length
      ? { x: fx, w: round(Math.max(...flowBoxes.map(b => b.x + b.w)) - fx) }
      : { x: content.x, w: content.w };
    const px = v => parseFloat(v) || 0;
    centering.push({
      ...describe(el),
      layer: layerIdOf(el),
      box: box(rectOf(el)),
      content,
      flow,
      padding: {
        top: px(s.paddingTop) + px(s.borderTopWidth),
        right: px(s.paddingRight) + px(s.borderRightWidth),
        bottom: px(s.paddingBottom) + px(s.borderBottomWidth),
        left: px(s.paddingLeft) + px(s.borderLeftWidth),
      },
      centeredX:
        (s.display.includes('flex') &&
          s.flexDirection.startsWith('row') &&
          s.justifyContent === 'center') ||
        (!s.display.includes('flex') &&
          !s.display.includes('grid') &&
          s.textAlign === 'center'),
    });
  }

  // Rows of a flex container, for the alignment rule: each in-flow child's
  // box and the boxes of the controls inside it, of the container's layer.
  // Each control is filed under every flex row it sits in, by walking up
  // from it once.
  const inFlex = new Map(); // container -> Map(child -> controls)
  for (const x of visibleControls) {
    for (let a = x; a && a !== body; a = a.parentElement) {
      const parent = a.parentElement;
      if (!parent || !flexContainers.has(parent)) continue;
      if (layerOf(x) !== layerOf(parent)) continue;
      let byChild = inFlex.get(parent);
      if (!byChild) inFlex.set(parent, (byChild = new Map()));
      if (!byChild.has(a)) byChild.set(a, []);
      byChild.get(a).push(x);
    }
  }
  const flexRows = [];
  for (const [el, byChild] of inFlex) {
    if (byChild.size < 2) continue;
    const children = [...el.children].filter(
      c => !ignored(c) && visible(c) && !['absolute', 'fixed'].includes(position(c)),
    );
    if (children.length < 2) continue;
    const rows = children.map(c => ({
      ...describe(c),
      box: box(rectOf(c)),
      controls: (byChild.get(c) ?? []).map(x => ({ ...describe(x), box: box(rectOf(x)) })),
    }));
    if (rows.filter(r => r.controls.length > 0).length < 2) continue;
    flexRows.push({ ...describe(el), layer: layerIdOf(el), children: rows });
  }

  // Tables: the text of each cell and column header, with how many lines it
  // takes and whether it is cut off, by the cell or something in it, or
  // spills out of the cell. A table scrolled sideways cuts nothing. Only
  // tables with column headers count: a tag group or a list is a grid too.
  const CELL =
    '[role=cell], [role=gridcell], [role=rowheader], [role=columnheader], td, th';
  const TABLE = '[role=table], [role=grid], [role=treegrid], table';
  const isHeader = cell =>
    cell.getAttribute('role') === 'columnheader' ||
    (!cell.getAttribute('role') && cell.tagName === 'TH' && Boolean(cell.closest('thead')));
  const tableOf = memo(cell => {
    const t = cell.closest(TABLE);
    if (!t || ignored(t)) return undefined;
    const hasHeaders = [...t.querySelectorAll('[role=columnheader], thead th')].some(
      h => h.closest(TABLE) === t,
    );
    return hasHeaders ? t : undefined;
  });
  /** The cell of a real table that `el` is in, or undefined. */
  const tableCellOf = el => {
    const cell = el.closest(CELL);
    return cell && tableOf(cell) ? cell : undefined;
  };
  const columnOf = cell => [...cell.parentElement.children].indexOf(cell);
  const headersOf = memo(table => {
    const labels = new Map();
    for (const h of table.querySelectorAll(CELL)) {
      if (isHeader(h) && tableOf(h) === table) labels.set(columnOf(h), norm(h.textContent).slice(0, 40));
    }
    return labels;
  });
  const BADGE_CLASS = /Badge|Chip|Pill|StatusLabel|(^|-)Tag(-|$)/;
  /**
   * Whether text sits in a status badge or label: a badge's or chip's class,
   * `role=status`, `data-status-label` (ui-react's `StatusLabel`), or a
   * status dot (`data-tone`) beside it.
   */
  const isStatus = (el, cell) => {
    for (let e = el; e && e !== cell; e = e.parentElement) {
      if (e.getAttribute('role') === 'status') return true;
      if (e.hasAttribute('data-status-label')) return true;
      if ([...e.classList].some(c => BADGE_CLASS.test(c))) return true;
      if ([...e.children].some(c => c.hasAttribute('data-tone'))) return true;
    }
    return false;
  };
  /** The nearest box at or above `el`, up to its cell: what lays out a piece of text. */
  const leafOf = (el, cell) => {
    for (let e = el; e && e !== cell; e = e.parentElement) {
      const d = style(e).display;
      if (d !== 'inline' && d !== 'contents') return e;
    }
    return cell;
  };
  const isFlexRow = e => {
    const s = style(e);
    return (s.display === 'flex' || s.display === 'inline-flex') && s.flexDirection.startsWith('row');
  };
  /**
   * What reads as one value: the leaf, or the row of flex items it is part
   * of ("144 vCPUs", "·", "1152 GiB" as three spans), whose wrapping
   * shows only across its items.
   */
  const unitOf = (leaf, cell) => {
    let u = leaf;
    while (u !== cell && u.parentElement && cell.contains(u.parentElement) && isFlexRow(u.parentElement)) {
      u = u.parentElement;
    }
    return u;
  };
  /** Lines: boxes that start below the middle of the line before. */
  const linesOf = rects => {
    let lines = 0;
    let lineBottom = -Infinity;
    for (const r of [...rects].sort((a, b) => a.y - b.y)) {
      if (r.y >= lineBottom - r.h / 2) lines++;
      lineBottom = Math.max(lineBottom, r.y + r.h);
    }
    return lines;
  };
  const px = v => parseFloat(v) || 0;
  const cells = [];
  const space = [];
  const vanished = [];
  /**
   * Whether an element in a cell takes room of its own, beside its text: an
   * icon, a control, a progress bar or meter, a status dot, a badge, a box
   * drawn with a background or a border.
   */
  const takesRoom = e => {
    if (e.matches('svg, img, [role=img]')) return !e.parentElement?.closest('svg');
    if (e.closest('svg')) return false;
    if (e.matches(`${CONTROL}, [role=progressbar], [role=meter], progress, meter, [data-tone]`)) return true;
    if ([...e.classList].some(c => BADGE_CLASS.test(c))) return true;
    const st = style(e);
    const painted = c => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);
    return (
      painted(st.backgroundColor) ||
      st.backgroundImage !== 'none' ||
      ['Top', 'Right', 'Bottom', 'Left'].some(
        side => px(st[`border${side}Width`]) > 0 && st[`border${side}Style`] !== 'none',
      )
    );
  };
  /**
   * Whether text whose box has no width was squeezed there by the table's
   * layout, rather than hidden on purpose: rendered, a line high, and not
   * under `aria-hidden`, `data-layout-check="ignore"`, a visually-hidden box
   * (taken out of the flow, clipped, a pixel each way) or `max-width: 0`.
   */
  const squeezedToNothing = (el, cell) => {
    if (!rendered(el) || ignored(el) || rectOf(el).height <= 1) return false;
    for (let e = el; e && e !== cell; e = e.parentElement) {
      if (e.getAttribute('aria-hidden') === 'true') return false;
      const st = style(e);
      if (['absolute', 'fixed'].includes(st.position)) return false;
      if ((st.clip && st.clip !== 'auto') || st.clipPath !== 'none') return false;
      if (st.maxWidth === '0px') return false;
      const r = rectOf(e);
      if (r.width <= 1 && r.height <= 1) return false;
    }
    return true;
  };
  for (const cell of body.querySelectorAll(CELL)) {
    if (ignored(cell) || !visible(cell)) continue;
    const table = tableOf(cell);
    if (!table) continue;
    const header = isHeader(cell);
    const cs = style(cell);
    const cr = rectOf(cell);
    // The cell's content box: text past it spills over the next column.
    const innerLeft = cr.left + cell.clientLeft + px(cs.paddingLeft);
    const innerRight = cr.left + cell.clientLeft + cell.clientWidth - px(cs.paddingRight);
    const leaves = new Map();
    const vanishedNodes = [];
    const tw = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let node = tw.nextNode(); node; node = tw.nextNode()) {
      const parent = node.parentElement;
      if (!node.nodeValue.trim() || !parent || SKIP_TEXT.has(parent.tagName)) continue;
      // A cell nested in this one is measured on its own.
      if (parent.closest(CELL) !== cell) continue;
      if (!visible(parent)) {
        if (squeezedToNothing(parent, cell)) vanishedNodes.push(node);
        continue;
      }
      const leaf = leafOf(parent, cell);
      if (!leaves.has(leaf)) leaves.set(leaf, { nodes: [], rects: [], shown: [] });
      leaves.get(leaf).nodes.push(node);
    }
    const col = columnOf(cell);
    const common = {
      role: roleOf(cell),
      box: box(cr),
      table: idOf(table),
      row: idOf(cell.parentElement),
      col,
      column: header ? undefined : headersOf(table).get(col),
      header,
    };
    const units = new Map();
    for (const [leaf, entry] of leaves) {
      let neededX = 0;
      let shownX = 0;
      let neededY = 0;
      let shownY = 0;
      let cutX = false;
      let cutY = false;
      for (const node of entry.nodes) {
        const chain = clipChain(node.parentElement).filter(c => cell.contains(c.el));
        range.selectNodeContents(node);
        for (const r of [...range.getClientRects()].map(box)) {
          if (r.w <= 1 || r.h <= 1) continue;
          entry.rects.push(r);
          const { rect, clipper } = applyClip(r, chain);
          const shown = clipper ? rect : r;
          // Spilling out of the cell paints over the next column.
          const left = Math.max(shown ? shown.x : r.x, innerLeft);
          const right = Math.min(shown ? shown.x + shown.w : r.x, innerRight);
          const w = shown ? Math.max(0, right - left) : 0;
          const h = shown ? shown.h : 0;
          if (w > 0) entry.shown.push([left, left + w]);
          if (w < r.w - 1) cutX = true;
          // Down: at least half a line hidden, not a descender's pixel or two.
          else if (h < r.h / 2) cutY = true;
          neededX += r.w;
          shownX += w;
          neededY += r.h;
          shownY += h;
        }
      }
      if (entry.rects.length === 0) continue;
      const text = norm(entry.nodes.map(n => n.nodeValue).join(''));
      const cut = cutX || cutY;
      let ellipsis = false;
      let fullText = false;
      if (cut) {
        for (let e = entry.nodes[0].parentElement; e && e !== cell.parentElement; e = e.parentElement) {
          const s = style(e);
          if (s.textOverflow === 'ellipsis' && hides(s.overflowX)) ellipsis = true;
          if (s.webkitLineClamp && s.webkitLineClamp !== 'none') ellipsis = true;
          if (holdsFullText(e, text)) fullText = true;
        }
      }
      const status = isStatus(entry.nodes[0].parentElement, cell);
      cells.push({
        ...describe(leaf),
        ...common,
        kind: 'leaf',
        text: text.slice(0, 80),
        status,
        lines: linesOf(entry.rects),
        cut,
        axis: cutX || !cut ? 'x' : 'y',
        needed: round(cutX || !cut ? neededX : neededY),
        shown: round(cutX || !cut ? shownX : shownY),
        fontSize: px(style(leaf).fontSize) || 14,
        ellipsis,
        fullText,
      });
      const unit = unitOf(leaf, cell);
      if (unit !== leaf) {
        if (!units.has(unit)) units.set(unit, []);
        units.get(unit).push({ text, rects: entry.rects });
      }
    }
    for (const [unit, parts] of units) {
      if (parts.length < 2) continue;
      cells.push({
        ...describe(unit),
        ...common,
        kind: 'unit',
        text: parts.map(p => p.text).join(' ').slice(0, 80),
        // Badges side by side are a list, which may wrap: a row of items is
        // a short value by its text's shape only.
        status: false,
        lines: linesOf(parts.flatMap(p => p.rects)),
        cut: false,
      });
    }
    // How much of the cell's width its content takes: its text as painted
    // (cut where it is cut), and what else it lays out: icons, controls
    // (shown on hover or not), progress bars, status dots, badges and boxes
    // with a background or a border. What is left is room the column keeps
    // to spare in this row.
    const used = [...leaves.values()].flatMap(entry => entry.shown);
    const ew = document.createTreeWalker(cell, NodeFilter.SHOW_ELEMENT, {
      acceptNode: e =>
        ignored(e) || e.closest(CELL) !== cell
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    for (let e = ew.nextNode(); e; e = ew.nextNode()) {
      if (!takesRoom(e) || !laidOut(e)) continue;
      const r = rectOf(e);
      used.push([Math.max(r.left, innerLeft), Math.min(r.right, innerRight)]);
    }
    const spans = used.filter(([l, r]) => r > l);
    space.push({
      table: idOf(table),
      row: idOf(cell.parentElement),
      col,
      header,
      column: headersOf(table).get(col),
      inner: round(Math.max(0, innerRight - innerLeft)),
      used: spans.length
        ? round(Math.max(...spans.map(s => s[1])) - Math.min(...spans.map(s => s[0])))
        : 0,
    });
    // Text squeezed to no width, which `cells` leaves out (it cannot be
    // seen): only the squeezed-column check reads it.
    for (const node of vanishedNodes) {
      range.selectNodeContents(node);
      const needed = [...range.getClientRects()].reduce((sum, r) => sum + r.width, 0);
      if (needed <= 1) continue;
      const el = node.parentElement;
      vanished.push({
        ...describe(el),
        box: box(rectOf(el)),
        table: idOf(table),
        row: idOf(cell.parentElement),
        col,
        column: headersOf(table).get(col),
        header,
        text: norm(node.nodeValue).slice(0, 80),
        needed: round(needed),
        shown: 0,
        fontSize: px(style(el).fontSize) || 14,
      });
    }
  }

  // Tables wider than the box that holds them: one that scrolls sideways or
  // cuts them off. A table is one with column headers, or with a row of two
  // or more cells (a tag group or a list of one cell per row is no table).
  // `data-layout-check="scroll-x"` on the table or an ancestor up to the
  // scroll container says it scrolls sideways by design (a log view).
  const ROW = '[role=row], tr';
  /** The table's name as a person finds it: its label, caption or heading. */
  const tableNameOf = t => {
    const by = t.getAttribute('aria-labelledby');
    if (by) {
      const text = norm(by.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' '));
      if (text) return text.slice(0, 60);
    }
    const caption = t.querySelector(':scope > caption');
    if (caption && norm(caption.textContent)) return norm(caption.textContent).slice(0, 60);
    const label = norm(t.getAttribute('aria-label'));
    // bui's Table calls every table "Data table".
    if (label && !/^data ?table$/i.test(label)) return label.slice(0, 60);
    // The last heading before the table, in the nearest ancestor holding one.
    const HEADING = 'h1, h2, h3, h4, h5, h6, [role=heading]';
    for (let e = t.parentElement; e && e !== body; e = e.parentElement) {
      const before = [...e.querySelectorAll(HEADING)].filter(
        h =>
          visible(h) &&
          !t.contains(h) &&
          h.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      if (before.length) return norm(before[before.length - 1].textContent).slice(0, 60);
    }
    return label || '';
  };
  const tableScrolls = [];
  for (const t of body.querySelectorAll(TABLE)) {
    if (ignored(t) || !visible(t)) continue;
    // A table nested in another's cell is measured with the outer table.
    if (t.parentElement?.closest(TABLE)) continue;
    const tableLike =
      tableOf(t.querySelector(CELL) ?? t) === t ||
      [...t.querySelectorAll(ROW)].some(
        r => r.closest(TABLE) === t && r.querySelectorAll(CELL).length >= 2,
      );
    if (!tableLike) continue;
    const tr = rectOf(t);
    let allowed = false;
    for (let e = t; e && e !== doc && e !== body; e = e.parentElement) {
      if (e.getAttribute('data-layout-check') === 'scroll-x') allowed = true;
      const s = style(e);
      if (s.overflowX === 'visible') continue;
      if (e.scrollWidth <= e.clientWidth + 1) continue;
      // This box is wider inside than out: is it the table that makes it?
      const er = rectOf(e);
      const innerLeft = er.left + e.clientLeft;
      const innerRight = innerLeft + e.clientWidth;
      const wider =
        tr.width > e.clientWidth + 1 ||
        tr.right > innerRight + 1 ||
        tr.left < innerLeft - 1 ||
        (e === t && t.scrollWidth > t.clientWidth + 1);
      if (!wider) continue;
      const width = e === t ? t.scrollWidth : tr.width;
      tableScrolls.push({
        role: roleOf(t),
        name: tableNameOf(t),
        path: pathOf(t),
        box: box(tr),
        columns: [...headersOf(t).values()].filter(Boolean).slice(0, 8),
        // Named by its path: its text is the whole table's.
        container: { role: roleOf(e), name: '', path: pathOf(e), box: box({ x: innerLeft, y: er.top, w: e.clientWidth, h: er.height }) },
        width: round(width),
        client: e.clientWidth,
        // What sticks out past each edge of the box, as it is scrolled now.
        overLeft: round(Math.max(0, innerLeft - tr.left)),
        overRight: round(Math.max(0, tr.right - innerRight)),
        cut: hides(s.overflowX),
        allowed,
      });
      break;
    }
  }

  // Text cut off by its own box, where it hides its overflow (a scroll
  // container lets a person scroll to the rest).
  const truncated = [];
  for (const el of textHolders) {
    if (!visible(el)) continue;
    const s = style(el);
    const cutX = hides(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
    const fontSize = parseFloat(s.fontSize) || 14;
    const lineHeight = parseFloat(s.lineHeight) || fontSize * 1.2;
    // Down: at least half a line hidden, not a descender's pixel or two.
    const cutY =
      hides(s.overflowY) && el.scrollHeight - el.clientHeight >= lineHeight / 2;
    if (!cutX && !cutY) continue;
    // Text in a table is the `table-fit` rule's.
    if (tableCellOf(el)) continue;
    const axis = cutX ? 'x' : 'y';
    let fullText = false;
    for (let e = el, depth = 0; e && e !== doc && depth < 4; e = e.parentElement, depth++) {
      if (holdsFullText(e, el.textContent)) fullText = true;
    }
    truncated.push({
      ...describe(el),
      layer: layerIdOf(el),
      box: box(rectOf(el)),
      text: norm(el.textContent).slice(0, 80),
      needed: axis === 'x' ? el.scrollWidth : el.scrollHeight,
      shown: axis === 'x' ? el.clientWidth : el.clientHeight,
      axis,
      fontSize,
      ellipsis:
        axis === 'x'
          ? s.textOverflow === 'ellipsis'
          : s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '',
      fullText,
    });
  }

  // Wider than the viewport: the page scrolls sideways, or an element sticks
  // out where nothing scrolls.
  const sticking = [];
  for (const el of visibleControls.concat(visibleIcons)) {
    const r = rectOf(el);
    if (r.right <= viewport.w + 1 && r.left >= -1) continue;
    let contained = false;
    for (let e = el.parentElement; e && e !== doc && e !== body; e = e.parentElement) {
      if (style(e).overflowX !== 'visible') contained = true;
    }
    if (!contained) sticking.push({ ...describe(el), box: box(r) });
  }

  return {
    viewport,
    scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
    // The page cuts off what is wider instead of scrolling to it.
    clipsX: [doc, body].some(e => hides(style(e).overflowX)),
    items,
    centering,
    flexRows,
    truncated,
    cells,
    space,
    vanished,
    tableScrolls,
    sticking,
  };
}
