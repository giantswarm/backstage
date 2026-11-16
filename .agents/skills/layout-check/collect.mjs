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
  const viewport = { w: doc.clientWidth, h: window.innerHeight };

  const CONTROL =
    'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=combobox], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=slider], [role=spinbutton], [role=searchbox], [role=textbox]';
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

  const styles = new Map();
  const style = el => {
    let s = styles.get(el);
    if (!s) {
      s = getComputedStyle(el);
      styles.set(el, s);
    }
    return s;
  };

  const round = n => Math.round(n * 10) / 10;
  const box = r => ({ x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) });
  const intersect = (a, b) => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.w, b.x + b.w);
    const btm = Math.min(a.y + a.h, b.y + b.h);
    return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : undefined;
  };

  const ignored = el => ignore.some(sel => el.closest(sel)) || el.closest('[data-layout-check="ignore"]');

  /** Visible as a person sees it: rendered, not transparent, more than a hairline. */
  const visible = el => {
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    ) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

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
  const layerOf = el => {
    for (let e = el; e && e !== doc; e = e.parentElement) {
      const s = style(e);
      if (s.position === 'fixed' || s.position === 'sticky') return e;
      if (s.position === 'absolute' && s.zIndex !== 'auto') return e;
      const role = e.getAttribute('role');
      if (role && LAYER_ROLES.has(role)) return e;
      if (e.hasAttribute('popover') || e.tagName === 'DIALOG') return e;
    }
    return undefined;
  };

  /**
   * What of `el` is not cut off by an ancestor's overflow, and the nearest
   * ancestor that cuts it without letting a person scroll to the rest.
   */
  const clipOf = el => {
    let rect = box(el.getBoundingClientRect());
    let clipper;
    for (let e = el.parentElement; e && e !== doc && e !== document.body; e = e.parentElement) {
      const s = style(e);
      const cutsX = s.overflowX !== 'visible';
      const cutsY = s.overflowY !== 'visible';
      if (!cutsX && !cutsY) {
        if (s.position === 'fixed') break;
        continue;
      }
      const r = e.getBoundingClientRect();
      const inner = {
        x: r.left + e.clientLeft,
        y: r.top + e.clientTop,
        w: cutsX ? e.clientWidth : Number.MAX_SAFE_INTEGER / 4,
        h: cutsY ? e.clientHeight : Number.MAX_SAFE_INTEGER / 4,
      };
      if (!cutsX) inner.x = -Number.MAX_SAFE_INTEGER / 8;
      if (!cutsY) inner.y = -Number.MAX_SAFE_INTEGER / 8;
      const next = intersect(rect, inner);
      const cutX = cutsX && (!next || next.w < rect.w - 1);
      const cutY = cutsY && (!next || next.h < rect.h - 1);
      const hides = v => v === 'hidden' || v === 'clip';
      if ((cutX || cutY) && clipper === undefined) {
        // Cut by a scroll container: a person scrolls to the rest, unless
        // it hides that axis.
        clipper = (cutX && hides(s.overflowX)) || (cutY && hides(s.overflowY)) ? e : null;
      }
      if (!next) return { rect: undefined, clipper };
      rect = next;
      if (s.position === 'fixed') break;
    }
    return { rect, clipper };
  };

  const scrollerOf = el => {
    for (let e = el.parentElement; e && e !== doc && e !== document.body; e = e.parentElement) {
      const s = style(e);
      if (['auto', 'scroll'].includes(s.overflowY) || ['auto', 'scroll'].includes(s.overflowX)) return e;
    }
    return undefined;
  };

  /** Position in the content of the nearest scroll container. */
  const contentPos = el => {
    const r = el.getBoundingClientRect();
    const sc = scrollerOf(el);
    if (!sc) return { x: round(r.left + window.scrollX), y: round(r.top + window.scrollY), w: round(r.width), h: round(r.height) };
    const sr = sc.getBoundingClientRect();
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
        return ['button', 'submit', 'reset'].includes(el.type) ? 'button' : el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'textbox';
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
      if (text) return text.replace(/\s+/g, ' ').slice(0, 60);
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return (el.getAttribute('placeholder') || el.name || '').slice(0, 60);
    }
    return (el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  };

  /** A short CSS-like path: the last few ancestors, with an id or a class. */
  const pathOf = el => {
    const parts = [];
    for (let e = el; e && e !== doc && parts.length < 4; e = e.parentElement) {
      let part = e.tagName.toLowerCase();
      if (e.id && !/^[:r]|react-aria/.test(e.id)) part += `#${e.id}`;
      else {
        const cls = [...e.classList].find(c => /^(bui-|Mui[A-Z])/.test(c)) || [...e.classList].find(c => !/^(jss|makeStyles-|css-)\d*/.test(c) && !/-\d+$/.test(c));
        if (cls) part += `.${cls}`;
      }
      parts.unshift(part);
    }
    return parts.join(' > ');
  };

  /** A key that stays the same for the same element across states: its place in the tree. */
  const keyOf = el => {
    const parts = [];
    for (let e = el; e && e !== doc; e = e.parentElement) {
      const parent = e.parentElement;
      const index = parent ? [...parent.children].filter(c => c.tagName === e.tagName).indexOf(e) : 0;
      parts.unshift(`${e.tagName.toLowerCase()}${index > 0 ? `[${index}]` : ''}`);
    }
    return parts.join('/');
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
      if (style(e).position === 'absolute') return e;
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

  // Controls.
  const controls = [...document.querySelectorAll(CONTROL)].filter(el => visible(el) && !ignored(el));
  for (const el of controls) {
    const { rect, clipper } = clipOf(el);
    // Visually hidden (a native select behind a custom one): cut to a pixel.
    if (!rect || rect.w <= 1 || rect.h <= 1) continue;
    const full = box(el.getBoundingClientRect());
    add(el, 'control', [rect], {
      box: full,
      pos: contentPos(el),
      key: keyOf(el),
      inList: inList(el),
      clippedBy: clipper && (rect.w < full.w - 1 || rect.h < full.h - 1) ? describe(clipper) : undefined,
    });
  }

  // Icons: the outermost svg, images.
  const icons = [...document.querySelectorAll('svg, img, [role=img]')].filter(
    el => !el.parentElement?.closest('svg') && visible(el) && !ignored(el),
  );
  for (const el of icons) {
    const { rect } = clipOf(el);
    if (!rect || rect.w <= 1 || rect.h <= 1) continue;
    add(el, 'icon', [rect]);
  }

  // Text: each text node's line boxes.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: node =>
      node.nodeValue.trim() && node.parentElement && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION'].includes(node.parentElement.tagName)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!visible(el) || ignored(el)) continue;
    const { rect: clip } = clipOf(el);
    if (!clip) continue;
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()]
      .map(box)
      .map(r => intersect(r, clip))
      .filter(r => r && r.w > 1 && r.h > 1);
    if (rects.length === 0) continue;
    add(el, 'text', rects, { text: node.nodeValue.trim().slice(0, 60) });
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

  // Content of button-like controls, for the centering rule.
  const centering = [];
  for (const el of controls) {
    const role = roleOf(el);
    if (!['button', 'tab', 'combobox', 'link', 'menuitem', 'switch'].includes(role)) continue;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') continue;
    const s = style(el);
    if (s.display.startsWith('inline') && !s.display.includes('flex') && !s.display.includes('grid') && !s.display.includes('block')) continue;
    const r = el.getBoundingClientRect();
    const contentBoxes = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = tw.nextNode(); node; node = tw.nextNode()) {
      if (!node.nodeValue.trim() || !visible(node.parentElement)) continue;
      if (style(node.parentElement).position === 'absolute') continue;
      range.selectNodeContents(node);
      for (const cr of range.getClientRects()) if (cr.width > 1 && cr.height > 1) contentBoxes.push(box(cr));
    }
    for (const icon of el.querySelectorAll('svg, img')) {
      if (icon.parentElement?.closest('svg') || !visible(icon)) continue;
      let positioned = false;
      for (let e = icon; e && e !== el; e = e.parentElement) {
        if (style(e).position === 'absolute') positioned = true;
      }
      if (!positioned) contentBoxes.push(box(icon.getBoundingClientRect()));
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
      } else if (n.nodeType === Node.ELEMENT_NODE && visible(n) && !['absolute', 'fixed'].includes(style(n).position)) {
        flowBoxes.push(box(n.getBoundingClientRect()));
      }
    }
    const fx = flowBoxes.length ? Math.min(...flowBoxes.map(b => b.x)) : content.x;
    const flow = flowBoxes.length
      ? { x: fx, w: round(Math.max(...flowBoxes.map(b => b.x + b.w)) - fx) }
      : { x: content.x, w: content.w };
    const px = v => parseFloat(v) || 0;
    centering.push({
      flow,
      ...describe(el),
      layer: layerOf(el) ? idOf(layerOf(el)) : 0,
      box: box(r),
      content,
      padding: {
        top: px(s.paddingTop) + px(s.borderTopWidth),
        right: px(s.paddingRight) + px(s.borderRightWidth),
        bottom: px(s.paddingBottom) + px(s.borderBottomWidth),
        left: px(s.paddingLeft) + px(s.borderLeftWidth),
      },
      centeredX:
        (s.display.includes('flex') && s.flexDirection.startsWith('row') && s.justifyContent === 'center') ||
        (!s.display.includes('flex') && !s.display.includes('grid') && s.textAlign === 'center'),
    });
  }

  // Rows of a flex container, for the alignment rule: each in-flow child's
  // box and the boxes of the controls inside it.
  const flexRows = [];
  const flexContainers = [...document.querySelectorAll('body *')].filter(el => {
    const s = style(el);
    return (s.display === 'flex' || s.display === 'inline-flex') && s.flexDirection.startsWith('row') && !ignored(el);
  });
  for (const el of flexContainers) {
    const children = [...el.children].filter(c => visible(c) && !['absolute', 'fixed'].includes(style(c).position));
    if (children.length < 2) continue;
    const rows = children.map(c => ({
      ...describe(c),
      box: box(c.getBoundingClientRect()),
      controls: (c.matches(CONTROL) ? [c] : [...c.querySelectorAll(CONTROL)])
        .filter(x => visible(x) && layerOf(x) === layerOf(el))
        .map(x => ({ ...describe(x), box: box(x.getBoundingClientRect()) })),
    }));
    if (rows.filter(r => r.controls.length > 0).length < 2) continue;
    flexRows.push({ ...describe(el), layer: layerOf(el) ? idOf(layerOf(el)) : 0, children: rows });
  }

  // Text cut off by its own box.
  const truncated = [];
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim())) continue;
    if (!visible(el) || ignored(el)) continue;
    const s = style(el);
    const cutX = s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
    const cutY = s.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1 && s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '';
    if (!cutX && !cutY) continue;
    let fullText = false;
    for (let e = el, depth = 0; e && e !== doc && depth < 4; e = e.parentElement, depth++) {
      if (e.title || e.getAttribute('aria-describedby') || e.getAttribute('data-full-text')) fullText = true;
    }
    truncated.push({
      ...describe(el),
      layer: layerOf(el) ? idOf(layerOf(el)) : 0,
      box: box(el.getBoundingClientRect()),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      needed: cutY && !cutX ? el.scrollHeight : el.scrollWidth,
      shown: cutY && !cutX ? el.clientHeight : el.clientWidth,
      axis: cutY && !cutX ? 'y' : 'x',
      fontSize: parseFloat(s.fontSize) || 14,
      ellipsis: s.textOverflow === 'ellipsis' || (cutY && !cutX),
      fullText,
    });
  }

  // Wider than the viewport: the page scrolls sideways, or an element sticks
  // out where nothing scrolls.
  const sticking = [];
  for (const el of controls.concat(icons)) {
    const r = el.getBoundingClientRect();
    if (r.right <= viewport.w + 1 && r.left >= -1) continue;
    let scrolls = false;
    for (let e = el.parentElement; e && e !== doc && e !== document.body; e = e.parentElement) {
      const sx = style(e).overflowX;
      if (sx === 'auto' || sx === 'scroll' || sx === 'hidden' || sx === 'clip') scrolls = true;
    }
    if (!scrolls) sticking.push({ ...describe(el), box: box(r) });
  }

  return {
    viewport,
    scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
    items,
    centering,
    flexRows,
    truncated,
    sticking,
  };
}
