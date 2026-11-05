# GROK DESK — Paper Swarm + Uniswap (Ethereum)

Cinematic multi-agent **paper-trading** command center, plus a clearly separated **LIVE CONNECT** panel for Trust Wallet (WalletConnect v2) and **read-only Uniswap v3 quotes** on Ethereum mainnet.

Live site: https://666crypro.github.io/grok-desk/

## Two modes (do not mix them up)

| Mode | What it does | Can it spend money? |
|------|----------------|---------------------|
| **PAPER swarm** | Simulated agents, tape, markets, $10,000 bank, swarm PnL | **No** |
| **LIVE CONNECT** | WalletConnect / Trust Wallet, ETH+token balances, Uniswap quotes | **Only if** you arm **LIVE send**, press **Confirm in Trust Wallet**, and approve the wallet popup |

Paper PnL is not Uniswap PnL. You cannot withdraw paper profits.

## WalletConnect Project ID

The live desk ships with Reown project **"666"** Project ID prefilled (public client id — fine in frontend). You can still override it.

1. Open https://666crypro.github.io/grok-desk/ — the Project ID field should already be filled.
2. Press **Connect Trust Wallet** and scan the WalletConnect QR (Ethereum mainnet).
3. Optional override: paste another ID and **Save Project ID**, or use `?wcProjectId=YOUR_ID`.

**Reown allowlist:** In the Reown dashboard for this project, add allowed domain / origin **`https://666crypro.github.io`** (and `http://127.0.0.1:8765` for local). If the QR fails with a domain / origin error, that allowlist is the usual fix.

Manage the project at [cloud.reown.com](https://cloud.reown.com) / [dashboard.reown.com](https://dashboard.reown.com).

The site never asks for a seed phrase or private key and does not store one.

## Uniswap quotes and swaps

- Quotes use Uniswap v3 **QuoterV2** on Ethereum (`0x61fFE0…B21e`) via public RPCs (or your wallet RPC after connect). Read-only; no gas.
- Tokens: ETH, WETH, USDC, USDT.
- **Propose swap** builds SwapRouter02 calldata (`0x68b346…Fc45`) and shows it. Nothing is broadcast.
- **LIVE send** defaults **OFF** every page load (not remembered).
- **Confirm in Trust Wallet** is disabled until LIVE is armed *and* a swap is proposed *and* a wallet is connected. It then asks Trust Wallet to sign. You pay gas. You can lose money.

Expected holder address (the SON recipient you already set): `0x6dfD705E0dE92D743E58b32A7b43d3D2D6Ec40B3`. Connecting a different account is allowed; the panel will say so.

To actually swap you need enough token-in balance **and ETH for gas** on Ethereum mainnet.

## Open locally

```bash
cd /workspace/grok-desk
python3 -m http.server 8765
```

Open http://127.0.0.1:8765/

## Rebuild the WalletConnect bundle

The live site is static GitHub Pages, so WalletConnect is pre-bundled as `js/wallet.bundle.js` (no esm.sh imports at runtime). After editing `js/wallet.js`:

```bash
npm install
npm run build:wallet
```

That writes `js/wallet.bundle.js`. Commit the bundle so Pages stays in sync.

## Paper swarm controls

- **PAUSE / RESUME** — freeze the simulated swarm cycle.
- **1× / 2× / 4×** — simulation speed.
- Click a paper market row to focus **THE TAPE**.

Agents: SCOUT, SIGNAL, ODDS, NEWS, RISK, EXEC, MACRO, FLOW, ARB, SENT, CLOCK, AUDIT.

Pipeline: **SCAN → VERIFY → EXECUTE → EXIT** (paper fills only).

## Disclaimer

Not financial advice. Not a broker. Real Ethereum swaps cost gas and can lose money. This UI cannot place Polymarket / CLOB orders.
