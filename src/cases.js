// Work section: reads projects from the <ol class="cases__list"> in the HTML,
// draws each onto a 4:3 frame (screenshot, or a generated placeholder) and
// shows it on the CRT. Projects with data-video play that clip on the screen.
// Previous/Next, arrow keys, number keys (0 = hidden channel guide) and swipe change channel.

import { initCRT } from './crt.js';
import { scramble } from './fx.js';
import { playStatic } from './sound.js';
import { bittorrentScreen } from './screens.js';

const SCREENS = { bittorrent: bittorrentScreen };

const FW = 1024;
const FH = 768;
const pad = (n) => String(n).padStart(2, '0');

export function initCases(root) {
  const items = [...root.querySelectorAll('.cases__list li')].map((li) => {
    const a = li.querySelector('a');
    return {
      title: a?.textContent.trim() || 'Untitled',
      href: a?.getAttribute('href') || '#',
      desc: li.dataset.desc || '',
      tags: (li.dataset.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      year: li.dataset.year || '',
      image: li.dataset.image || '',
      video: li.dataset.video || '',
      screen: SCREENS[li.dataset.screen] || null,
      hue: Number(li.dataset.hue ?? 225),
    };
  });
  if (!items.length) return null;

  // channel 00: not in the prev/next rotation, only reachable with the 0 key
  const guide = {
    guide: true,
    title: 'Channel guide',
    href: '/resume.pdf',
    desc: 'You found the hidden channel. Press 1 to 4 to tune in, or open the résumé from here.',
    tags: ['Channel 00'],
    year: '',
  };

  const canvas = root.querySelector('.tv__canvas');
  const crt = initCRT(canvas);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const el = {
    title: root.querySelector('.js-title'),
    desc: root.querySelector('.js-desc'),
    tags: root.querySelector('.js-tags'),
    explore: root.querySelector('.js-explore'),
    exploreLabel: root.querySelector('.js-explore .btn-explore__label'),
    channel: root.querySelector('.js-channel'),
    counter: root.querySelector('.js-counter'),
    year: root.querySelector('.js-year'),
  };

  const makeCanvas = () => {
    const c = document.createElement('canvas');
    c.width = FW;
    c.height = FH;
    return c;
  };
  const frame = makeCanvas();
  const fx = frame.getContext('2d');
  const liveFrame = makeCanvas(); // video frames are drawn here, separate from the still frame
  const lx = liveFrame.getContext('2d');

  const images = new Map();
  const videos = new Map();
  let index = 0; // -1 = channel guide
  let token = 0;
  let current = null; // the <video> on screen, if any
  let inView = false;

  const fontsReady = Promise.race([
    Promise.all([
      document.fonts?.load(`400 160px Antonio`),
      document.fonts?.load(`500 22px "Geist Mono"`),
    ]),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});

  function loadImage(src) {
    if (!images.has(src)) {
      images.set(
        src,
        new Promise((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        }),
      );
    }
    return images.get(src);
  }

  function getVideo(src) {
    if (!videos.has(src)) {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = src;
      videos.set(src, v);
    }
    return videos.get(src);
  }

  function cover(ctx, media, mw, mh) {
    const s = Math.max(FW / mw, FH / mh);
    const w = mw * s;
    const h = mh * s;
    ctx.drawImage(media, (FW - w) / 2, (FH - h) / 2, w, h);
  }

  function drawPlaceholder(item, i) {
    const h = item.hue;
    const bg = fx.createLinearGradient(0, 0, 0, FH);
    bg.addColorStop(0, `hsl(${h} 80% 16%)`);
    bg.addColorStop(1, '#03040a');
    fx.fillStyle = bg;
    fx.fillRect(0, 0, FW, FH);

    const blob = fx.createRadialGradient(FW * 0.7, FH * 0.36, 0, FW * 0.7, FH * 0.36, FH * 0.62);
    blob.addColorStop(0, `hsla(${h}, 95%, 62%, 0.95)`);
    blob.addColorStop(0.45, `hsla(${h + 20}, 90%, 40%, 0.45)`);
    blob.addColorStop(1, `hsla(${h}, 90%, 20%, 0)`);
    fx.fillStyle = blob;
    fx.fillRect(0, 0, FW, FH);

    fx.textBaseline = 'alphabetic';
    fx.fillStyle = 'rgba(255,255,255,0.72)';
    fx.font = '500 22px "Geist Mono", monospace';
    fx.fillText(`CASE ${pad(i + 1)} / ${pad(items.length)}`, 72, 96);

    const title = item.title.toUpperCase();
    let size = 180;
    fx.font = `400 ${size}px Antonio, "Arial Narrow", sans-serif`;
    const w = fx.measureText(title).width;
    if (w > FW - 144) {
      size = Math.floor((size * (FW - 144)) / w);
      fx.font = `400 ${size}px Antonio, "Arial Narrow", sans-serif`;
    }
    fx.fillStyle = '#ffffff';
    fx.fillText(title, 72, FH - 120);
  }

  // teletext-style programme guide for channel 00
  function drawGuide() {
    fx.fillStyle = '#000';
    fx.fillRect(0, 0, FW, FH);
    const cell = 32;
    fx.textBaseline = 'top';
    fx.font = `500 ${cell - 4}px "Geist Mono", monospace`;
    const row = (y, text, color = '#fff', x = 64) => {
      fx.fillStyle = color;
      fx.fillText(text, x, 64 + y * (cell + 8));
    };

    fx.fillStyle = '#1f4dff';
    fx.fillRect(48, 52, FW - 96, cell + 16);
    row(0, 'P100  COBALT-9 GUIDE', '#fff', 64);
    const now = new Date();
    const t = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    fx.fillStyle = '#fff';
    fx.fillText(t, FW - 64 - fx.measureText(t).width, 64);

    row(2, 'CH  PROGRAMME', '#c6ff3d');
    items.forEach((it, i) => {
      const name = it.title.toUpperCase().slice(0, 24);
      row(3 + i, `${pad(i + 1)}  ${name}`, '#fff');
      row(3 + i, it.year, '#5b82ff', FW - 64 - fx.measureText(it.year).width);
    });

    const y = 4 + items.length;
    row(y, 'R   RÉSUMÉ (PDF)', '#5b82ff');
    row(y + 1, 'E   EMAIL ISHAAN', '#5b82ff');

    fx.fillStyle = '#1f4dff';
    fx.fillRect(48, FH - 112, FW - 96, cell + 16);
    fx.fillStyle = '#fff';
    fx.fillText(`PRESS 1-${items.length} TO TUNE IN`, 64, FH - 100);
  }

  const itemAt = (i) => (i < 0 ? guide : items[i]);

  async function compose(i) {
    const item = itemAt(i);
    await fontsReady;
    fx.clearRect(0, 0, FW, FH);
    if (item.guide) {
      drawGuide();
      return frame;
    }
    if (item.screen) {
      item.screen(fx, FW, FH).still();
      return frame;
    }
    const img = item.image ? await loadImage(item.image) : null;
    if (img) cover(fx, img, img.naturalWidth, img.naturalHeight);
    else drawPlaceholder(item, i);
    return frame;
  }

  function liveFor(item) {
    if (reduceMotion.matches) return null;
    if (item.screen) {
      const scr = item.screen(lx, FW, FH);
      const start = performance.now();
      return () => (scr.draw(performance.now() - start) ? liveFrame : null);
    }
    if (!item.video) return null;
    const v = getVideo(item.video);
    return () => {
      if (v.readyState < 2 || v.paused) return null;
      cover(lx, v, v.videoWidth, v.videoHeight);
      return liveFrame;
    };
  }

  function syncVideo() {
    for (const v of videos.values()) if (v !== current) v.pause();
    if (!current) return;
    if (inView && !document.hidden) current.play().catch(() => {});
    else current.pause();
  }

  function writeMeta(i, animate = true) {
    const item = itemAt(i);
    const tags = item.tags.map((t) => `[ ${t} ]`).join(' ');
    if (animate) scramble(el.title, item.title, { duration: 300 });
    else el.title.textContent = item.title;
    el.tags.textContent = tags;
    if (el.desc) el.desc.textContent = item.desc;
    el.explore.href = item.href;
    if (el.exploreLabel) el.exploreLabel.textContent = item.guide ? 'Résumé' : 'Explore';
    const ch = i < 0 ? 0 : i + 1;
    el.channel.textContent = pad(ch);
    el.counter.textContent = `${pad(ch)} / ${pad(items.length)}`;
    el.year.textContent = item.year || '----';
  }

  async function go(i, { silent = false } = {}) {
    index = i < 0 ? -1 : (i + items.length) % items.length;
    if (!silent) playStatic();
    const mine = ++token;
    const src = await compose(index);
    if (mine !== token) return; // a newer request superseded this one
    const shown = index;
    const item = itemAt(shown);
    current = item.video && !reduceMotion.matches ? getVideo(item.video) : null;
    if (current) current.currentTime = 0;
    syncVideo();
    crt.show(src, () => writeMeta(shown), liveFor(item));
  }

  const step = (d) => go(index < 0 ? (d > 0 ? 0 : items.length - 1) : index + d);

  root.querySelector('.stage__prev')?.addEventListener('click', () => step(-1));
  root.querySelector('.stage__next')?.addEventListener('click', () => step(1));

  new IntersectionObserver(
    ([e]) => {
      inView = e.isIntersecting;
      syncVideo();
    },
    { threshold: 0.4 },
  ).observe(root);
  document.addEventListener('visibilitychange', syncVideo);

  // arrows and number keys while the section is on screen
  window.addEventListener('keydown', (e) => {
    if (!inView || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === '0') go(-1);
    else if (/^[1-9]$/.test(e.key) && Number(e.key) <= items.length) go(Number(e.key) - 1);
  });

  // swipe on the TV
  const tv = root.querySelector('.tv');
  let sx = null;
  tv?.addEventListener('pointerdown', (e) => (sx = e.clientX));
  tv?.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 6) step(1); // click / tap the TV = next channel
  });

  // warm the image cache for the rest
  items.forEach((it) => it.image && loadImage(it.image));

  writeMeta(0, false);
  go(0, { silent: true });

  return { go: (i) => go(i) };
}
