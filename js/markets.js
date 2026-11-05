/* PAPER markets — seeded simulation. Titles are illustrative only. */
(function (global) {
  const SEED_MARKETS = [
    { id: "m1", title: "Will BTC close above $100k this month?", yes: 0.58, no: 0.42, vol: 1.2e6 },
    { id: "m2", title: "Fed holds rates at next meeting?", yes: 0.71, no: 0.29, vol: 890000 },
    { id: "m3", title: "ETH ETF weekly inflows positive?", yes: 0.54, no: 0.46, vol: 410000 },
    { id: "m4", title: "SOL flips BNB by market cap in 2026?", yes: 0.22, no: 0.78, vol: 320000 },
    { id: "m5", title: "US CPI print cooler than expected?", yes: 0.47, no: 0.53, vol: 760000 },
    { id: "m6", title: "Major AI IPO prices this quarter?", yes: 0.33, no: 0.67, vol: 540000 },
    { id: "m7", title: "Oil settles above $80/bbl next week?", yes: 0.41, no: 0.59, vol: 280000 },
    { id: "m8", title: "Polymarket weekly volume > $50M?", yes: 0.62, no: 0.38, vol: 150000 },
    { id: "m9", title: "SpaceX Starship reaches orbit?", yes: 0.39, no: 0.61, vol: 990000 },
    { id: "m10", title: "Gold hits new ATH this month?", yes: 0.51, no: 0.49, vol: 670000 },
    { id: "m11", title: "NVIDIA market cap stays #1 chip?", yes: 0.81, no: 0.19, vol: 1.1e6 },
    { id: "m12", title: "ETH gas avg under 20 gwei this week?", yes: 0.44, no: 0.56, vol: 210000 },
  ];

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function createMarketBook() {
    return SEED_MARKETS.map((m) => ({
      ...m,
      yes: m.yes,
      no: 1 - m.yes,
      history: seedHistory(m.yes),
      endsAt: Date.now() + (4 + Math.random() * 48) * 3600 * 1000,
      informational: true,
    }));
  }

  function seedHistory(start, n = 48) {
    const bars = [];
    let p = start;
    for (let i = 0; i < n; i++) {
      const open = p;
      const drift = (Math.random() - 0.5) * 0.04;
      const close = clamp(open + drift, 0.05, 0.95);
      const high = clamp(Math.max(open, close) + Math.random() * 0.015, 0.05, 0.95);
      const low = clamp(Math.min(open, close) - Math.random() * 0.015, 0.05, 0.95);
      bars.push({ open, high, low, close, t: Date.now() - (n - i) * 60000 });
      p = close;
    }
    return bars;
  }

  function tickMarkets(markets) {
    for (const m of markets) {
      const last = m.history[m.history.length - 1];
      const open = last.close;
      const drift = (Math.random() - 0.5) * 0.028;
      const close = clamp(open + drift, 0.05, 0.95);
      const high = clamp(Math.max(open, close) + Math.random() * 0.01, 0.05, 0.95);
      const low = clamp(Math.min(open, close) - Math.random() * 0.01, 0.05, 0.95);
      m.history.push({ open, high, low, close, t: Date.now() });
      if (m.history.length > 80) m.history.shift();
      m.yes = close;
      m.no = 1 - close;
      m.vol += Math.floor(Math.random() * 4000);
    }
  }

  global.GrokMarkets = { createMarketBook, tickMarkets, SEED_MARKETS };
})(window);
