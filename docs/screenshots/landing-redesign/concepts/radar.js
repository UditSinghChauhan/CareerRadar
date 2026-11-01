// Draws the real radar field (radar-field.tsx buildField) on a canvas.
// Concept mockups only. opts: { theme: 'dark'|'light', lit: bool, rings: bool,
// dim: 0..1 (fade the non-found field), found: [{x,y}] overrides for the ten }.
window.drawRadar = function drawRadar(canvas, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(canvas);
  const signal = css.getPropertyValue("--k-signal").trim();
  const rule = css.getPropertyValue("--k-rule").trim();
  const point = css.getPropertyValue("--k-point").trim();
  const dark = opts.theme !== "light";
  const cx = opts.cx ?? w / 2,
    cy = opts.cy ?? h / 2,
    R = opts.r ?? Math.min(w, h) / 2 - 2;

  if (opts.lit) {
    // The object's own surface, lit from above: depiction, not decoration.
    const g = ctx.createRadialGradient(cx, cy - R * 0.55, R * 0.05, cx, cy, R);
    g.addColorStop(0, dark ? "rgba(255,255,255,0.075)" : "rgba(0,0,0,0.035)");
    g.addColorStop(1, dark ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.012)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.rings !== false) {
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    for (const f of [1, 0.66, 0.33]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const dim = opts.dim ?? 0;
  const found = [];
  for (const p of window.CR.field) {
    if (p.found) {
      found.push(p);
      continue;
    }
    const a =
      (p.tone === 0 ? 0.22 : p.tone === 1 ? 0.42 : 0.7) *
      Math.max(0, p.fade) *
      (1 - dim);
    if (a <= 0.01) continue;
    ctx.fillStyle = `rgba(${point},${dark ? a : a * 0.75})`;
    const s = p.size * (opts.pointScale ?? 1) * (R / 300);
    ctx.fillRect(cx + p.x * R, cy + p.y * R, Math.max(1, s), Math.max(1, s));
  }
  const targets =
    opts.found || found.map((p) => ({ x: cx + p.x * R, y: cy + p.y * R }));
  if (opts.trails) {
    ctx.strokeStyle = signal;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    found.forEach((p, i) => {
      const t = targets[i];
      if (!t) return;
      ctx.beginPath();
      ctx.moveTo(cx + p.x * R, cy + p.y * R);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  const size = opts.foundSize ?? Math.max(3, R / 70);
  targets.forEach((t) => {
    if (opts.lit) {
      ctx.globalAlpha = dark ? 0.22 : 0.14;
      ctx.fillStyle = signal;
      ctx.beginPath();
      ctx.arc(t.x, t.y, size * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = signal;
    ctx.beginPath();
    ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
    ctx.fill();
  });
  return {
    cx,
    cy,
    R,
    found: found.map((p) => ({ x: cx + p.x * R, y: cy + p.y * R })),
  };
};

window.LOGO =
  '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128 24C70.6 24 24 70.6 24 128s46.6 104 104 104 104-46.6 104-104S185.4 24 128 24Zm0 192c-48.6 0-88-39.4-88-88s39.4-88 88-88 88 39.4 88 88-39.4 88-88 88Z"/><path d="M128 72c-30.9 0-56 25.1-56 56s25.1 56 56 56 56-25.1 56-56-25.1-56-56-56Zm0 96c-22.1 0-40-17.9-40-40s17.9-40 40-40 40 17.9 40 40-17.9 40-40 40Z"/><path d="M128 112c-8.8 0-16 7.2-16 16s7.2 16 16 16 16-7.2 16-16-7.2-16-16-16Z"/></svg>';
window.MOON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>';
window.SUN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
window.navHTML = (dark) => `<header class="nav"><div class="nav__in">
  <a class="word" href="#">${window.LOGO}CareerRadar</a>
  <nav class="nav__r" aria-label="Account"><a class="link" href="#">Sign in</a>
  <button class="toggle" aria-label="Switch to ${dark ? "light" : "dark"} theme">${dark ? window.SUN : window.MOON}</button>
  <a class="btn2" href="#">Get started</a></nav></div></header>`;
