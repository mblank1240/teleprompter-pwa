// Turns arbitrary HTML (pasted or imported) into a small, safe subset that the
// editor and prompter understand. Anything not on the allow-list is unwrapped,
// so its text survives but its tags, scripts and attributes do not.

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
const INLINE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SPAN', 'MARK', 'FONT', 'BR']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'HEAD', 'TITLE', 'META', 'LINK', 'SVG', 'MATH']);
const STYLE_PROPS = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration-line', 'text-align'];

function cleanStyle(el, isBlock) {
  const out = [];
  for (const prop of STYLE_PROPS) {
    let value = el.style.getPropertyValue(prop);
    if (prop === 'text-decoration-line' && !value) value = el.style.getPropertyValue('text-decoration');
    if (!value) continue;
    value = value.trim();
    if (prop === 'text-align') {
      if (isBlock && /^(left|center|right|justify)$/.test(value)) out.push(`text-align: ${value}`);
      continue;
    }
    if ((prop === 'color' || prop === 'background-color')) {
      if (!CSS.supports('color', value) || /transparent|rgba\([^)]*,\s*0\)/.test(value)) continue;
    }
    if (prop === 'text-decoration-line') {
      const parts = value.split(/\s+/).filter(v => v === 'underline' || v === 'line-through');
      if (parts.length) out.push(`text-decoration: ${parts.join(' ')}`);
      continue;
    }
    if (prop === 'font-weight' && !/^(bold|bolder|[6-9]00)$/.test(value)) continue;
    if (prop === 'font-style' && value !== 'italic') continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

function cleanNode(node, doc) {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.nodeValue);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = node.tagName.toUpperCase();
  if (DROP_TAGS.has(tag)) return null;

  const children = () => {
    const frag = doc.createDocumentFragment();
    for (const child of node.childNodes) {
      const c = cleanNode(child, doc);
      if (c) frag.appendChild(c);
    }
    return frag;
  };

  if (tag === 'BR') return doc.createElement('br');

  if (BLOCK_TAGS.has(tag) || INLINE_TAGS.has(tag)) {
    const isBlock = BLOCK_TAGS.has(tag);
    // <font color> -> <span style="color">
    let el;
    if (tag === 'FONT') {
      el = doc.createElement('span');
      const color = node.getAttribute('color');
      if (color && CSS.supports('color', color)) el.style.color = color;
    } else {
      el = doc.createElement(tag === 'STRIKE' || tag === 'DEL' ? 's' : tag.toLowerCase());
    }
    const style = cleanStyle(node, isBlock);
    if (style) el.setAttribute('style', (el.getAttribute('style') ? el.getAttribute('style') + '; ' : '') + style);
    el.appendChild(children());
    // Drop spans that carry nothing
    if (el.tagName === 'SPAN' && !el.getAttribute('style')) {
      const frag = doc.createDocumentFragment();
      while (el.firstChild) frag.appendChild(el.firstChild);
      return frag;
    }
    return el;
  }

  // Unknown tags: keep their content. Treat table rows / sections as blocks.
  const frag = children();
  if (/^(TR|SECTION|ARTICLE|HEADER|FOOTER|MAIN|H4|H5|H6|PRE|TABLE|TBODY|FIGURE)$/.test(tag)) {
    const div = doc.createElement('div');
    div.appendChild(frag);
    return div;
  }
  return frag;
}

export function sanitizeHtml(html) {
  const src = new DOMParser().parseFromString(html, 'text/html');
  const doc = document.implementation.createHTMLDocument('');
  const container = doc.createElement('div');
  for (const child of src.body.childNodes) {
    const c = cleanNode(child, doc);
    if (c) container.appendChild(c);
  }
  return container.innerHTML.trim();
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Plain text -> one <div> per line (matches what contenteditable produces).
export function textToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => (line.trim() ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>'))
    .join('');
}

// Very small Markdown subset: **bold**, *italic*, # headings. Everything else stays text.
export function markdownToHtml(md) {
  return md
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => {
      if (!line.trim()) return '<div><br></div>';
      let html = escapeHtml(line)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
        .replace(/__(.+?)__/g, '<b>$1</b>');
      const h = /^(#{1,3})\s+(.*)$/.exec(html);
      if (h) return `<h${h[1].length}>${h[2]}</h${h[1].length}>`;
      return `<div>${html}</div>`;
    })
    .join('');
}

// Rich HTML -> plain text, keeping line breaks between blocks.
export function htmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const lines = [];
  let current = '';
  let afterBr = false; // a <br> already ended the line, so the block end shouldn't again
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) { current += node.nodeValue; afterBr = false; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === 'BR') { lines.push(current); current = ''; afterBr = true; return; }
    const block = BLOCK_TAGS.has(node.tagName);
    if (block && current) { lines.push(current); current = ''; }
    const startLines = lines.length;
    node.childNodes.forEach(walk);
    if (block) {
      // Push the trailing line, or an empty one for a block that produced nothing.
      if (current || (lines.length === startLines && !afterBr)) lines.push(current);
      current = '';
      afterBr = false;
    }
  };
  div.childNodes.forEach(walk);
  if (current) lines.push(current);
  return lines.join('\n').trim() + '\n';
}
