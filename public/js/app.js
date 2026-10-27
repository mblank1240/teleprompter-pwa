import {
  loadSettings, saveSettings, loadScripts, saveScripts,
  getCurrentId, setCurrentId, newId,
} from './storage.js';
import { sanitizeHtml, textToHtml, htmlToText } from './sanitize.js';
import { readScriptFile, buildTextFile, buildHtmlFile, saveFile } from './files.js';
import { Prompter } from './prompter.js';

const $ = id => document.getElementById(id);

// ---------- options ----------

const FONTS = [
  { id: 'system', label: 'System', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id: 'rounded', label: 'Rounded', stack: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", -apple-system, sans-serif' },
  { id: 'helvetica', label: 'Helvetica Neue', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'avenir', label: 'Avenir Next', stack: '"Avenir Next", Avenir, "Segoe UI", sans-serif' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet', stack: '"Trebuchet MS", sans-serif' },
  { id: 'gill', label: 'Gill Sans', stack: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, serif' },
  { id: 'newyork', label: 'New York', stack: 'ui-serif, "New York", Georgia, serif' },
  { id: 'palatino', label: 'Palatino', stack: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { id: 'times', label: 'Times', stack: '"Times New Roman", Times, serif' },
  { id: 'baskerville', label: 'Baskerville', stack: 'Baskerville, "Baskerville Old Face", Georgia, serif' },
  { id: 'mono', label: 'Monospace', stack: 'ui-monospace, Menlo, "SF Mono", Consolas, monospace' },
];
const LINE_HEIGHTS = [1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3];
const LETTER_SPACINGS = [
  { v: -0.02, label: 'Tight' }, { v: 0, label: 'Normal' }, { v: 0.03, label: 'Wide' },
  { v: 0.06, label: 'Wider' }, { v: 0.1, label: 'Widest' },
];
const TEXT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#ec4899', '#ffffff', '#9ca3af', '#4b5563', '#111111'];
const HIGHLIGHTS = ['#fde047', '#fdba74', '#fca5a5', '#f9a8d4', '#c4b5fd', '#93c5fd',
  '#67e8f9', '#86efac', '#bef264', '#e5e7eb', '#fef3c7', '#d9f99d'];
const EDITOR_FONT_MIN = 12;
const EDITOR_FONT_MAX = 48;
const WORDS_PER_MINUTE = 150;

const WELCOME_HTML = [
  '<h2>Welcome to your teleprompter</h2>',
  '<div>Type or paste your script here. Use the toolbar for <b>bold</b>, <i>italic</i>, <span style="color: #ef4444">colors</span> and <span style="background-color: #fde047">highlights</span>.</div>',
  '<div><br></div>',
  '<div>Font, line spacing and letter spacing apply to the whole script, in both the editor and the prompter.</div>',
  '<div><br></div>',
  '<div>When you are ready, tap <b>Prompt</b>. In the prompter:</div>',
  '<div>• Tap the screen to show or hide the controls.</div>',
  '<div>• Touch and drag the text to pause and scrub. Let go and it keeps scrolling.</div>',
  '<div>• Set speed, text size, mirroring, scroll direction and a countdown before it starts.</div>',
  '<div>• With a keyboard: Space plays or pauses, ← → change speed, ↑ ↓ nudge, Esc exits.</div>',
  '<div><br></div>',
  '<div>Scripts save automatically on this device. Use the file menu to import and export .txt or .html files.</div>',
].join('');

// ---------- state ----------

const settings = loadSettings();
let scripts = loadScripts();
let current = null;
let savedRange = null;
let saveTimer = 0;

const editor = $('editor');
const titleInput = $('script-title');

const prompter = new Prompter({
  onChange: () => saveSettings(settings),
  onExit: () => {
    document.body.classList.remove('prompting');
    editor.focus({ preventScroll: true });
  },
});

// ---------- theme & text settings ----------

function fontStack() {
  return (FONTS.find(f => f.id === settings.fontFamily) || FONTS[0]).stack;
}

function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.theme);
  $('btn-theme').title = `Theme: ${settings.theme[0].toUpperCase() + settings.theme.slice(1)}`;
}

function applyTextSettings() {
  const root = document.documentElement.style;
  root.setProperty('--script-font', fontStack());
  root.setProperty('--script-line-height', settings.lineHeight);
  root.setProperty('--script-letter-spacing', settings.letterSpacing + 'em');
  root.setProperty('--editor-font-size', settings.editorFontSize + 'px');
  $('font-family').value = settings.fontFamily;
  $('line-height').value = settings.lineHeight;
  $('letter-spacing').value = settings.letterSpacing;
  $('font-size-label').textContent = settings.editorFontSize;
}

function updateSetting(key, value) {
  settings[key] = value;
  saveSettings(settings);
  applyTextSettings();
}

function buildSelects() {
  $('font-family').innerHTML = FONTS
    .map(f => `<option value="${f.id}" style="font-family:${f.stack.replace(/"/g, "'")}">${f.label}</option>`).join('');
  $('line-height').innerHTML = LINE_HEIGHTS.map(v => `<option value="${v}">${v.toFixed(2).replace(/0$/, '')}</option>`).join('');
  $('letter-spacing').innerHTML = LETTER_SPACINGS.map(o => `<option value="${o.v}">${o.label}</option>`).join('');

  $('font-family').addEventListener('change', e => updateSetting('fontFamily', e.target.value));
  $('line-height').addEventListener('change', e => updateSetting('lineHeight', +e.target.value));
  $('letter-spacing').addEventListener('change', e => updateSetting('letterSpacing', +e.target.value));
  $('font-down').addEventListener('click', () =>
    updateSetting('editorFontSize', Math.max(EDITOR_FONT_MIN, settings.editorFontSize - 2)));
  $('font-up').addEventListener('click', () =>
    updateSetting('editorFontSize', Math.min(EDITOR_FONT_MAX, settings.editorFontSize + 2)));
}

$('btn-theme').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
  saveSettings(settings);
  applyTheme();
  toast(`Theme: ${settings.theme === 'auto' ? 'match system' : settings.theme}`);
});

