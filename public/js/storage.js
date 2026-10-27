// Persistence layer. Everything lives in localStorage so the app works offline.
// Kept behind this small API so a native build can swap in file/DB storage.

const SCRIPTS_KEY = 'tp.scripts.v1';
const SETTINGS_KEY = 'tp.settings.v1';
const CURRENT_KEY = 'tp.current.v1';

export const DEFAULT_SETTINGS = {
  theme: 'auto',            // 'auto' | 'light' | 'dark'
  fontFamily: 'system',
  editorFontSize: 22,
  lineHeight: 1.5,
  letterSpacing: 0,         // em
  prompter: {
    fontSize: 64,
    speed: 30,              // 0-100
    mirrorX: false,
    mirrorY: false,
    reverse: false,
    delay: 3,               // seconds
    marker: true,
    markerPos: 0.33,        // fraction of screen height
    margin: 8,              // % side padding
  },
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('Save failed', err);
    return false;
  }
}

export function loadSettings() {
  const saved = read(SETTINGS_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    prompter: { ...DEFAULT_SETTINGS.prompter, ...(saved.prompter || {}) },
  };
}

export function saveSettings(settings) {
  return write(SETTINGS_KEY, settings);
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadScripts() {
  const list = read(SCRIPTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveScripts(list) {
  return write(SCRIPTS_KEY, list);
}

export function getCurrentId() {
  return read(CURRENT_KEY, null);
}

export function setCurrentId(id) {
  write(CURRENT_KEY, id);
}
