import Lenis from 'lenis';
import { initGradient } from './gradient.js';
import { initCases } from './cases.js';
import { initIntro, initCursor, initScramble } from './fx.js';
import { initSound } from './sound.js';

document.documentElement.classList.add('js');

initIntro();
initCursor();
initScramble();
initSound(document.querySelector('.sound'));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = (n) => String(n).padStart(2, '0');

/* ---------- hero gradient + HUD readouts ---------- */

const fpsEl = document.querySelector('.js-fps');
const canvas = document.querySelector('.hero__canvas');
if (canvas) {
  initGradient(canvas, {
    scale: 0.5,
    onFps: (n) => fpsEl && (fpsEl.textContent = n),
  });
}
if (reduceMotion && fpsEl) fpsEl.textContent = '--';

const dateEl = document.querySelector('.js-date');
if (dateEl) {
  const d = new Date();
  dateEl.textContent = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

const tcEl = document.querySelector('.js-timecode');
if (tcEl) {
  const start = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - start) / 1000);
    tcEl.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- work section ---------- */

const cases = document.querySelector('.cases');
if (cases) initCases(cases);

/* ---------- smooth scroll ---------- */

const hero = document.querySelector('.hero');
let heroH = hero ? hero.offsetHeight : 1;
window.addEventListener('resize', () => (heroH = hero ? hero.offsetHeight : 1), { passive: true });

function onScroll(y) {
  const p = Math.min(Math.max(y / heroH, 0), 1);
  hero?.style.setProperty('--hero-p', p.toFixed(3));
}

if (!reduceMotion) {
  const lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.1 });
  lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  // honour deep links like /#about once layout has settled
  if (location.hash && document.querySelector(location.hash)) {
    requestAnimationFrame(() => lenis.scrollTo(location.hash, { immediate: true }));
  }
} else {
  window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
}

/* ---------- reveal on scroll ---------- */

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
);

document.querySelectorAll('[data-reveal]').forEach((el) => {
  const group = el.parentElement?.closest('.bento');
  if (group) {
    const i = [...group.querySelectorAll('[data-reveal]')].indexOf(el);
    el.style.setProperty('--rd', `${i * 0.07}s`);
  }
  io.observe(el);
});

/* ---------- active nav pill ---------- */

const pills = new Map([...document.querySelectorAll('.pill')].map((p) => [p.dataset.section, p]));
const navIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      pills.forEach((p, id) => p.classList.toggle('is-active', id === e.target.id));
    }
  },
  { rootMargin: '-50% 0px -50% 0px' },
);
document.querySelectorAll('main > section').forEach((s) => navIO.observe(s));

/* ---------- local clock ---------- */

const clock = document.querySelector('.clock');
if (clock) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: clock.dataset.tz || undefined,
    timeZoneName: 'short',
  });
  const tick = () => (clock.textContent = fmt.format(new Date()));
  tick();
  setInterval(tick, 15_000);
}

/* ---------- fit the hero name edge to edge ---------- */

const nameEl = document.querySelector('.hero__name');
if (nameEl) {
  const fit = () => {
    nameEl.style.setProperty('--name-size', '100px');
    const lines = [...nameEl.querySelectorAll('.line')];
    const stacked = getComputedStyle(nameEl).flexDirection === 'column';
    const r = lines.map((l) => l.getBoundingClientRect());
    const used = stacked
      ? Math.max(...r.map((b) => b.width))
      : r[r.length - 1].right - r[0].left;
    const avail = nameEl.clientWidth;
    if (used > 0) nameEl.style.setProperty('--name-size', `${Math.floor((100 * avail * 0.995) / used)}px`);
  };
  fit();
  document.fonts?.ready.then(fit);
  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(fit, 100);
  }, { passive: true });
}

/* ---------- bento: cursor spotlight + live local time ---------- */

if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener(
      'pointermove',
      (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      },
      { passive: true },
    );
  });
}

/* ---------- competitive programming: live Codeforces rating ---------- */

const cp = document.querySelector('.card--cp');
if (cp) {
  const lc = cp.dataset.lcSolved;
  if (lc) cp.querySelector('.js-lc-solved').textContent = lc;
  else cp.querySelector('.cp__row--lc')?.setAttribute('hidden', '');
  const handle = cp.dataset.cfHandle;
  if (handle) {
    fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`)
      .then((r) => r.json())
      .then(({ status, result }) => {
        const u = status === 'OK' && result?.[0];
        if (!u) return;
        cp.querySelector('.js-cf-rating').textContent = u.rating ?? 'Unrated';
        if (u.maxRating) cp.querySelector('.js-cf-rank').textContent = `max ${u.maxRating}`;
      })
      .catch(() => {});
  }
}

const localTime = document.querySelector('.js-local-time');
if (localTime) {
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const tick = () => (localTime.textContent = fmt.format(new Date()));
  tick();
  setInterval(tick, 15_000);
}

/* ---------- journey: rail fills and milestones light up as you scroll ---------- */

const timeline = document.querySelector('.timeline');
if (timeline) {
  const stones = [...timeline.querySelectorAll('.milestone')];
  let ticking = false;
  let near = false;

  const update = () => {
    ticking = false;
    const r = timeline.getBoundingClientRect();
    const mark = window.innerHeight * 0.6; // the "reading line"
    const p = Math.min(Math.max((mark - r.top) / r.height, 0), 1);
    timeline.style.setProperty('--p', p.toFixed(3));
    for (const s of stones) {
      s.classList.toggle('is-on', s.getBoundingClientRect().top + 16 < mark);
    }
  };
  const request = () => {
    if (near && !ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  // only do work while the timeline is near the viewport
  new IntersectionObserver(([e]) => {
    near = e.isIntersecting;
    if (near) request();
  }, { rootMargin: '20% 0px' }).observe(timeline);
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
}

/* ---------- keyboard shortcuts: E = email, R = résumé ---------- */

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'e') location.href = 'mailto:515.ishaansingh@gmail.com';
  else if (k === 'r') window.open('/resume.pdf', '_blank', 'noopener');
});

/* ---------- footer: last updated + what this page actually weighed ---------- */

const updated = document.querySelector('.js-updated');
if (updated) {
  updated.textContent = new Date(document.lastModified).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const weight = document.querySelector('.js-weight');
if (weight) {
  const measure = () => {
    const entries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')];
    // skip the TV video clips: they stream in as you watch, so they aren't "page weight"
    const bytes = entries
      .filter((e) => !/\.mp4($|\?)/.test(e.name))
      .reduce((sum, e) => sum + (e.transferSize || e.encodedBodySize || 0), 0);
    if (bytes) weight.textContent = Math.round(bytes / 1024);
  };
  if (document.readyState === 'complete') setTimeout(measure, 500);
  else window.addEventListener('load', () => setTimeout(measure, 500));
}