// ---------- scripts ----------

function createScript(title = '', html = '') {
  const script = { id: newId(), title, html, createdAt: Date.now(), updatedAt: Date.now() };
  scripts.unshift(script);
  saveScripts(scripts);
  return script;
}

function openScript(script) {
  flushSave();
  current = script;
  setCurrentId(script.id);
  editor.innerHTML = script.html;
  titleInput.value = script.title;
  $('editor-wrap').scrollTop = 0;
  savedRange = null;
  updateCounts();
  renderLibrary();
}

function scheduleSave() {
  $('save-status').textContent = 'Editing…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}

function flushSave() {
  clearTimeout(saveTimer);
  if (!current) return;
  const html = editor.innerHTML;
  const title = titleInput.value.trim();
  if (html === current.html && title === current.title) return;
  current.html = html;
  current.title = title;
  current.updatedAt = Date.now();
  // Most recently edited first
  scripts = [current, ...scripts.filter(s => s.id !== current.id)];
  const ok = saveScripts(scripts);
  $('save-status').textContent = ok ? 'Saved' : 'Not saved — storage full?';
  if (!$('library').hidden) renderLibrary();
}

function updateCounts() {
  const text = editor.innerText || '';
  const words = (text.match(/\S+/g) || []).length;
  $('word-count').textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
  const mins = words / WORDS_PER_MINUTE;
  $('read-time').textContent = words
    ? `≈ ${mins < 1 ? Math.max(1, Math.round(mins * 60)) + ' sec' : Math.round(mins) + ' min'} at ${WORDS_PER_MINUTE} wpm`
    : '';
}

function renderLibrary() {
  const list = $('script-list');
  list.innerHTML = '';
  for (const s of scripts) {
    const li = document.createElement('li');
    if (current && s.id === current.id) li.className = 'current';
    const btn = document.createElement('button');
    const title = document.createElement('span');
    title.className = 's-title';
    title.textContent = s.title || 'Untitled script';
    const meta = document.createElement('span');
    meta.className = 's-meta';
    const preview = htmlToText(s.html).replace(/\s+/g, ' ').trim().slice(0, 60);
    meta.textContent = `${new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${preview || 'Empty'}`;
    btn.append(title, meta);
    btn.addEventListener('click', () => { openScript(s); closeLibrary(); });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function openLibrary() {
  flushSave();
  renderLibrary();
  $('library').hidden = false;
  $('scrim').hidden = false;
}

function closeLibrary() {
  $('library').hidden = true;
  $('scrim').hidden = true;
}

$('btn-library').addEventListener('click', () => ($('library').hidden ? openLibrary() : closeLibrary()));
$('scrim').addEventListener('click', () => { closeLibrary(); closePopovers(); });
$('btn-new').addEventListener('click', () => { newScript(); closeLibrary(); });

function newScript() {
  openScript(createScript());
  editor.focus();
}

titleInput.addEventListener('input', scheduleSave);
titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(); } });

// ---------- editor & formatting ----------

editor.addEventListener('input', () => { scheduleSave(); updateCounts(); });

