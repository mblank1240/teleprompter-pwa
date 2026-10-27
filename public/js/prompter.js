// Full-screen prompter: scrolling engine, touch scrubbing, countdown and controls.
//
// The scroll position `pos` is the number of pixels the text has moved past the
// reading marker. 0 = first line on the marker, max = last line on the marker.

const MAX_LINES_PER_SEC = 3;     // speed at 100%
const SPEED_CURVE = 1.5;         // >1 gives finer control at the slow end
const TAP_SLOP = 10;             // px a touch may move and still count as a tap
const HIDE_CONTROLS_MS = 3000;
const FONT_MIN = 24;
const FONT_MAX = 200;
const FONT_STEP = 4;

export const DELAY_OPTIONS = [0, 1, 2, 3, 5, 10];
export const MARGIN_OPTIONS = [0, 4, 8, 12, 16, 22];

const $ = id => document.getElementById(id);

export class Prompter {
  constructor({ onChange, onExit }) {
    this.onChange = onChange;
    this.onExit = onExit;
    this.el = {
      view: $('prompter-view'),
      stage: $('stage'),
      mirror: $('mirror'),
      track: $('track'),
      marker: $('marker'),
      countdown: $('countdown'),
      progress: $('progress'),
      controls: $('pcontrols'),
      hint: $('phint'),
      play: $('p-play'),
      speed: $('p-speed'),
      speedOut: $('p-speed-out'),
      sizeOut: $('p-size-out'),
      mirrorX: $('p-mirror-x'),
      mirrorY: $('p-mirror-y'),
      direction: $('p-direction'),
      directionLabel: $('p-direction-label'),
      delay: $('p-delay'),
      markerBtn: $('p-marker'),
      margin: $('p-margin'),
    };

    this.s = null;           // prompter settings (shared object, persisted via onChange)
    this.isOpen = false;
    this.pos = 0;
    this.max = 0;
    this.playing = false;    // user intent: should text be moving
    this.countdownEnd = 0;   // timestamp when countdown finishes, 0 = none
    this.drag = null;
    this.lastTs = 0;
    this.raf = 0;
    this.hideTimer = 0;
    this.wakeLock = null;

    this.frame = this.frame.bind(this);
    this.buildOptions();
    this.bindControls();
    this.bindStage();
    this.bindKeys();

    this.resizeObserver = new ResizeObserver(() => this.isOpen && this.relayout());
    this.resizeObserver.observe(this.el.stage);
    document.addEventListener('visibilitychange', () => {
      if (!this.isOpen) return;
      if (document.visibilityState === 'visible') this.requestWakeLock();
      else this.pause();
    });
  }

  // ---------- lifecycle ----------

