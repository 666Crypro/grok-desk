/* PAPER agent swarm — no wallets, no live orders. */
(function (global) {
  const AGENT_DEFS = [
    { id: "scout", name: "SCOUT", role: "Surface edge" },
    { id: "signal", name: "SIGNAL", role: "Momentum / α" },
    { id: "odds", name: "ODDS", role: "Implied prob" },
    { id: "news", name: "NEWS", role: "Headline filter" },
    { id: "risk", name: "RISK", role: "Gatekeeper" },
    { id: "exec", name: "EXEC", role: "Paper fills" },
    { id: "macro", name: "MACRO", role: "Regime detect" },
    { id: "flow", name: "FLOW", role: "Volume pulse" },
    { id: "arb", name: "ARB", role: "Cross-book" },
    { id: "sent", name: "SENT", role: "Sentiment" },
    { id: "clock", name: "CLOCK", role: "Expiry timing" },
    { id: "audit", name: "AUDIT", role: "Post-trade" },
  ];

  const RISK_LIMITS = {
    maxOpen: 5,
    maxPositionUsd: 800,
    dailyLossHalt: -600,
    minEdge: 0.04,
  };

  function createAgents() {
    return AGENT_DEFS.map((a) => ({
      ...a,
      state: "idle",
      lastAction: "boot",
      trades: 0,
      skips: 0,
    }));
  }

  function createRiskState() {
    return {
      ...RISK_LIMITS,
      openCount: 0,
      dayPnl: 0,
      fired: { maxOpen: false, dailyLoss: false, sizeCap: false, minEdge: false },
    };
  }

  function pickMarket(markets) {
    return markets[Math.floor(Math.random() * markets.length)];
  }

  function estimateEdge(market) {
    // Fake edge: distance from 0.5 + noise, agents "disagree" sometimes
    const base = Math.abs(market.yes - 0.5);
    const noise = (Math.random() - 0.4) * 0.08;
    return base * 0.35 + noise;
  }

  /** Deterministic edge used for ALL-IN default market pick. */
  function edgeScore(market) {
    return Math.abs(market.yes - 0.5) * 0.35;
  }

  /** Market with the best current edge + preferred side (YES if yes>=0.5 else NO). */
  function pickBestEdge(markets) {
    if (!markets || !markets.length) return null;
    let best = markets[0];
    let bestE = edgeScore(best);
    for (let i = 1; i < markets.length; i++) {
      const e = edgeScore(markets[i]);
      if (e > bestE) {
        best = markets[i];
        bestE = e;
      }
    }
    const side = best.yes >= 0.5 ? "YES" : "NO";
    return { market: best, side, edge: bestE };
  }

  /**
   * Manual PAPER-ONLY all-in. Sizes at entire bank.cash.
   * Does not touch LIVE / Uniswap / wallet paths.
   */
  function paperAllIn(ctx) {
    const { market, side, bank, positions } = ctx;
    const cash = Number(bank.cash);
    if (!(cash > 0) || !Number.isFinite(cash)) {
      return { ok: false, reason: "no paper cash" };
    }
    if (!market) return { ok: false, reason: "no market" };
    if (side !== "YES" && side !== "NO") return { ok: false, reason: "bad side" };
    const entry = side === "YES" ? market.yes : market.no;
    const trade = {
      id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 999),
      marketId: market.id,
      title: market.title,
      side,
      entry,
      size: cash,
      openedAt: Date.now(),
      mark: entry,
      unrealized: 0,
      allIn: true,
    };
    bank.cash = 0;
    positions.push(trade);
    return { ok: true, trade, entry, size: cash };
  }

  /**
   * Run one pipeline cycle. Mutates agents, risk, positions, bank, cmds.
   * Returns { stage trail, commands[], trade? }
   */
  function runCycle(ctx) {
    const { agents, markets, positions, risk, bank } = ctx;
    const cmds = [];
    const log = [];
    let stage = "SCAN";
    let trade = null;

    const setAgent = (id, state, action) => {
      const a = agents.find((x) => x.id === id);
      if (a) {
        a.state = state;
        a.lastAction = action;
      }
    };

    // Reset visual states
    agents.forEach((a) => { if (a.state !== "risk") a.state = "idle"; });

    const market = pickMarket(markets);
    setAgent("scout", "scan", `scan ${market.id}`);
    setAgent("flow", "scan", "volume pulse");
    setAgent("news", "scan", "headline pass");
    cmds.push({ tag: "SCAN", text: `${market.title.slice(0, 48)}…`, cls: "" });
    log.push({ text: `SCAN → ${market.title}`, cls: "" });

    // No cash → swarm cannot open more paper trades
    if (!(bank.cash > 0)) {
      stage = "EXIT";
      setAgent("risk", "risk", "NO PAPER CASH");
      setAgent("exec", "skip", "idle · $0 cash");
      agents.forEach((a) => {
        if (a.state === "scan") a.state = "skip";
      });
      cmds.push({ tag: "SKIP", text: "no paper cash — swarm cannot trade", cls: "skip" });
      log.push({ text: "SKIP → no paper cash", cls: "warn" });
      setAgent("audit", "skip", "logged");
      return { stage: "EXIT", cmds, log, trade: null, market, blocked: true };
    }

    // VERIFY
    stage = "VERIFY";
    const edge = estimateEdge(market);
    const side = market.yes >= 0.5 ? "YES" : "NO";
    const conf = 0.45 + Math.random() * 0.5;
    setAgent("signal", "verify", `edge ${(edge * 100).toFixed(1)}%`);
    setAgent("odds", "verify", `yes ${(market.yes * 100).toFixed(0)}¢`);
    setAgent("macro", "verify", "regime ok");
    setAgent("sent", "verify", conf > 0.6 ? "aligned" : "mixed");
    setAgent("clock", "verify", "ttl check");
    cmds.push({
      tag: "VERIFY",
      text: `edge=${(edge * 100).toFixed(1)}% side=${side} conf=${conf.toFixed(2)}`,
      cls: "",
    });
    log.push({ text: `VERIFY → edge ${(edge * 100).toFixed(1)}% · ${side}`, cls: "" });

    // RISK gates
    risk.fired = { maxOpen: false, dailyLoss: false, sizeCap: false, minEdge: false };
    let blocked = false;
    let blockReason = "";

    if (risk.dayPnl <= risk.dailyLossHalt) {
      risk.fired.dailyLoss = true;
      blocked = true;
      blockReason = "DAILY LOSS HALT";
    } else if (positions.length >= risk.maxOpen) {
      risk.fired.maxOpen = true;
      blocked = true;
      blockReason = "MAX OPEN POSITIONS";
    } else if (edge < risk.minEdge) {
      risk.fired.minEdge = true;
      blocked = true;
      blockReason = "EDGE BELOW MIN";
    }

    setAgent("risk", blocked ? "risk" : "verify", blocked ? blockReason : "gates clear");

    if (blocked || Math.random() < 0.28) {
      stage = "EXIT";
      const reason = blocked ? blockReason : "low conviction skip";
      agents.forEach((a) => {
        if (["scout", "signal", "odds", "news"].includes(a.id)) a.skips++;
        if (a.state === "scan" || a.state === "verify") a.state = "skip";
      });
      cmds.push({ tag: "SKIP", text: reason, cls: blocked ? "risk" : "skip" });
      log.push({ text: `SKIP → ${reason}`, cls: blocked ? "warn" : "" });
      setAgent("audit", "skip", "logged");
      return { stage: blocked ? "VERIFY" : "EXIT", cmds, log, trade: null, market, blocked };
    }

    // EXECUTE paper fill
    stage = "EXECUTE";
    let size = 120 + Math.floor(Math.random() * 480);
    if (size > risk.maxPositionUsd) {
      risk.fired.sizeCap = true;
      size = risk.maxPositionUsd;
      cmds.push({ tag: "RISK", text: `size capped → $${size}`, cls: "risk" });
      log.push({ text: `RISK → size capped to $${size}`, cls: "warn" });
    }

    const entry = side === "YES" ? market.yes : market.no;
    const notional = Math.min(size, Math.max(0, bank.cash) * 0.15, Math.max(0, bank.cash));
    if (!(bank.cash > 0) || notional < 50 || bank.cash < notional) {
      risk.fired.sizeCap = true;
      cmds.push({ tag: "SKIP", text: "insufficient paper cash", cls: "skip" });
      log.push({ text: "SKIP → insufficient paper cash", cls: "warn" });
      return { stage: "EXIT", cmds, log, trade: null, market, blocked: true };
    }

    setAgent("exec", "exec", `fill ${side} $${notional.toFixed(0)}`);
    setAgent("arb", "exec", "book ok");
    trade = {
      id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 999),
      marketId: market.id,
      title: market.title,
      side,
      entry,
      size: notional,
      openedAt: Date.now(),
      mark: entry,
      unrealized: 0,
    };
    bank.cash -= notional;
    positions.push(trade);
    risk.openCount = positions.length;
    agents.find((a) => a.id === "exec").trades++;
    cmds.push({
      tag: "EXEC",
      text: `PAPER ${side} $${notional.toFixed(0)} @ ${(entry * 100).toFixed(0)}¢ · ${market.id}`,
      cls: "exec",
    });
    log.push({ text: `EXECUTE → PAPER ${side} $${notional.toFixed(0)}`, cls: "good" });

    // Sometimes immediate EXIT / take profit simulation on older positions
    maybeClosePositions(ctx, cmds, log);

    stage = "EXIT";
    setAgent("audit", "idle", "book synced");
    cmds.push({ tag: "EXIT", text: "cycle complete · paper only", cls: "exit" });
    log.push({ text: "EXIT → awaiting next scan", cls: "" });

    return { stage, cmds, log, trade, market, blocked: false };
  }

  function maybeClosePositions(ctx, cmds, log) {
    const { positions, bank, risk, markets } = ctx;
    const keep = [];
    for (const p of positions) {
      const m = markets.find((x) => x.id === p.marketId);
      if (!m) { keep.push(p); continue; }
      const mark = p.side === "YES" ? m.yes : m.no;
      p.mark = mark;
      // PnL on prediction shares: approx (mark - entry) / entry * size for YES-like
      const pnl = ((mark - p.entry) / Math.max(p.entry, 0.05)) * p.size * 0.85;
      p.unrealized = pnl;
      const ageMin = (Date.now() - p.openedAt) / 60000;
      const takeProfit = pnl > p.size * 0.08 && Math.random() < 0.35;
      const stopLoss = pnl < -p.size * 0.1 && Math.random() < 0.4;
      const timeExit = ageMin > 3 && Math.random() < 0.2;

      if (takeProfit || stopLoss || timeExit) {
        bank.cash += p.size + pnl;
        bank.realized += pnl;
        risk.dayPnl += pnl;
        const cls = pnl >= 0 ? "exec" : "risk";
        cmds.push({
          tag: "EXIT",
          text: `CLOSE ${p.side} ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} · ${p.marketId}`,
          cls,
        });
        log.push({
          text: `EXIT → closed ${p.side} PnL ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
          cls: pnl >= 0 ? "good" : "bad",
        });
      } else {
        keep.push(p);
      }
    }
    positions.length = 0;
    positions.push(...keep);
    risk.openCount = positions.length;
  }

  function markPositions(positions, markets) {
    let unreal = 0;
    for (const p of positions) {
      const m = markets.find((x) => x.id === p.marketId);
      if (!m) continue;
      const mark = p.side === "YES" ? m.yes : m.no;
      p.mark = mark;
      p.unrealized = ((mark - p.entry) / Math.max(p.entry, 0.05)) * p.size * 0.85;
      unreal += p.unrealized;
    }
    return unreal;
  }

  global.GrokAgents = {
    AGENT_DEFS,
    RISK_LIMITS,
    createAgents,
    createRiskState,
    runCycle,
    markPositions,
    maybeClosePositions,
    edgeScore,
    pickBestEdge,
    paperAllIn,
  };
})(window);