// iPad and desktop paste rich text from anywhere; keep only what we support.
editor.addEventListener('paste', e => {
  const data = e.clipboardData;
  if (!data) return;
  e.preventDefault();
  const html = data.getData('text/html');
  const clean = html ? sanitizeHtml(html) : textToHtml(data.getData('text/plain'));
  document.execCommand('insertHTML', false, clean);
});

// Remember the selection so toolbar buttons, selects and color pickers that take
// focus can still apply formatting to it.
document.addEventListener('selectionchange', () => {
  const sel = document.getSelection();
  if (sel.rangeCount && editor.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
    updateToolbarState();
  }
});

function restoreSelection() {
  const sel = document.getSelection();
  if (sel.rangeCount && editor.contains(sel.anchorNode)) return;
  editor.focus({ preventScroll: true });
  if (savedRange) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
}

function exec(cmd, value = null) {
  restoreSelection();
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, value);
  normalizeEditor();
  scheduleSave();
  updateCounts();
  updateToolbarState();
}

// execCommand leaves behind `background-color: transparent` / `color: inherit`
// spans when colors are removed; strip them so the markup stays clean.
function normalizeEditor() {
  for (const el of editor.querySelectorAll('[style]')) {
    const bg = el.style.backgroundColor;
    if (bg === 'transparent' || bg === 'initial' || bg === 'inherit' || /rgba\(0, 0, 0, 0\)/.test(bg)) el.style.removeProperty('background-color');
    if (el.style.color === 'inherit' || el.style.color === 'initial') el.style.removeProperty('color');
    if (!el.getAttribute('style').trim()) el.removeAttribute('style');
    if (el.tagName === 'SPAN' && !el.attributes.length) el.replaceWith(...el.childNodes);
  }
  for (const el of editor.querySelectorAll('font')) {
    const span = document.createElement('span');
    if (el.color) span.style.color = el.color;
    span.append(...el.childNodes);
    el.replaceWith(span);
  }
}

const STATE_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'justifyCenter'];
function updateToolbarState() {
  for (const cmd of STATE_CMDS) {
    const btn = document.querySelector(`.tool[data-cmd="${cmd}"]`);
    let on = false;
    try { on = document.queryCommandState(cmd); } catch { /* unsupported */ }
    btn && btn.classList.toggle('active', on);
  }
}

// Keep focus (and the iPad keyboard + selection) in the editor when tapping tools.
for (const el of document.querySelectorAll('.toolbar button, .popover .swatch, .popover .link-btn')) {
  el.addEventListener('mousedown', e => e.preventDefault());
}

for (const btn of document.querySelectorAll('.tool[data-cmd]')) {
  btn.addEventListener('click', () => exec(btn.dataset.cmd));
}

// ---------- color popovers ----------

function buildSwatches() {
  const make = (container, colors, kind) => {
    for (const c of colors) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c;
      b.setAttribute('aria-label', c);
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => applyColor(kind, c));
      container.appendChild(b);
    }
  };
  make(document.querySelector('.swatches[data-kind="color"]'), TEXT_COLORS, 'color');
  make(document.querySelector('.swatches[data-kind="highlight"]'), HIGHLIGHTS, 'highlight');

  $('custom-color').addEventListener('change', e => applyColor('color', e.target.value));
  $('custom-highlight').addEventListener('change', e => applyColor('highlight', e.target.value));
  for (const b of document.querySelectorAll('[data-reset]')) {
    b.addEventListener('click', () => applyColor(b.dataset.reset, null));
  }
}

function applyColor(kind, color) {
  closePopovers();
  if (kind === 'color') {
    exec('foreColor', color || 'inherit');
    if (color) $('color-bar').style.background = color;
  } else {
    // Safari and Chrome both understand hiliteColor; backColor is the fallback.
    restoreSelection();
    document.execCommand('styleWithCSS', false, true);
    const value = color || 'transparent';
    if (!document.execCommand('hiliteColor', false, value)) document.execCommand('backColor', false, value);
    normalizeEditor();
    scheduleSave();
    if (color) $('highlight-bar').style.background = color;
  }
}

const POPOVERS = { 'btn-color': 'pop-color', 'btn-highlight': 'pop-highlight', 'btn-file': 'pop-file' };

function closePopovers() {
  for (const [btn, pop] of Object.entries(POPOVERS)) {
    $(pop).hidden = true;
    $(btn).setAttribute('aria-expanded', 'false');
  }
}

function togglePopover(btnId) {
  const pop = $(POPOVERS[btnId]);
  const wasOpen = !pop.hidden;
  closePopovers();
  if (wasOpen) return;
  const btn = $(btnId);
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  pop.style.left = left + 'px';
  pop.style.top = r.bottom + 6 + 'px';
}

