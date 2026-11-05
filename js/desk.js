/* GROK DESK — paper command center UI loop */
(function () {
  const STARTING_BANK = 10000;

  const state = {
    paused: false,
    speed: 1, // 1, 2, 4
    agents: GrokAgents.createAgents(),
    markets: GrokMarkets.createMarketBook(),
    positions: [],
    risk: GrokAgents.createRiskState(),
    bank: { cash: STARTING_BANK, realized: 0 },
    selectedMarketId: null,
    cmds: [],
    pipeLog: [],
    stage: "IDLE",
    spectrum: [],
    spherePhase: 0,
  };

  state.selectedMarketId = state.markets[0].id;

  const $ = (id) => document.getElementById(id);

  function fmtUsd(n, signed = false) {
    const abs = Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (signed) return (n >= 0 ? "+" : "-") + "$" + abs;
    return (n < 0 ? "-$" : "$") + abs;
  }

  function fmtCents(p) {
    return (p * 100).toFixed(0) + "¢";
  }

  function updateClock() {
    const now = new Date();
    const utc = now.toISOString().slice(11, 19);
    $("utc-clock").textContent = utc;
  }

  function renderAgents() {
    const ul = $("agent-list");
    ul.innerHTML = state.agents
      .map(
        (a) => `
      <li class="agent ${a.state !== "idle" && a.state !== "skip" ? "active" : ""}">
        <span class="dot ${a.state}"></span>
        <div>
          <div class="name">${a.name}</div>
          <div class="role">${a.role}</div>
        </div>
        <div class="state">${a.lastAction}</div>
      </li>`
      )
      .join("");
    $("agent-count").textContent = String(state.agents.length);
  }

  function renderMarkets() {
    const box = $("market-list");
    box.innerHTML = state.markets
      .map((m) => {
        const sel = m.id === state.selectedMarketId ? "selected" : "";
        return `
        <div class="market ${sel}" data-id="${m.id}">
          <div class="title">${escapeHtml(m.title)}</div>
          <div class="odds">
            <span class="yes">YES ${fmtCents(m.yes)}</span>
            <span class="no">NO ${fmtCents(m.no)}</span>
            <span class="vol">vol ${(m.vol / 1000).toFixed(0)}k</span>
          </div>
        </div>`;
      })
      .join("");
    box.querySelectorAll(".market").forEach((el) => {
      el.addEventListener("click", () => {
        state.selectedMarketId = el.dataset.id;
        renderMarkets();
        drawTape();
        updateSpotMeta();
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderRisk() {
    const r = state.risk;
    $("risk-gates").innerHTML = `
      <div class="risk-item ${r.fired.maxOpen ? "fired" : ""}">
        <span>Max open</span>
        <span class="val">${r.openCount}/${r.maxOpen}</span>
      </div>
      <div class="risk-item ${r.fired.sizeCap ? "fired" : ""}">
        <span>Size cap</span>
        <span class="val">$${r.maxPositionUsd}</span>
      </div>
      <div class="risk-item ${r.fired.dailyLoss ? "fired" : ""}">
        <span>Daily loss halt</span>
        <span class="val">${fmtUsd(r.dailyLossHalt, true)}</span>
      </div>
      <div class="risk-item ${r.fired.minEdge ? "fired" : ""}">
        <span>Min edge</span>
        <span class="val">${(r.minEdge * 100).toFixed(0)}%</span>
      </div>`;
    const any = Object.values(r.fired).some(Boolean);
    const st = $("risk-status");
    if (r.dayPnl <= r.dailyLossHalt) {
      st.textContent = "HALTED";
      st.className = "pill halt";
    } else if (any) {
      st.textContent = "FIRED";
      st.className = "pill halt";
    } else {
      st.textContent = "ARMED";
      st.className = "pill muted";
    }
  }

  function renderPipeline(stage) {
    state.stage = stage || state.stage;
    document.querySelectorAll(".pipe-step").forEach((el) => {
      el.classList.toggle("on", el.dataset.step === state.stage);
    });
    $("pipeline-stage").textContent = state.stage;
  }

  function pushCmds(cmds) {
    state.cmds = [...cmds, ...state.cmds].slice(0, 40);
    $("cmd-stack").innerHTML = state.cmds
      .map(
        (c) =>
          `<li class="${c.cls || ""}"><span class="tag">[${c.tag}]</span>${escapeHtml(c.text)}</li>`
      )
      .join("");
    $("cmd-count").textContent = String(state.cmds.length);
  }

  function pushPipeLog(lines) {
    state.pipeLog = [...lines, ...state.pipeLog].slice(0, 12);
    $("pipe-log").innerHTML = state.pipeLog
      .map((l) => `<div class="line ${l.cls || ""}">${escapeHtml(l.text)}</div>`)
      .join("");
  }

  function renderPositions() {
    const box = $("pos-list");
    $("pos-count").textContent = String(state.positions.length);
    $("open-count").textContent = String(state.positions.length);
    if (!state.positions.length) {
      box.innerHTML = `<div class="empty">No open paper positions</div>`;
      return;
    }
    box.innerHTML = state.positions
      .map((p) => {
        const cls = p.unrealized >= 0 ? "up" : "down";
        return `
        <div class="pos">
          <div>
            <div class="side ${p.side.toLowerCase()}">${p.side} · ${escapeHtml(p.title.slice(0, 36))}</div>
            <div class="tiny mono">${fmtCents(p.entry)} → ${fmtCents(p.mark)} · $${p.size.toFixed(0)}</div>
          </div>
          <div class="pnl ${cls} mono">${fmtUsd(p.unrealized, true)}</div>
        </div>`;
      })
      .join("");
  }

  function updateBankUi() {
    const unreal = GrokAgents.markPositions(state.positions, state.markets);
    const equity = state.bank.cash + state.positions.reduce((s, p) => s + p.size, 0) + unreal;
    // Simpler: equity = cash + sum(size + unrealized) for open
    const openValue = state.positions.reduce((s, p) => s + p.size + p.unrealized, 0);
    const total = state.bank.cash + openValue;
    const pnl = total - STARTING_BANK;
    const el = $("swarm-pnl");
    el.textContent = fmtUsd(pnl, true);
    el.className = "metric-value mono " + (pnl >= 0 ? "up" : "down");
    $("paper-bank").textContent = fmtUsd(total);
  }

  function updateSpotMeta() {
    const m = state.markets.find((x) => x.id === state.selectedMarketId) || state.markets[0];
    $("spot-val").textContent = fmtCents(m.yes);
    $("open-val").textContent = String(state.positions.filter((p) => p.marketId === m.id).length);
    const ms = Math.max(0, m.endsAt - Date.now());
    const h = Math.floor(ms / 3600000);
    const min = Math.floor((ms % 3600000) / 60000);
    $("time-left").textContent = `${h}h ${min}m`;
    $("tape-market").textContent = m.id.toUpperCase();
    $("tape-last").textContent = `last YES ${fmtCents(m.yes)}`;
  }

  /* ---- Canvas: wireframe sphere ---- */
  function drawSphere() {
    const canvas = $("sphere-canvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // grid floor
    ctx.strokeStyle = "rgba(92,225,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const y = h * 0.55 + i * 14;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 40, y);
      ctx.stroke();
    }

    const cx = w / 2;
    const cy = h * 0.46;
    const R = Math.min(w, h) * 0.32;
    state.spherePhase += 0.008 * state.speed;

    // latitude / longitude wireframe
    ctx.strokeStyle = "rgba(92,225,255,0.35)";
    ctx.lineWidth = 1.2;
    const rotY = state.spherePhase;
    const rotX = 0.4;

    function project(x, y, z) {
      // rotate Y then X
      let x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
      let z1 = x * Math.sin(rotY) + z * Math.cos(rotY);
      let y1 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
      let z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
      const scale = 1.6 / (2.2 + z2 / R);
      return [cx + x1 * scale, cy + y1 * scale, z2];
    }

    // meridians
    for (let m = 0; m < 10; m++) {
      const lon = (m / 10) * Math.PI * 2;
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const lat = (i / 48) * Math.PI - Math.PI / 2;
        const x = R * Math.cos(lat) * Math.cos(lon);
        const y = R * Math.sin(lat);
        const z = R * Math.cos(lat) * Math.sin(lon);
        const [px, py] = project(x, y, z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // parallels
    for (let p = 1; p < 8; p++) {
      const lat = (p / 8) * Math.PI - Math.PI / 2;
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const lon = (i / 64) * Math.PI * 2;
        const x = R * Math.cos(lat) * Math.cos(lon);
        const y = R * Math.sin(lat);
        const z = R * Math.cos(lat) * Math.sin(lon);
        const [px, py] = project(x, y, z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // glowing core
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, R * 0.55);
    g.addColorStop(0, "rgba(139,124,255,0.55)");
    g.addColorStop(0.5, "rgba(92,225,255,0.12)");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // orbiting nodes (agents)
    const active = state.agents.filter((a) => a.state !== "idle" && a.state !== "skip");
    const nodes = active.length ? active : state.agents.slice(0, 6);
    nodes.forEach((a, i) => {
      const t = state.spherePhase * 1.5 + (i / nodes.length) * Math.PI * 2;
      const lat = Math.sin(t * 0.7 + i) * 0.7;
      const lon = t;
      const x = R * 1.05 * Math.cos(lat) * Math.cos(lon);
      const y = R * 1.05 * Math.sin(lat);
      const z = R * 1.05 * Math.cos(lat) * Math.sin(lon);
      const [px, py, z2] = project(x, y, z);
      const alpha = 0.4 + 0.6 * ((z2 + R) / (2 * R));
      ctx.fillStyle = a.state === "exec" ? `rgba(157,255,106,${alpha})` :
        a.state === "risk" ? `rgba(255,200,87,${alpha})` :
        `rgba(92,225,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "10px IBM Plex Mono";
      ctx.fillStyle = `rgba(232,238,248,${alpha})`;
      ctx.fillText(a.name, px + 6, py - 4);
    });

    // ring
    ctx.strokeStyle = "rgba(157,255,106,0.25)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.15, R * 1.15, R * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ---- Candlestick tape ---- */
  function drawTape() {
    const canvas = $("tape-canvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const m = state.markets.find((x) => x.id === state.selectedMarketId) || state.markets[0];
    const bars = m.history;
    const pad = 16;
    const bw = (w - pad * 2) / bars.length;

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    bars.forEach((b, i) => {
      const x = pad + i * bw + bw * 0.5;
      const yOpen = h - pad - b.open * (h - pad * 2);
      const yClose = h - pad - b.close * (h - pad * 2);
      const yHigh = h - pad - b.high * (h - pad * 2);
      const yLow = h - pad - b.low * (h - pad * 2);
      const up = b.close >= b.open;
      ctx.strokeStyle = up ? "#9dff6a" : "#ff5d7a";
      ctx.fillStyle = up ? "rgba(157,255,106,0.85)" : "rgba(255,93,122,0.85)";
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();
      const top = Math.min(yOpen, yClose);
      const bh = Math.max(2, Math.abs(yClose - yOpen));
      ctx.fillRect(x - bw * 0.3, top, bw * 0.6, bh);
    });
  }

  /* ---- Spectrogram ---- */
  function pushSpectrum() {
    const row = [];
    for (let i = 0; i < 48; i++) {
      const base = Math.random();
      const boost = state.stage === "EXECUTE" ? 0.35 : state.stage === "VERIFY" ? 0.2 : 0.05;
      row.push(Math.min(1, base * 0.7 + boost * Math.random()));
    }
    state.spectrum.push(row);
    if (state.spectrum.length > 36) state.spectrum.shift();
  }

  function drawSpectrum() {
    const canvas = $("spec-canvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const rows = state.spectrum;
    if (!rows.length) return;
    const cw = w / rows[0].length;
    const rh = h / rows.length;
    rows.forEach((row, y) => {
      row.forEach((v, x) => {
        const r = Math.floor(20 + v * 80);
        const g = Math.floor(40 + v * 180);
        const b = Math.floor(80 + v * 175);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x * cw, y * rh, cw + 0.5, rh + 0.5);
      });
    });
  }

  /* ---- Simulation ticks ---- */
  let marketAcc = 0;
  let cycleAcc = 0;
  let lastTs = performance.now();

  function tick(ts) {
    const dt = ts - lastTs;
    lastTs = ts;

    updateClock();
    drawSphere();

    if (!state.paused) {
      marketAcc += dt * state.speed;
      cycleAcc += dt * state.speed;

      if (marketAcc > 1200) {
        marketAcc = 0;
        GrokMarkets.tickMarkets(state.markets);
        drawTape();
        updateSpotMeta();
        updateBankUi();
        renderPositions();
        renderMarkets();
      }

      if (cycleAcc > 2800) {
        cycleAcc = 0;
        const result = GrokAgents.runCycle({
          agents: state.agents,
          markets: state.markets,
          positions: state.positions,
          risk: state.risk,
          bank: state.bank,
        });
        if (result.market) {
          state.selectedMarketId = result.market.id;
          $("sphere-ticker").textContent =
            `[PAPER] ${result.market.title} · ${(result.market.yes * 100).toFixed(0)}¢ YES`;
          $("node-label").textContent = `SWARM://${result.market.id.toUpperCase()}`;
        }
        renderPipeline(result.stage);
        pushCmds(result.cmds);
        pushPipeLog(result.log);
        renderAgents();
        renderRisk();
        renderPositions();
        renderMarkets();
        updateBankUi();
        updateSpotMeta();
        drawTape();
        $("swarm-status").textContent = state.risk.dayPnl <= state.risk.dailyLossHalt ? "HALTED" : "LIVE";
        if (state.risk.dayPnl <= state.risk.dailyLossHalt) {
          $("swarm-status").className = "pill halt";
        } else {
          $("swarm-status").className = "pill live";
        }
      }

      if (Math.random() < 0.2 * state.speed) {
        pushSpectrum();
        drawSpectrum();
      }
    }

    requestAnimationFrame(tick);
  }

  // Controls
  $("btn-pause").addEventListener("click", () => {
    state.paused = !state.paused;
    $("btn-pause").textContent = state.paused ? "RESUME" : "PAUSE";
    $("swarm-status").textContent = state.paused ? "PAUSED" : "LIVE";
  });

  $("btn-speed").addEventListener("click", () => {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
    $("btn-speed").textContent = state.speed + "×";
  });

  // Boot
  renderAgents();
  renderMarkets();
  renderRisk();
  renderPipeline("IDLE");
  renderPositions();
  updateBankUi();
  updateSpotMeta();
  drawTape();
  pushSpectrum();
  drawSpectrum();
  pushCmds([{ tag: "SYS", text: "PAPER desk online · no wallet · no live orders", cls: "" }]);
  pushPipeLog([{ text: "BOOT → paper swarm armed ($10,000)", cls: "good" }]);
  $("sphere-ticker").textContent = "paper swarm online — simulation only";

  requestAnimationFrame(tick);
})();
