// CRT screen effect for the "TV" in the work section.
// Takes any canvas/image as a texture and adds: curved glass, RGB fringing,
// scanlines, a rolling bar, vignette, flicker, and a burst of static on channel change.
// Capped at 30fps (authentic, and half the GPU work) and paused when offscreen.

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;

uniform sampler2D uTex;
uniform vec2  uRes;
uniform float uTime;
uniform float uStatic;   // 0..1 channel-change noise

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 curve(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 off = abs(uv.yx) / vec2(5.5, 4.5);
  uv += uv * off * off;
  return uv * 0.5 + 0.5;
}

void main() {
  vec2 uv = curve(gl_FragCoord.xy / uRes);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // horizontal tearing while the channel changes
  float row = floor(uv.y * 180.0);
  vec2 tuv = uv;
  tuv.x += (hash(vec2(row, floor(uTime * 30.0))) - 0.5) * 0.03 * uStatic;

  float ca = 0.0018 + 0.012 * uStatic;
  vec3 col;
  col.r = texture2D(uTex, tuv + vec2(ca, 0.0)).r;
  col.g = texture2D(uTex, tuv).g;
  col.b = texture2D(uTex, tuv - vec2(ca, 0.0)).b;

  // static
  float n = hash(gl_FragCoord.xy * 0.5 + fract(uTime * 13.0) * 500.0);
  col = mix(col, vec3(n) * vec3(0.85, 0.92, 1.0), uStatic * 0.8);
  col += (n - 0.5) * 0.03;

  // scanlines (~3 device px period)
  float s = sin(gl_FragCoord.y * 2.1) * 0.5 + 0.5;
  col *= 0.88 + 0.12 * s;

  // slow rolling bar
  float bar = 1.0 - smoothstep(0.0, 0.07, abs(fract(uv.y + uTime * 0.08) - 0.5));
  col *= 1.0 + 0.04 * bar;

  // vignette into the tube edges
  vec2 v = uv * (1.0 - uv.yx);
  col *= pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.28);

  // mains flicker + a little phosphor glow
  col *= 1.08 + 0.01 * sin(uTime * 120.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

const SWAP_IN = 140; // ms of static before the new picture
const SWAP_OUT = 300; // ms of static fading out after

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

export function initCRT(canvas, { fps = 30 } = {}) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  const vs = gl && compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!gl || !vs || !fs) return fallback2D(canvas);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uStatic = gl.getUniformLocation(prog, 'uStatic');
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const t0 = performance.now();
  let staticAmt = 0;
  let swap = null; // { start, source, onSwap, live, done }
  let live = null; // optional () => canvas|null, re-uploaded every frame (video)
  let visible = false;
  let running = false;
  let raf = 0;
  let last = 0;

  const upload = (src) => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

  function resize() {
    const s = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.min(1200, Math.round(canvas.clientWidth * s)));
    const h = Math.max(1, Math.round((w * canvas.clientHeight) / Math.max(canvas.clientWidth, 1)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function render(now) {
    if (swap) {
      const t = now - swap.start;
      if (t < SWAP_IN) {
        staticAmt = Math.max(staticAmt, t / SWAP_IN);
      } else {
        if (!swap.done) {
          upload(swap.source);
          live = swap.live || null;
          swap.onSwap?.();
          swap.done = true;
        }
        staticAmt = 1 - Math.min((t - SWAP_IN) / SWAP_OUT, 1);
        if (t >= SWAP_IN + SWAP_OUT) {
          swap = null;
          staticAmt = 0;
        }
      }
    }
    if (live && (!swap || swap.done)) {
      const src = live();
      if (src) upload(src);
    }
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.uniform1f(uStatic, staticAmt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / fps - 2) return;
    last = now;
    render(now);
  }

  function update() {
    const shouldRun = visible && !document.hidden && !reduceMotion.matches;
    if (shouldRun && !running) {
      running = true;
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }

  new ResizeObserver(() => {
    resize();
    if (!running) render(performance.now());
  }).observe(canvas);

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    update();
  }).observe(canvas);
  document.addEventListener('visibilitychange', update);

  resize();

  return {
    show(source, onSwap, liveFn) {
      live = null; // stop the old channel's video during the static
      if (!running) {
        // offscreen or reduced motion: switch instantly
        swap = null;
        staticAmt = 0;
        upload(source);
        live = liveFn || null;
        onSwap?.();
        render(performance.now());
        return;
      }
      if (swap && !swap.done) {
        swap.source = source; // retarget the pending switch
        swap.onSwap = onSwap;
        swap.live = liveFn;
      } else {
        swap = { start: performance.now(), source, onSwap, live: liveFn, done: false };
      }
    },
  };
}

function fallback2D(canvas) {
  canvas.classList.add('is-fallback');
  const ctx = canvas.getContext('2d');
  return {
    show(source, onSwap) {
      // no per-frame video here: the still frame is enough
      canvas.width = source.width;
      canvas.height = source.height;
      ctx.drawImage(source, 0, 0);
      onSwap?.();
    },
  };
}