for (const id of Object.keys(POPOVERS)) {
  $(id).addEventListener('click', e => { e.stopPropagation(); togglePopover(id); });
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.popover') && !Object.keys(POPOVERS).some(id => $(id).contains(e.target))) closePopovers();
});

$('color-bar').style.background = TEXT_COLORS[0];
$('highlight-bar').style.background = HIGHLIGHTS[0];

// ---------- file menu ----------

$('pop-file').addEventListener('click', async e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  closePopovers();
  flushSave();
  switch (action) {
    case 'new':
      newScript();
      break;
    case 'import':
      $('file-input').value = '';
      $('file-input').click();
      break;
    case 'export-txt':
      reportSave(await saveFile(buildTextFile(current)));
      break;
    case 'export-html':
      reportSave(await saveFile(buildHtmlFile(current, { ...settings, fontStack: fontStack() })));
      break;
    case 'duplicate':
      openScript(createScript(`${current.title || 'Untitled script'} copy`, current.html));
      toast('Duplicated');
      break;
    case 'delete': {
      if (!confirm(`Delete “${current.title || 'Untitled script'}”? This can’t be undone.`)) return;
      scripts = scripts.filter(s => s.id !== current.id);
      saveScripts(scripts);
      current = null;
      openScript(scripts[0] || createScript());
      toast('Deleted');
      break;
    }
  }
});

function reportSave(result) {
  if (result === 'saved') toast('Saved to file');
  else if (result === 'downloaded') toast('Downloaded');
}

$('file-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { title, html } = await readScriptFile(file);
    openScript(createScript(title, html));
    toast(`Imported “${title}”`);
  } catch (err) {
    console.error(err);
    toast('Could not read that file');
  }
});

// Drag and drop a file onto the editor (desktop, Stage Manager on iPad).
document.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', async e => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  e.preventDefault();
  try {
    const { title, html } = await readScriptFile(file);
    openScript(createScript(title, html));
    toast(`Imported “${title}”`);
  } catch {
    toast('Could not read that file');
  }
});

// ---------- prompter ----------

function startPrompter() {
  flushSave();
  closePopovers();
  closeLibrary();
  if (!editor.innerText.trim()) {
    toast('Add some text first');
    return;
  }
  editor.blur();
  document.body.classList.add('prompting');
  prompter.open(editor.innerHTML, settings.prompter);
}

$('btn-start').addEventListener('click', startPrompter);

document.addEventListener('keydown', e => {
  if (prompter.isOpen) return;
  if (e.key === 'Escape') { closePopovers(); closeLibrary(); }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); startPrompter(); }
});

// ---------- misc ----------

let toastTimer = 0;
// `action` adds a button and keeps the toast up until it's used or dismissed.
function toast(msg, action) {
  const t = $('toast');
  t.textContent = msg;
  if (action) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.addEventListener('click', () => { t.hidden = true; action.run(); });
    t.appendChild(btn);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 15000 : 2200);
}

window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
  else checkForUpdate();
});

// ---------- updates ----------
// A home-screen app on iPad resumes without reloading, so it would keep running
// an old version after a deploy. On resume, compare the files' ETag/Last-Modified
// with what we loaded and offer a reload if anything changed.

const APP_FILES = ['index.html', 'css/styles.css', 'js/app.js', 'js/prompter.js',
  'js/storage.js', 'js/sanitize.js', 'js/files.js'];
let loadedFingerprint = null;
let updateOffered = false;

async function fingerprint() {
  const tags = await Promise.all(APP_FILES.map(async f => {
    const res = await fetch(f, { method: 'HEAD', cache: 'no-store' });
    return res.headers.get('etag') || res.headers.get('last-modified') || '';
  }));
  return tags.join('|');
}

async function checkForUpdate() {
  if (!navigator.onLine || updateOffered || prompter.isOpen) return;
  try {
    const now = await fingerprint();
    if (!loadedFingerprint) { loadedFingerprint = now; return; }
    if (now && now !== loadedFingerprint) {
      updateOffered = true;
      toast('A new version is available', {
        label: 'Reload',
        run: () => { flushSave(); location.reload(); },
      });
    }
  } catch { /* offline or blocked: try again next time */ }
}

// ---------- boot ----------

buildSelects();
buildSwatches();
applyTheme();
applyTextSettings();

if (!scripts.length) createScript('Welcome', WELCOME_HTML);
openScript(scripts.find(s => s.id === getCurrentId()) || scripts[0]);

// Ask the browser not to evict our data (matters on iPad Safari).
navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker failed', err));
}
checkForUpdate();
