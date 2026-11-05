# GROK DESK — Paper Swarm + Uniswap (Ethereum)

Cinematic multi-agent **paper-trading** command center, plus a clearly separated **LIVE CONNECT** panel for Trust Wallet (WalletConnect v2) and **read-only Uniswap v3 quotes** on Ethereum mainnet.

Live site: https://666crypro.github.io/grok-desk/

## Two modes (do not mix them up)

| Mode | What it does | Can it spend money? |
|------|----------------|---------------------|
| **PAPER swarm** | Simulated agents, tape, markets, $10,000 bank, swarm PnL | **No** |
| **LIVE CONNECT** | WalletConnect / Trust Wallet, ETH+token balances, Uniswap quotes | **Only if** you arm **LIVE send**, press **Confirm in Trust Wallet**, and approve the wallet popup |

Paper PnL is not Uniswap PnL. You cannot withdraw paper profits.

## WalletConnect Project ID (required to show the QR)

There is **no bundled Project ID**. A made-up value would not connect.

1. Open [cloud.reown.com](https://cloud.reown.com) (Reown / WalletConnect Cloud).
2. Create a free project.
3. Copy the **Project ID** (32 hex characters).
4. Paste it into **WALLETCONNECT PROJECT ID** on the desk and press **Save Project ID**.
5. Optional: append `?wcProjectId=YOUR_ID` to the URL (still stored only in your browser after Save).

Then press **Connect Trust Wallet** and scan the WalletConnect QR with Trust Wallet (Ethereum mainnet). If you open the desk *inside* Trust Wallet’s in-app browser, **Use in-browser wallet** also appears.

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

## Paper swarm controls

- **PAUSE / RESUME** — freeze the simulated swarm cycle.
- **1× / 2× / 4×** — simulation speed.
- Click a paper market row to focus **THE TAPE**.

Agents: SCOUT, SIGNAL, ODDS, NEWS, RISK, EXEC, MACRO, FLOW, ARB, SENT, CLOCK, AUDIT.

Pipeline: **SCAN → VERIFY → EXECUTE → EXIT** (paper fills only).

## Disclaimer

Not financial advice. Not a broker. Real Ethereum swaps cost gas and can lose money. This UI cannot place Polymarket / CLOB orders.