  open(html, settings) {
    this.s = settings;
    this.el.track.innerHTML = html;
    this.el.view.hidden = false;
    this.isOpen = true;
    this.playing = false;
    this.countdownEnd = 0;
    this.pos = 0;
    this.syncUi();
    this.applyMirror();
    this.relayout(0);
    this.showControls();
    this.flashHint();
    this.enterFullscreen();
    this.requestWakeLock();
    this.lastTs = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
    this.el.view.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.playing = false;
    this.countdownEnd = 0;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.hideTimer);
    this.el.view.hidden = true;
    this.el.view.classList.remove('playing', 'controls-hidden');
    this.el.countdown.hidden = true;
    this.el.track.innerHTML = '';
    this.releaseWakeLock();
    this.exitFullscreen();
    this.onExit();
  }

  // ---------- engine ----------

  get lineHeightPx() {
    return this.lh || this.s.fontSize * 1.5;
  }

  pxPerSecond() {
    const t = Math.pow(this.s.speed / 100, SPEED_CURVE);
    return t * MAX_LINES_PER_SEC * this.lineHeightPx;
  }

  // Recompute padding and scroll limits. `ratio` keeps the reader at the same
  // relative place in the script across size / orientation changes.
  relayout(ratio = this.max > 0 ? this.pos / this.max : 0) {
    const { stage, track, marker, view } = this.el;
    view.style.setProperty('--prompt-font-size', this.s.fontSize + 'px');
    view.style.setProperty('--prompt-margin', this.s.margin + '%');
    const vh = stage.clientHeight;
    const markerY = Math.round(vh * this.s.markerPos);
    const lh = this.lh = parseFloat(getComputedStyle(track).lineHeight) || this.s.fontSize * 1.5;
    marker.style.top = markerY + 'px';
    // First line's centre sits on the marker at pos 0; last line's at pos max.
    track.style.paddingTop = Math.max(0, markerY - lh / 2) + 'px';
    track.style.paddingBottom = Math.max(0, vh - markerY - lh / 2) + 'px';
    this.max = Math.max(0, track.offsetHeight - vh);
    this.pos = Math.min(this.max, Math.max(0, ratio * this.max));
    this.render();
  }

  render() {
    this.el.track.style.transform = `translate3d(0, ${-this.pos}px, 0)`;
    this.el.progress.style.width = (this.max ? (this.pos / this.max) * 100 : 0) + '%';
  }

  frame(ts) {
    if (!this.isOpen) return;
    const dt = Math.min(0.1, (ts - this.lastTs) / 1000); // clamp after tab switches
    this.lastTs = ts;

    if (this.countdownEnd) {
      const remaining = this.countdownEnd - ts;
      if (remaining <= 0) {
        this.countdownEnd = 0;
        this.el.countdown.hidden = true;
      } else {
        this.el.countdown.textContent = Math.ceil(remaining / 1000);
      }
    }

    if (this.playing && !this.countdownEnd && !this.drag) {
      const dir = this.s.reverse ? -1 : 1;
      this.pos += dir * this.pxPerSecond() * dt;
      if (this.pos >= this.max || this.pos <= 0) {
        this.pos = Math.min(this.max, Math.max(0, this.pos));
        this.pause();
      }
      this.render();
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  atEnd() {
    return this.s.reverse ? this.pos <= 0 : this.pos >= this.max - 1;
  }

  play() {
    if (this.playing) return;
    if (this.atEnd()) {
      this.pos = this.s.reverse ? this.max : 0;
      this.render();
    }
    this.playing = true;
    this.el.view.classList.add('playing');
    this.el.play.setAttribute('aria-label', 'Pause');
    if (this.s.delay > 0) {
      this.countdownEnd = performance.now() + this.s.delay * 1000;
      this.el.countdown.textContent = this.s.delay;
      this.el.countdown.hidden = false;
    }
    this.scheduleHide();
  }

  pause() {
    this.playing = false;
    this.countdownEnd = 0;
    this.el.countdown.hidden = true;
    this.el.view.classList.remove('playing');
    this.el.play.setAttribute('aria-label', 'Play');
    this.showControls();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  toStart() {
    this.pos = this.s.reverse ? this.max : 0;
    this.render();
  }

  nudge(px) {
    this.pos = Math.min(this.max, Math.max(0, this.pos + px));
    this.render();
  }

  // ---------- settings ----------

  set(key, value) {
    this.s[key] = value;
    this.onChange();
    this.syncUi();
  }

  setSpeed(v) {
    this.set('speed', Math.round(Math.min(100, Math.max(0, v))));
  }

  setFontSize(px) {
    const size = Math.min(FONT_MAX, Math.max(FONT_MIN, px));
    if (size === this.s.fontSize) return;
    this.set('fontSize', size);
    this.relayout();
  }

  applyMirror() {
    this.el.mirror.style.transform = `scale(${this.s.mirrorX ? -1 : 1}, ${this.s.mirrorY ? -1 : 1})`;
  }

  syncUi() {
    const { s, el } = this;
    el.speed.value = s.speed;
    el.speedOut.textContent = s.speed + '%';
    el.sizeOut.textContent = s.fontSize;
    el.mirrorX.setAttribute('aria-pressed', s.mirrorX);
    el.mirrorY.setAttribute('aria-pressed', s.mirrorY);
    el.direction.classList.toggle('reverse', s.reverse);
    el.directionLabel.textContent = s.reverse ? 'Scroll down' : 'Scroll up';
    el.delay.value = s.delay;
    el.markerBtn.setAttribute('aria-pressed', s.marker);
    el.view.classList.toggle('no-marker', !s.marker);
    el.margin.value = s.margin;
  }

  buildOptions() {
    this.el.delay.innerHTML = DELAY_OPTIONS
      .map(d => `<option value="${d}">${d === 0 ? 'No delay' : d + 's delay'}</option>`).join('');
    this.el.margin.innerHTML = MARGIN_OPTIONS
      .map(m => `<option value="${m}">${m === 0 ? 'No margin' : m + '% margin'}</option>`).join('');
  }

  bindControls() {
    const el = this.el;
    // Return focus to the view after each click so Space/Enter never re-trigger a button.
    const onClick = (node, fn) => node.addEventListener('click', e => {
      fn(e);
      this.scheduleHide();
      if (this.isOpen) el.view.focus({ preventScroll: true });
    });

    onClick($('p-exit'), () => this.close());
    onClick($('p-top'), () => this.toStart());
    onClick(el.play, () => this.toggle());
    onClick($('p-size-down'), () => this.setFontSize(this.s.fontSize - FONT_STEP));
    onClick($('p-size-up'), () => this.setFontSize(this.s.fontSize + FONT_STEP));
    onClick(el.mirrorX, () => { this.set('mirrorX', !this.s.mirrorX); this.applyMirror(); });
    onClick(el.mirrorY, () => { this.set('mirrorY', !this.s.mirrorY); this.applyMirror(); });
    onClick(el.direction, () => this.set('reverse', !this.s.reverse));
    onClick(el.markerBtn, () => this.set('marker', !this.s.marker));

    el.speed.addEventListener('input', () => { this.setSpeed(+el.speed.value); this.scheduleHide(); });
    el.delay.addEventListener('change', () => this.set('delay', +el.delay.value));
    el.margin.addEventListener('change', () => { this.set('margin', +el.margin.value); this.relayout(); });

    // Any interaction with the control bar keeps it visible a bit longer.
    el.controls.addEventListener('pointerdown', () => this.showControls());
  }

  // ---------- touch: hold to pause, drag to scrub, tap to toggle controls ----------

  bindStage() {
    const stage = this.el.stage;

    stage.addEventListener('pointerdown', e => {
      if (this.drag) return;
      try { stage.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      this.drag = { id: e.pointerId, startY: e.clientY, startPos: this.pos, moved: false, t: performance.now() };
      stage.classList.add('dragging');
    });

    stage.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dy = e.clientY - d.startY;
      if (Math.abs(dy) > TAP_SLOP) d.moved = true;
      if (!d.moved) return;
      // Text follows the finger. With a vertical flip, screen-down is track-up.
      const sign = this.s.mirrorY ? -1 : 1;
      this.pos = Math.min(this.max, Math.max(0, d.startPos - dy * sign));
      this.render();
    });

    const end = e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      stage.classList.remove('dragging');
      if (!d.moved && performance.now() - d.t < 400) this.toggleControls();
      // Auto-scroll resumes on its own because `playing` was never cleared.
      this.lastTs = performance.now();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('contextmenu', e => e.preventDefault());

    // Mouse wheel / trackpad scrubbing for desktop testing and Magic Keyboard.
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      this.nudge(e.deltaY * (this.s.mirrorY ? -1 : 1));
    }, { passive: false });
  }

  // ---------- keyboard & presentation remotes ----------

  bindKeys() {
    document.addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.target.closest && e.target.closest('select') && e.key !== 'Escape') return;
      const page = this.el.stage.clientHeight * 0.6;
      const handled = {
        ' ': () => this.toggle(),
        'Enter': () => this.toggle(),
        'k': () => this.toggle(),
        'Escape': () => this.close(),
        'ArrowRight': () => this.setSpeed(this.s.speed + 5),
        'ArrowLeft': () => this.setSpeed(this.s.speed - 5),
        'ArrowDown': () => this.nudge(this.lineHeightPx),
        'ArrowUp': () => this.nudge(-this.lineHeightPx),
        'PageDown': () => this.nudge(page),
        'PageUp': () => this.nudge(-page),
        'Home': () => this.toStart(),
        '+': () => this.setFontSize(this.s.fontSize + FONT_STEP),
        '=': () => this.setFontSize(this.s.fontSize + FONT_STEP),
        '-': () => this.setFontSize(this.s.fontSize - FONT_STEP),
        'm': () => { this.set('mirrorX', !this.s.mirrorX); this.applyMirror(); },
        'f': () => { this.set('mirrorY', !this.s.mirrorY); this.applyMirror(); },
        'r': () => this.set('reverse', !this.s.reverse),
      }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (handled) {
        e.preventDefault();
        handled();
      }
    });
  }

  // ---------- controls visibility ----------

  showControls() {
    this.el.view.classList.remove('controls-hidden');
    this.scheduleHide();
  }

  hideControls() {
    if (document.activeElement && this.el.controls.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    this.el.view.classList.add('controls-hidden');
  }

  toggleControls() {
    this.el.view.classList.contains('controls-hidden') ? this.showControls() : this.hideControls();
  }

  scheduleHide() {
    clearTimeout(this.hideTimer);
    if (this.playing) this.hideTimer = setTimeout(() => this.playing && this.hideControls(), HIDE_CONTROLS_MS);
  }

  flashHint() {
    const hint = this.el.hint;
    hint.classList.remove('gone');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => hint.classList.add('gone'), 2500);
  }

  // ---------- platform ----------

  enterFullscreen() {
    const root = document.documentElement;
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        const p = req.call(root);
        if (p && p.catch) p.catch(() => {});
      } catch { /* not allowed here (e.g. iPhone) — the view is already full-window */ }
    }
  }

  exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit && (document.fullscreenElement || document.webkitFullscreenElement)) {
      try {
        const p = exit.call(document);
        if (p && p.catch) p.catch(() => {});
      } catch { /* ignore */ }
    }
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      }
    } catch { /* unsupported or denied; screen may dim */ }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }
}
