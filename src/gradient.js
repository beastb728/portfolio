// Hand-written WebGL gradient for the hero. No libraries.
// Domain-warped fbm noise, rendered at reduced resolution and upscaled by CSS
// (the image is soft anyway, so this is close to free visually and saves ~75% GPU work).

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;   // 0..1, eased

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),                  hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p  = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.05;

  // gentle parallax toward the pointer
  p += (uMouse - 0.5) * vec2(0.18, 0.12);

  vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t)),
                fbm(p * 1.3 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.1 + 2.2 * q + vec2(1.7, 9.2) + t * 1.4),
                fbm(p * 1.1 + 2.2 * q + vec2(8.3, 2.8) - t * 0.9));
  float f = fbm(p * 0.9 + 2.6 * r);

  vec3 midnight = vec3(0.010, 0.014, 0.032);
  vec3 navy     = vec3(0.040, 0.100, 0.520);
  vec3 cobalt   = vec3(0.150, 0.360, 1.000);
  vec3 lime     = vec3(0.780, 1.000, 0.240);

  vec3 col = mix(midnight, navy, smoothstep(0.18, 0.62, f));
  col = mix(col, cobalt, smoothstep(0.40, 0.56, r.y) * smoothstep(0.26, 0.48, f));
  // just a hint of acid lime where the folds peak
  col = mix(col, lime,   smoothstep(0.50, 0.66, f * r.x * 1.6) * 0.32);

  // keep the lower-left (where the headline sits) darker for contrast
  float glow = smoothstep(1.35, 0.1, length((uv - vec2(0.74, 0.66)) * vec2(0.9, 1.2)));
  col *= 0.22 + 1.05 * glow;

  // film grain
  float g = hash(gl_FragCoord.xy + fract(uTime * 7.0) * 311.0) - 0.5;
  col += g * 0.03;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function initGradient(canvas, { scale = 0.5, onFps } = {}) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!gl) return fallback(canvas);

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return fallback(canvas);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fallback(canvas);
  gl.useProgram(prog);

  // one oversized triangle covers the screen
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uMouse = gl.getUniformLocation(prog, 'uMouse');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const T0 = 24; // start mid-animation so the first frame already looks good
  const startedAt = performance.now();
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let visible = true;
  let running = false;
  let raf = 0;
  let readyShown = false;

  function resize() {
    const s = scale * Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * s));
    const h = Math.max(1, Math.round(canvas.clientHeight * s));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function draw(seconds) {
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, seconds);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!readyShown) {
      readyShown = true;
      canvas.classList.add('is-ready');
    }
  }

  let frames = 0;
  let fpsT = 0;

  function frame(now) {
    draw(T0 + (now - startedAt) / 1000);
    frames++;
    if (now - fpsT >= 1000) {
      if (fpsT) onFps?.(Math.round((frames * 1000) / (now - fpsT)));
      frames = 0;
      fpsT = now;
    }
    raf = requestAnimationFrame(frame);
  }

  function update() {
    const shouldRun = visible && !document.hidden && !reduceMotion.matches;
    if (shouldRun && !running) {
      running = true;
      frames = 0;
      fpsT = 0;
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
    if (reduceMotion.matches) draw(T0); // a single still frame
  }

  new ResizeObserver(() => {
    resize();
    if (!running) draw(T0);
  }).observe(canvas);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  }).observe(canvas);

  document.addEventListener('visibilitychange', update);
  reduceMotion.addEventListener('change', update);

  if (matchMedia('(pointer: fine)').matches) {
    window.addEventListener(
      'pointermove',
      (e) => {
        mouse.tx = e.clientX / window.innerWidth;
        mouse.ty = 1 - e.clientY / window.innerHeight;
      },
      { passive: true },
    );
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    cancelAnimationFrame(raf);
    fallback(canvas);
  });

  resize();
  update();
}

function fallback(canvas) {
  canvas.classList.add('is-fallback');
}
