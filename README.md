# GROK DESK — Paper Swarm

Cinematic multi-agent **paper-trading** command center inspired by viral “Grok Desk” / Polymarket desk UIs.

## Open it

From this folder:

```bash
cd /workspace/grok-desk
python3 -m http.server 8765
```

Then open **http://127.0.0.1:8765/** in a browser.

Or open `index.html` directly (file://) — canvases and simulation still work offline.

**Main entry:** `/workspace/grok-desk/index.html`

## What PAPER mode means

- Starting bank: **$10,000** (simulated).
- All scans, verifies, fills, exits, and PnL are **fake**.
- **No** private keys, Trust Wallet, or wallet connect.
- **No** live Polymarket / CLOB orders.
- Market titles and odds are **illustrative** (seeded offline simulation).
- Not financial advice. Nothing here can spend real money.

## Controls

- **PAUSE / RESUME** — freeze the swarm cycle.
- **1× / 2× / 4×** — simulation speed.
- Click a market row to focus **THE TAPE** and SPOT / TIME LEFT.

## Agents (paper)

SCOUT, SIGNAL, ODDS, NEWS, RISK, EXEC, MACRO, FLOW, ARB, SENT, CLOCK, AUDIT

Pipeline each cycle: **SCAN → VERIFY → EXECUTE → EXIT** (or SKIP when risk gates fire / low conviction).

## Risk gates

- Max open positions (5)
- Position size cap ($800)
- Daily loss halt (−$600)
- Minimum edge filter

When a gate fires, it highlights in the RISK GATES panel and the command stack logs `SKIP` / `RISK`.

## Layout

| Panel | Purpose |
|-------|---------|
| Agent Swarm | Live agent states |
| Pipeline | SCAN → VERIFY → EXECUTE → EXIT |
| Risk Gates | Limits + fired state |
| Command Node | Wireframe sphere + SPOT / OPEN / TIME LEFT |
| The Tape | Candlesticks for selected market |
| Markets | Paper odds book |
| Command Stack | Recent swarm actions |
| Signal Spectrogram | Activity heatmap |
| Positions | Open paper trades + unrealized PnL |

## Safety

This project cannot place real trades. Wiring a Trust Wallet or live venue would be a **separate, explicit** step later — not included here.
