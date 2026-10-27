// Import / export of script files.
// .txt and .md import as text; .html keeps formatting (bold, colors, highlights).

import { sanitizeHtml, textToHtml, markdownToHtml, htmlToText } from './sanitize.js';

export async function readScriptFile(file) {
  const text = await file.text();
  const name = file.name.replace(/\.[^.]+$/, '') || 'Imported script';
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  let html;
  if (ext === 'html' || ext === 'htm' || file.type === 'text/html') {
    html = sanitizeHtml(text);
    const title = /<title>([^<]*)<\/title>/i.exec(text);
    if (title && title[1].trim()) return { title: decodeEntities(title[1].trim()), html };
  } else if (ext === 'md' || ext === 'markdown') {
    html = markdownToHtml(text);
  } else {
    html = textToHtml(text);
  }
  return { title: name, html };
}

function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

function safeFileName(title) {
  return (title || 'script').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'script';
}

export function buildTextFile(script) {
  return new File([htmlToText(script.html)], `${safeFileName(script.title)}.txt`, { type: 'text/plain' });
}

export function buildHtmlFile(script, settings) {
  const fonts = settings.fontStack;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Teleprompter PWA">
<title>${esc(script.title || 'Script')}</title>
<style>
  body { max-width: 860px; margin: 40px auto; padding: 0 24px; font-family: ${fonts}; font-size: ${settings.editorFontSize}px; line-height: ${settings.lineHeight}; letter-spacing: ${settings.letterSpacing}em; }
  p, div { margin: 0; }
</style>
</head>
<body>
${script.html}
</body>
</html>
`;
  return new File([doc], `${safeFileName(script.title)}.html`, { type: 'text/html' });
}

// Hands the file to the user in the best way the platform supports:
// desktop Chromium gets a real Save dialog, iPad gets the share sheet
// ("Save to Files"), everything else falls back to a download.
export async function saveFile(file) {
  if ('showSaveFilePicker' in window) {
    try {
      const ext = file.name.split('.').pop();
      const handle = await window.showSaveFilePicker({
        suggestedName: file.name,
        types: [{ description: ext.toUpperCase() + ' file', accept: { [file.type]: ['.' + ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return 'saved';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      // fall through to other methods
    }
  }

  const isTouch = navigator.maxTouchPoints > 0;
  if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
