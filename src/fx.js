// Small interaction effects: TV power-on intro, crosshair cursor, scramble text.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- TV power-on intro ---------- */

export function initIntro() {
  const el = document.querySelector('.poweron');
  if (!el) return;
  if (!document.documentElement.classList.contains('intro')) {
    el.remove();
    return;
  }
  try {
    sessionStorage.setItem('tv-on', '1');
  } catch {}

  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    el.remove();
    window.removeEventListener('keydown', done);
  };
  el.addEventListener('animationend', (e) => e.animationName === 'poweron-out' && done());
  el.addEventListener('pointerdown', done); // click to skip
  window.addEventListener('keydown', done); // any key to skip
  setTimeout(done, 2500); // safety net
}

/* ---------- scramble text ---------- */

const GLYPHS = '▓▒░<>/\\[]{}=+*^?#_01';
const active = new WeakMap();

/**
 * Scramble an element's text into `to`, resolving left to right.
 * lockWidth keeps the box from jittering when the text itself isn't changing.
 */
export function scramble(el, to, { duration = 420, lockWidth = false } = {}) {
  if (!el) return;
  const prev = active.get(el);
  if (prev) cancelAnimationFrame(prev.raf);
  const from = prev ? prev.to : el.textContent;
  to = to ?? from;

  if (reduceMotion) {
    el.textContent = to;
    return;
  }

  if (lockWidth && !prev) {
    el.style.width = `${el.getBoundingClientRect().width}px`;
    el.classList.add('is-scrambling');
  }

  const len = Math.max(from.length, to.length);
  const at = Array.from({ length: len }, (_, i) => (i / len) * duration * 0.7 + Math.random() * duration * 0.3);
  const start = performance.now();
  let lastPaint = 0;
  const state = { to, raf: 0 };
  active.set(el, state);

  const step = (now) => {
    const t = now - start;
    if (t >= duration) {
      el.textContent = to;
      el.style.width = '';
      el.classList.remove('is-scrambling');
      active.delete(el);
      return;
    }
    if (now - lastPaint > 40) {
      lastPaint = now;
      let out = '';
      for (let i = 0; i < len; i++) {
        if (t >= at[i]) out += to[i] ?? '';
        else if ((to[i] ?? from[i]) === ' ') out += ' ';
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
    }
    state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);
}

export function initScramble() {
  if (!finePointer || reduceMotion) return;
  document.querySelectorAll('[data-scramble]').forEach((el) => {
    const trigger = el.closest('a, button') || el;
    trigger.addEventListener('pointerenter', () => scramble(el, undefined, { lockWidth: true, duration: 260 }));
  });
}

/* ---------- crosshair cursor ---------- */

export function initCursor() {
  if (!finePointer || reduceMotion) return;
  const el = document.querySelector('.cursor');
  if (!el) return;
  const label = el.querySelector('.cursor__label');
  document.documentElement.classList.add('has-cursor');
  el.classList.add('is-hidden');

  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;
  let raf = 0;
  let placed = false;
  let current = null;

  const loop = () => {
    x += (tx - x) * 0.35;
    y += (ty - y) * 0.35;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.1 ? requestAnimationFrame(loop) : 0;
  };

  const setTarget = (t) => {
    if (t === current) return;
    current = t;
    if (t) {
      label.textContent = t.dataset.cursor || (t.tagName === 'A' ? 'Open' : 'Click');
      el.classList.add('is-hover');
    } else {
      el.classList.remove('is-hover');
    }
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      if (!placed) {
        x = tx;
        y = ty;
        placed = true;
      }
      el.classList.remove('is-hidden');
      setTarget(e.target.closest?.('[data-cursor], a, button') || null);
      if (!raf) raf = requestAnimationFrame(loop);
    },
    { passive: true },
  );

  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) el.classList.add('is-hidden');
  });
  window.addEventListener('pointerdown', () => el.classList.add('is-down'));
  window.addEventListener('pointerup', () => el.classList.remove('is-down'));
}
