// Channel-flip sound, synthesised with Web Audio (no audio file to download).
// Off by default; the visitor's choice is remembered in localStorage.

const KEY = 'portfolio-sound';
let enabled = false;
let ctx = null;
let noise = null;

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const len = Math.floor(ctx.sampleRate * 0.45);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function playStatic() {
  if (!enabled) return;
  const c = ensureContext();
  if (!c) return;
  const t = c.currentTime;

  // burst of band-passed static that sweeps down
  const src = c.createBufferSource();
  src.buffer = noise;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.7;
  band.frequency.setValueAtTime(2600, t);
  band.frequency.exponentialRampToValueAtTime(900, t + 0.35);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  src.connect(band).connect(gain).connect(c.destination);
  src.start(t);
  src.stop(t + 0.45);

  // the mechanical "clunk" of the channel knob
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1500, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.035);
  const og = c.createGain();
  og.gain.setValueAtTime(0.07, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  osc.connect(og).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

export function initSound(button) {
  if (!button) return;
  try {
    enabled = localStorage.getItem(KEY) === '1';
  } catch {}

  const state = button.querySelector('.sound__state');
  const render = () => {
    button.setAttribute('aria-pressed', String(enabled));
    if (state) state.textContent = enabled ? 'on' : 'off';
  };
  render();

  button.addEventListener('click', () => {
    enabled = !enabled;
    try {
      localStorage.setItem(KEY, enabled ? '1' : '0');
    } catch {}
    render();
    playStatic(); // audible confirmation when switching on
  });
}
