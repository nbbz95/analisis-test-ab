// Tiny dependency-free SVG charts: line, horizontal bars, columns, heatmap.
// Every chart ships a hover tooltip and redraws on resize.
(function (global) {
  const NS = "http://www.w3.org/2000/svg";
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
  const seriesColor = (i) => css(SERIES[i % SERIES.length]);

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function niceTicks(min, max, count) {
    if (min === max) { max = min + 1; }
    const span = max - min;
    const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = (count / span) * step0;
    const step = step0 * (err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  // Tooltip: delay-free after the first one is shown, per Emil's tooltip rule.
  let lastHide = 0;
  function tooltip(host) {
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.setAttribute("role", "status");
    host.appendChild(tip);
    return {
      show(html, x, y) {
        tip.innerHTML = html;
        tip.classList.toggle("instant", Date.now() - lastHide < 300);
        const w = host.clientWidth;
        const tw = tip.offsetWidth || 160;
        const left = x + 14 + tw > w ? x - tw - 14 : x + 14;
        tip.style.setProperty("--tip-origin", left < x ? "top right" : "top left");
        tip.style.left = Math.max(0, left) + "px";
        tip.style.top = Math.max(0, y - 10) + "px";
        tip.classList.add("show");
      },
      hide() {
        if (tip.classList.contains("show")) lastHide = Date.now();
        tip.classList.remove("show");
      },
    };
  }

  function mount(target, draw) {
    const host = typeof target === "string" ? document.querySelector(target) : target;
    host.classList.add("chart");
    let w = 0;
    const render = () => {
      const nw = host.clientWidth;
      if (!nw || nw === w) return;
      w = nw;
      host.querySelectorAll("svg, .tip").forEach((n) => n.remove());
      draw(host, w);
    };
    new ResizeObserver(render).observe(host);
    render();
    return { redraw() { w = 0; render(); } };
  }

  function legend(host, series) {
    const old = host.parentNode.querySelector(":scope > .legend[data-for='" + host.id + "']");
    if (old) old.remove();
    if (series.length < 2) return;
    const lg = document.createElement("div");
    lg.className = "legend";
    lg.dataset.for = host.id;
    lg.innerHTML = series.map((s, i) => `<span><i style="background:${s.color || seriesColor(s.slot ?? i)}"></i>${s.name}</span>`).join("");
    host.parentNode.insertBefore(lg, host);
  }

  // Line chart with crosshair. opts: labels[], series[{name, values[], slot?}], fmt, height, zero
  function line(target, opts) {
    const fmt = opts.fmt || ((v) => v.toLocaleString("en-US"));
    const hostEl = typeof target === "string" ? document.querySelector(target) : target;
    legend(hostEl, opts.series);
    return mount(hostEl, (host, W) => {
      const H = opts.height || 260;
      const m = { t: 10, r: 16, b: 26, l: 52 };
      const all = opts.series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v));
      if (!all.length) { host.insertAdjacentHTML("beforeend", "<svg viewBox='0 0 10 1'></svg>"); return; }
      let lo = Math.min(...all), hi = Math.max(...all);
      if (opts.zero !== false && lo > 0) lo = 0;
      const ticks = niceTicks(lo, hi, 4);
      lo = ticks[0]; hi = ticks[ticks.length - 1];
      const n = opts.labels.length;
      const x = (i) => m.l + (n === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (n - 1));
      const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "Line chart" }, host);
      ticks.forEach((t) => {
        el("line", { class: t === 0 ? "baseline" : "gridline", x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, svg);
        el("text", { class: "tick", x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, svg).textContent = (opts.tickFmt || fmt)(t);
      });
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - m.l - m.r) / 70))));
      opts.labels.forEach((l, i) => {
        if (i % every && i !== n - 1) return;
        if (i !== n - 1 && n - 1 - i < every) return;
        el("text", { class: "tick", x: x(i), y: H - 6, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" }, svg).textContent = l;
      });
      opts.series.forEach((s, si) => {
        const c = s.color || seriesColor(s.slot ?? si);
        let d = "", pen = false;
        s.values.forEach((v, i) => {
          if (v == null || !isFinite(v)) { pen = false; return; }
          d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1);
          pen = true;
        });
        el("path", { class: "line", d, stroke: c }, svg);
      });
      const cross = el("line", { class: "cross", y1: m.t, y2: H - m.b, opacity: 0 }, svg);
      const dots = opts.series.map((s, si) => el("circle", { class: "dot", r: 4.5, fill: s.color || seriesColor(s.slot ?? si), opacity: 0 }, svg));
      const tip = tooltip(host);
      const hit = el("rect", { class: "hit", x: m.l, y: 0, width: W - m.l - m.r, height: H }, svg);
      const move = (ev) => {
        const r = svg.getBoundingClientRect();
        const px = ((ev.clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
        cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
        let rows = "";
        opts.series.forEach((s, si) => {
          const v = s.values[i];
          const ok = v != null && isFinite(v);
          dots[si].setAttribute("opacity", ok ? 1 : 0);
          if (ok) { dots[si].setAttribute("cx", x(i)); dots[si].setAttribute("cy", y(v)); }
          rows += `<div class="row"><span><i style="background:${s.color || seriesColor(s.slot ?? si)}"></i>${s.name}</span><b>${ok ? fmt(v) : "n/a"}</b></div>`;
        });
        tip.show(`<div style="margin-bottom:4px;color:var(--muted)">${opts.labels[i]}</div>${rows}`, (x(i) / W) * r.width, ((ev.clientY - r.top)));
      };
      hit.addEventListener("pointermove", move);
      hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); dots.forEach((d) => d.setAttribute("opacity", 0)); tip.hide(); });
    });
  }

  // Horizontal bars. opts: items[{label, value, note?}], fmt, slot
  function bars(target, opts) {
    const fmt = opts.fmt || ((v) => v.toLocaleString("en-US"));
    return mount(target, (host, W) => {
      const items = opts.items;
      const row = 26, gap = 6;
      const labelW = Math.min(opts.labelWidth || 150, W * 0.38);
      const H = items.length * (row + gap);
      const maxV = Math.max(...items.map((d) => Math.abs(d.value)), 0) || 1;
      const valW = 64;
      const scale = (v) => (Math.abs(v) / maxV) * (W - labelW - valW - 8);
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "Bar chart" }, host);
      const tip = tooltip(host);
      items.forEach((d, i) => {
        const yy = i * (row + gap);
        const color = d.color || seriesColor(opts.slot || 0);
        const t = el("text", { class: "tick", x: 0, y: yy + row / 2 + 4 }, svg);
        t.textContent = d.label.length > 24 ? d.label.slice(0, 23) + "…" : d.label;
        const w = Math.max(2, scale(d.value));
        el("path", { class: "bar", d: roundedBar(labelW, yy + 3, w, row - 6, 4), fill: color }, svg);
        el("text", { class: "dlabel", x: labelW + w + 6, y: yy + row / 2 + 4 }, svg).textContent = fmt(d.value);
        const hit = el("rect", { class: "hit", x: 0, y: yy, width: W, height: row + gap }, svg);
        hit.addEventListener("pointermove", (ev) => {
          const r = svg.getBoundingClientRect();
          tip.show(`<b>${d.label}</b><div class="row"><span>${opts.valueName || "Value"}</span><b>${fmt(d.value)}</b></div>${d.note ? `<div style="color:var(--muted);margin-top:2px">${d.note}</div>` : ""}`,
            ev.clientX - r.left, ev.clientY - r.top);
        });
        hit.addEventListener("pointerleave", () => tip.hide());
        hit.addEventListener("click", () => opts.onClick && opts.onClick(d));
      });
    });
  }

  // A bar anchored left with only its data end rounded.
  function roundedBar(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  function roundedCol(x, y0, w, h, r) {
    // grows up from baseline y0 when h > 0, down when h < 0
    if (h >= 0) {
      r = Math.min(r, w / 2, h);
      const top = y0 - h;
      return `M${x},${y0}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${y0}Z`;
    }
    h = -h; r = Math.min(r, w / 2, h);
    const bot = y0 + h;
    return `M${x},${y0}V${bot - r}Q${x},${bot} ${x + r},${bot}H${x + w - r}Q${x + w},${bot} ${x + w},${bot - r}V${y0}Z`;
  }

  // Vertical columns, supports negatives. opts: labels[], values[], fmt, slot, colorFor(v)
  function columns(target, opts) {
    const fmt = opts.fmt || ((v) => v.toLocaleString("en-US"));
    return mount(target, (host, W) => {
      const H = opts.height || 240;
      const m = { t: 10, r: 8, b: 26, l: 52 };
      const vals = opts.values.map((v) => (v == null || !isFinite(v) ? 0 : v));
      const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
      const lo = ticks[0], hi = ticks[ticks.length - 1];
      const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
      const n = vals.length;
      const band = (W - m.l - m.r) / n;
      const bw = Math.max(2, band - Math.min(12, band * 0.3));
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "Column chart" }, host);
      ticks.forEach((t) => {
        el("line", { class: t === 0 ? "baseline" : "gridline", x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, svg);
        el("text", { class: "tick", x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, svg).textContent = (opts.tickFmt || fmt)(t);
      });
      const tip = tooltip(host);
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - m.l - m.r) / 56))));
      vals.forEach((v, i) => {
        const x0 = m.l + i * band + (band - bw) / 2;
        const color = opts.colorFor ? opts.colorFor(v, i) : seriesColor(opts.slot || 0);
        el("path", { class: "bar", d: roundedCol(x0, y(0), bw, y(0) - y(v), 3), fill: color }, svg);
        if (i % every === 0) el("text", { class: "tick", x: x0 + bw / 2, y: H - 6, "text-anchor": "middle" }, svg).textContent = opts.labels[i];
        const hit = el("rect", { class: "hit", x: m.l + i * band, y: 0, width: band, height: H }, svg);
        hit.addEventListener("pointermove", (ev) => {
          const r = svg.getBoundingClientRect();
          tip.show(`<div style="color:var(--muted);margin-bottom:2px">${opts.labels[i]}</div><div class="row"><span>${opts.valueName || "Value"}</span><b>${opts.values[i] == null ? "n/a" : fmt(v)}</b></div>`, ev.clientX - r.left, ev.clientY - r.top);
        });
        hit.addEventListener("pointerleave", () => tip.hide());
      });
    });
  }

  // Heatmap as an HTML table (accessible by construction). opts: rows[], cols[], cells[r][c], fmt, max
  function heat(target, opts) {
    const host = typeof target === "string" ? document.querySelector(target) : target;
    const fmt = opts.fmt || ((v) => v.toFixed(0));
    const max = opts.max || Math.max(...opts.cells.flat().filter((v) => v != null));
    const step = (v) => Math.min(7, Math.max(1, Math.ceil((v / max) * 7)));
    const dark = css("--page") === "#0d0d0d";
    let h = `<div class="table-wrap"><table class="data heat"><thead><tr><th>${opts.corner || ""}</th>${opts.cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    opts.rows.forEach((r, ri) => {
      h += `<tr><td>${r}</td>`;
      opts.cols.forEach((_, ci) => {
        const v = opts.cells[ri][ci];
        if (v == null) { h += "<td></td>"; return; }
        const s = step(v);
        const ink = dark ? (s >= 6 ? "#0b0b0b" : "#f0efec") : (s >= 5 ? "#fff" : "#0b0b0b");
        const label = String(r).replace(/<[^>]*>/g, "").replace(/"/g, "&quot;");
        h += `<td style="background:var(--seq-${s});color:${ink}" title="${label} · ${opts.cols[ci]}: ${fmt(v)}">${fmt(v)}</td>`;
      });
      h += "</tr>";
    });
    host.innerHTML = h + "</tbody></table></div>";
  }

  function table(target, head, rows) {
    const host = typeof target === "string" ? document.querySelector(target) : target;
    host.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  }

  // Theme toggle that cycles system -> light -> dark and redraws charts.
  function themeToggle(button, onChange, labels) {
    labels = labels || { system: "Auto", light: "Light", dark: "Dark", prefix: "Theme" };
    const order = ["system", "light", "dark"];
    let cur = "system";
    try { cur = localStorage.getItem("theme") || "system"; } catch (e) {}
    const apply = () => {
      if (cur === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", cur);
      button.textContent = labels[cur];
      button.setAttribute("aria-label", labels.prefix + ": " + button.textContent);
    };
    apply();
    button.addEventListener("click", () => {
      cur = order[(order.indexOf(cur) + 1) % 3];
      try { localStorage.setItem("theme", cur); } catch (e) {}
      apply();
      onChange && onChange();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => onChange && onChange());
  }

  global.Charts = { line, bars, columns, heat, table, themeToggle, seriesColor, css };
})(window);
