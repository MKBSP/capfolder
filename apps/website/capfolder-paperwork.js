/* <capfolder-paperwork> — scattered documents gather into one folder.
   Dependency-free. Usage: <script src="capfolder-paperwork.js" defer></script>
   On capfolder.com the site's Pause button (class motion-paused on <html>) pauses it too.
   <capfolder-paperwork captions></capfolder-paperwork>
   Pauses off-screen, on prefers-reduced-motion (shows the final frame),
   and when <html> or <body> has class "paused" / attribute data-paused.
   API: el.pause(), el.play(). */
(() => {
  const C = 0.8660254,
    S = 0.5;
  const INK = "#1C2B24",
    FACE = "#FFFFFF",
    MINT = "#E8F3EC",
    MINT2 = "#CFE8D8",
    G = "#1F6F4A",
    G2 = "#2A8659",
    GD = "#154F35",
    MUTE = "#8A948E",
    GREY = "#55605A",
    RULE = "#D3D9D4";
  const CUE = { Scattered: 0, Gather: 3.2, Owned: 7.0, Reset: 10.4 },
    TOTAL = 11.2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const E = {
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
    out: (t) => 1 - (1 - t) ** 3,
    back: (t) => {
      const c1 = 1.70158,
        c3 = c1 + 1;
      return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    },
  };
  const M = {
    enter: (t, a, b) => E.inOut(clamp((t - a) / (b - a), 0, 1)),
    draw: (t, a, b) => E.out(clamp((t - a) / (b - a), 0, 1)),
    pop: (t, a, b) => E.back(clamp((t - a) / (b - a), 0, 1)),
  };
  const P = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z];
  const pts = (a) => a.map((p) => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const len = (v) => Math.hypot(v[0], v[1], v[2]);
  const dirLerp = (a, b, t) => {
    const la = len(a),
      lb = len(b);
    const d = lerp3(
      a.map((x) => x / la),
      b.map((x) => x / lb),
      t,
    );
    const ld = len(d) || 1;
    const L = lerp(la, lb, t);
    return d.map((x) => (x / ld) * L);
  };
  const SW = 1.4,
    ST = `stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"`;
  const FONT = 'font-family="IBM Plex Sans, system-ui, sans-serif"';
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const box = (x, y, z, w, d, h, top = FACE, front = INK, right = INK) =>
    (h > 0.05
      ? `<polygon points="${pts([P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)])}" fill="${right}" ${ST}/>` +
        `<polygon points="${pts([P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)])}" fill="${front}" ${ST}/>`
      : "") +
    `<polygon points="${pts([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)])}" fill="${top}" ${ST}/>`;

  const SCALE = 1.3,
    U0 = 22,
    V0 = 28,
    UF = 34,
    VF = 43;
  const DOCS = [
    {
      t: "SAFE",
      sub: "Y Combinator · $500,000",
      src: "PULLEY",
      x: -190,
      y: -40,
      z: 34,
      rot: -18,
      acc: true,
      fx: -2,
      fz: 62,
    },
    { t: "Re: Fwd:", sub: "FINAL v3.pdf", src: "GMAIL", x: -125, y: 125, z: 18, rot: 12, fx: -30, fz: 54 },
    {
      t: "scan_0042",
      sub: "Fund X · cap unreadable",
      src: "SCANNER",
      x: 150,
      y: -165,
      z: 42,
      rot: 24,
      fx: 26,
      fz: 50,
    },
    {
      t: "Option grant",
      sub: "Lisa Moreau · 40,000",
      src: "DOWNLOADS",
      x: 215,
      y: 40,
      z: 24,
      rot: -10,
      fx: -18,
      fz: 56,
    },
    {
      t: "83(b)",
      sub: "Sam Carter · 2021",
      src: "IMG_2231.JPG",
      x: 10,
      y: 160,
      z: 36,
      rot: -28,
      fx: 16,
      fz: 52,
    },
    {
      t: "SAFE",
      sub: "Angel A · $150,000",
      src: "THEIR PAPER",
      x: -40,
      y: -215,
      z: 22,
      rot: 16,
      fx: -6,
      fz: 48,
    },
  ];

  function sheet(c, u, v, doc, check) {
    const pt = (s, t) => [c[0] + s * u[0] + t * v[0], c[1] + s * u[1] + t * v[1], c[2] + s * u[2] + t * v[2]];
    const corners = [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)].map((q) => P(...q));
    const pu = P(...u),
      pv = P(...v),
      lu = len(u),
      lv = len(v),
      k = (lu / U0 + lv / V0) / 2;
    const mx = (s, t) => {
      const o = P(...pt(s, t));
      return `matrix(${((pu[0] / lu) * k).toFixed(4)},${((pu[1] / lu) * k).toFixed(4)},${((pv[0] / lv) * k).toFixed(4)},${((pv[1] / lv) * k).toFixed(4)},${o[0].toFixed(2)},${o[1].toFixed(2)})`;
    };
    const quad = (s0, t0, s1, t1) =>
      pts([pt(s0, t0), pt(s1, t0), pt(s1, t1), pt(s0, t1)].map((q) => P(...q)));
    let o =
      `<polygon points="${pts(corners.map(([a, b]) => [a + 1.4, b + 2.6]))}" fill="${INK}" ${ST}/>` +
      `<polygon points="${pts(corners)}" fill="${FACE}" ${ST}/>`;
    if (doc.acc)
      o += `<polygon points="${quad(-1, -1, 1, -0.8)}" fill="${G}" stroke="${INK}" stroke-width="${SW * 0.8}" stroke-linejoin="round"/>`;
    o +=
      `<text transform="${mx(-0.78, -0.5)}" ${FONT} font-weight="500" font-size="6" fill="${INK}">${esc(doc.t)}</text>` +
      `<text transform="${mx(-0.78, -0.3)}" ${FONT} font-size="4.2" fill="${GREY}">${esc(doc.sub)}</text>` +
      `<polygon points="${quad(-0.78, -0.1, 0.6, -0.04)}" fill="${RULE}"/>` +
      `<polygon points="${quad(-0.78, 0.08, 0.74, 0.14)}" fill="${RULE}"/>` +
      `<polygon points="${quad(-0.78, 0.26, 0.3, 0.32)}" fill="${RULE}"/>` +
      `<polygon points="${quad(-0.78, 0.6, -0.1, 0.62)}" fill="${INK}"/>` +
      `<text transform="${mx(-0.78, 0.86)}" ${FONT} font-weight="500" font-size="3.6" letter-spacing="0.4" fill="${MUTE}">${esc(doc.src)}</text>`;
    if (check > 0.01) {
      const ring = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        ring.push(
          P(...pt(0.66 + Math.cos(a) * 0.17 * check, -0.56 + Math.sin(a) * 0.17 * check * (lu / lv))),
        );
      }
      o +=
        `<g opacity="${clamp(check, 0, 1).toFixed(3)}"><polygon points="${pts(ring)}" fill="${G}" stroke="${INK}" stroke-width="${SW * 0.7}"/>` +
        `<polyline points="${pts([pt(0.58, -0.56), pt(0.64, -0.5), pt(0.75, -0.63)].map((q) => P(...q)))}" fill="none" stroke="${FACE}" stroke-width="${(1.3 * check).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }
    return o;
  }

  function frame(T) {
    const g0 = CUE.Gather,
      o0 = CUE.Owned;
    const fade = T < 0.6 ? M.draw(T, 0, 0.6) : 1 - M.enter(T, CUE.Reset, TOTAL);
    const cam = lerp(1.18, 1.42, M.enter(T, 0, CUE.Reset)),
      camY = lerp(20, 70, M.enter(T, 0, CUE.Reset));
    const baseH = 6 * M.draw(T, g0, g0 + 0.5),
      backH = 92 * M.pop(T, g0 + 0.15, g0 + 0.85),
      tabH = 10 * M.pop(T, g0 + 0.7, g0 + 1.0);
    const frontH = 44 * M.pop(T, o0, o0 + 0.7),
      labelO = M.draw(T, o0 + 0.5, o0 + 1.0),
      spotO = 1 - M.draw(T, g0, g0 + 0.5);
    const sheets = DOCS.map((d, i) => {
      const bob = Math.sin(T * 1.6 + i * 1.3) * 4,
        rot = ((d.rot + Math.sin(T * 0.9 + i) * 3) * Math.PI) / 180;
      const fs = g0 + 0.7 + i * 0.32,
        fe = fs + 1.15;
      const dip = -6 * Math.sin(Math.PI * clamp((T - (fs - 0.35)) / 0.35, 0, 1));
      const p = M.enter(T, fs, fe);
      const c = lerp3([d.x * SCALE, d.y * SCALE, d.z + bob + dip], [d.fx, -17 + i * 4, d.fz], p);
      c[2] += Math.sin(p * Math.PI) * 120;
      const u = dirLerp([Math.cos(rot) * U0, Math.sin(rot) * U0, 0], [UF, 0, 0], p);
      const v = dirLerp([-Math.sin(rot) * V0, Math.cos(rot) * V0, 0], [0, 0, -VF], p);
      return { d, i, c, u, v, p, check: M.pop(T, o0 + 0.9 + i * 0.12, o0 + 1.3 + i * 0.12) };
    });
    const shadow = (s) => {
      const pt = (a, b) => [s.c[0] + a * s.u[0] + b * s.v[0], s.c[1] + a * s.u[1] + b * s.v[1]];
      const q = [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)].map(([x, y]) => P(x, y, 0));
      return `<polygon points="${pts(q)}" fill="${MINT2}" opacity="${((1 - s.p) * (0.95 - clamp(s.c[2] / 200, 0, 0.6))).toFixed(3)}"/>`;
    };
    const fx = (x, y, z) => {
      const o = P(x, y, z);
      return `matrix(${C},${S},0,1,${o[0].toFixed(2)},${o[1].toFixed(2)})`;
    };
    const draw = (s) => sheet(s.c, s.u, s.v, s.d, s.check);
    let g = `<polygon points="${pts([P(-85, -30), P(85, -30), P(85, 34), P(-85, 34)])}" fill="none" stroke="${MUTE}" stroke-width="${SW}" stroke-dasharray="5 6" opacity="${spotO.toFixed(3)}"/>`;
    g += sheets.map(shadow).join("");
    if (baseH > 0.05) g += box(-85, -30, 0, 170, 64, baseH, MINT);
    if (backH > 0.5) g += box(-70, -24, 6, 140, 5, backH, G2, G, GD);
    if (tabH > 0.3) g += box(-70, -24, 6 + backH, 50, 5, tabH, G2, G, GD);
    g += sheets
      .filter((s) => s.p >= 1)
      .sort((a, b) => a.c[1] - b.c[1])
      .map(draw)
      .join("");
    if (frontH > 0.5) g += box(-70, 8, 6, 140, 5, frontH, G2, G, GD);
    if (labelO > 0)
      g += `<g opacity="${labelO.toFixed(3)}" ${FONT}><text transform="${fx(-60, 13, 32)}" font-weight="500" font-size="11" letter-spacing="1.2" fill="${FACE}">CAP TABLE</text><text transform="${fx(-60, 13, 21)}" font-size="6.4" fill="${MINT2}">6 documents · all matched</text></g>`;
    g += sheets
      .filter((s) => s.p < 1)
      .sort((a, b) => a.c[0] + a.c[1] - (b.c[0] + b.c[1]))
      .map(draw)
      .join("");
    return {
      svg: `<g opacity="${fade.toFixed(3)}"><g transform="translate(0,${camY.toFixed(2)}) scale(${cam.toFixed(4)})">${g}</g></g>`,
      fade,
    };
  }

  const CAPS = [
    { at: 0.5, until: CUE.Gather + 0.2, text: "SAFEs in Pulley. Scans in Downloads. Replies in Gmail." },
    {
      at: CUE.Gather + 0.5,
      until: CUE.Owned + 0.3,
      text: "Drop them in. Capfolder reads and sorts each one.",
    },
    { at: CUE.Owned + 0.6, until: CUE.Reset, text: "One folder you own. Every document matched to a row." },
  ];

  class CapfolderPaperwork extends HTMLElement {
    connectedCallback() {
      if (this._root) return;
      const root = (this._root = this.attachShadow({ mode: "open" }));
      root.innerHTML =
        `<style>:host{display:block;position:relative;aspect-ratio:16/9;background:#fff;overflow:hidden;font-family:'IBM Plex Sans',system-ui,sans-serif}svg{position:absolute;inset:0;width:100%;height:100%;display:block}.cap{position:absolute;left:5%;bottom:7%;right:5%;font-weight:500;font-size:clamp(14px,2.1cqw,40px);color:${INK};transition:opacity .18s;text-wrap:balance}:host{container-type:inline-size}</style>` +
        `<svg viewBox="-480 -270 960 540" role="img" aria-label="Scattered cap table documents gather into one Capfolder folder"><g id="s"></g></svg><div class="cap" aria-live="off"></div>`;
      this._g = root.getElementById("s");
      this._cap = root.querySelector(".cap");
      this._t = 0;
      this._last = null;
      this._visible = false;
      this._manual = false;
      this._rm = matchMedia("(prefers-reduced-motion: reduce)");
      this._io = new IntersectionObserver(
        (es) => {
          this._visible = es[0].isIntersecting;
          this._tick();
        },
        { threshold: 0.15 },
      );
      this._io.observe(this);
      this._mo = new MutationObserver(() => this._tick());
      [document.documentElement, document.body].forEach(
        (n) => n && this._mo.observe(n, { attributes: true, attributeFilter: ["class", "data-paused"] }),
      );
      this._rm.addEventListener?.("change", () => this._tick());
      this._render();
    }
    disconnectedCallback() {
      this._io?.disconnect();
      this._mo?.disconnect();
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    pause() {
      this._manual = true;
      this._tick();
    }
    play() {
      this._manual = false;
      this._tick();
    }
    get _sitePaused() {
      return [document.documentElement, document.body].some(
        (n) =>
          n &&
          (n.classList.contains("paused") ||
            n.classList.contains("motion-paused") ||
            n.hasAttribute("data-paused")),
      );
    }
    get _running() {
      return this._visible && !this._manual && !this._sitePaused && !this._rm.matches;
    }
    _tick() {
      if (this._rm.matches) {
        this._t = CUE.Owned + 2.5;
        this._render();
      }
      if (this._running && !this._raf) {
        this._last = null;
        this._raf = requestAnimationFrame(
          (this._loop =
            this._loop ||
            ((now) => {
              if (!this._running) {
                this._raf = null;
                return;
              }
              if (this._last != null) this._t = (this._t + Math.min(0.1, (now - this._last) / 1000)) % TOTAL;
              this._last = now;
              this._render();
              this._raf = requestAnimationFrame(this._loop);
            })),
        );
      }
    }
    _render() {
      const f = frame(this._t);
      this._g.innerHTML = f.svg;
      if (this.hasAttribute("captions")) {
        const c = CAPS.find((c) => this._t >= c.at && this._t < c.until);
        if (c && this._cap.textContent !== c.text) this._cap.textContent = c.text;
        this._cap.style.opacity = c ? f.fade : 0;
      } else this._cap.style.opacity = 0;
    }
  }
  if (!customElements.get("capfolder-paperwork"))
    customElements.define("capfolder-paperwork", CapfolderPaperwork);
})();
