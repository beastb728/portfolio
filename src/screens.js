// Animated screens drawn on a canvas for projects that have no video.
// Each returns { draw(ms) -> boolean } where the boolean says whether the picture changed.

// BitTorrent client: replays the client's real terminal output (from the repo README),
// then loops through a few pieces downloading in 16 KB blocks.
export function bittorrentScreen(ctx, W, H) {
  const C = {
    bg: '#06070d',
    fg: '#e6e9f5',
    dim: '#7c86a8',
    ok: '#c6ff3d',
    bad: '#ff7a6b',
    accent: '#5b82ff',
  };
  const PIECES = 24868;
  const BLOCK = 16384;
  const PIECE = 262144;

  // [text, colour, ms to wait before this line appears]
  const script = [
    ['$ python main.py', C.accent, 300],
    ['Found 17 peers', C.fg, 500],
    [`Need to download ${PIECES} pieces`, C.fg, 250],
    ['', C.fg, 200],
    ['Trying 2001:470:1f06:32b::2:54555', C.dim, 300],
    ['Failed: [Errno 104] Connection reset by peer', C.bad, 700],
    ['', C.fg, 200],
    ['Trying 2a01:e0a:86a:e460:2e0:4cff:fe45:945e:51413', C.dim, 300],
    ['Handshake successful!', C.ok, 600],
    [`Peer has ${PIECES} pieces`, C.fg, 250],
    ['Sending interested...', C.fg, 300],
    ['Waiting for unchoke...', C.fg, 300],
    ['Peer unchoked us!', C.ok, 700],
  ];
  for (let p = 53; p < 58; p++) {
    script.push(['', C.fg, 150], [`Downloading piece ${p}`, C.accent, 250]);
    for (let b = BLOCK; b <= PIECE; b += BLOCK) script.push([`Downloaded ${b}/${PIECE} bytes`, C.fg, 55]);
    script.push([`Completed ${p + 1}/${PIECES}`, C.fg, 120]);
    script.push([`Progress: ${(((p + 1) / PIECES) * 100).toFixed(2)}%`, C.dim, 80]);
  }

  // absolute time each line appears
  let t = 0;
  const at = script.map(([, , d]) => (t += d));
  const total = t + 2200; // hold the last frame, then start over

  const size = 22;
  const lh = 33;
  const x0 = 64;
  const top = 128;
  const rows = Math.floor((H - top - 110) / lh);
  let lastCount = -1;

  function frame(count, done) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // title bar
    ctx.font = `500 ${size - 4}px "Geist Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.dim;
    ctx.fillText('~/bittorrent-client', x0, 80);
    const tag = 'PEER WIRE PROTOCOL';
    ctx.fillText(tag, W - x0 - ctx.measureText(tag).width, 80);
    ctx.fillStyle = 'rgba(230,233,245,0.12)';
    ctx.fillRect(x0, 98, W - x0 * 2, 1);

    // log, scrolled so the newest line is at the bottom
    ctx.font = `400 ${size}px "Geist Mono", ui-monospace, monospace`;
    const first = Math.max(0, count - rows);
    for (let i = first; i < count; i++) {
      const [text, color] = script[i];
      ctx.fillStyle = color;
      ctx.fillText(text, x0, top + (i - first + 1) * lh - 8);
    }
    // block cursor after the last line
    if (!done && count > 0) {
      const y = top + (Math.min(count, rows) + 1) * lh - 8;
      ctx.fillStyle = C.fg;
      ctx.fillRect(x0, y - size + 4, size * 0.6, size);
    }

    // progress through the current piece
    let piece = 0;
    let bytes = 0;
    for (let i = 0; i < count; i++) {
      const m = /^Downloaded (\d+)\//.exec(script[i][0]);
      if (m) bytes = Number(m[1]);
      if (script[i][0].startsWith('Downloading piece')) {
        piece = Number(script[i][0].split(' ').pop());
        bytes = 0;
      }
    }
    const barY = H - 80;
    ctx.fillStyle = 'rgba(230,233,245,0.12)';
    ctx.fillRect(x0, barY, W - x0 * 2, 1);
    ctx.font = `500 ${size - 4}px "Geist Mono", ui-monospace, monospace`;
    ctx.fillStyle = C.dim;
    ctx.fillText(piece ? `PIECE ${piece}` : 'CONNECTING', x0, barY + 40);
    const bx = x0 + 200;
    const bw = W - x0 - bx;
    ctx.fillStyle = 'rgba(91,130,255,0.18)';
    ctx.fillRect(bx, barY + 26, bw, 16);
    ctx.fillStyle = C.accent;
    ctx.fillRect(bx, barY + 26, (bw * bytes) / PIECE, 16);
  }

  return {
    // ms since the channel came on
    draw(ms) {
      const local = ms % total;
      let count = 0;
      while (count < at.length && at[count] <= local) count++;
      // the cursor blinks, so redraw on blink edges as well as on new lines
      const blink = Math.floor(ms / 500) % 2;
      const key = count * 2 + blink;
      if (key === lastCount) return false;
      lastCount = key;
      frame(count, count === at.length && !blink);
      return true;
    },
    // a representative still: right after the handshake, mid-download
    still() {
      frame(at.findIndex((v, i) => script[i][0].startsWith('Downloaded 131072')) + 1, true);
      lastCount = -1;
    },
  };
}
