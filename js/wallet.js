/* WalletConnect v2 + Trust Wallet. LIVE send is gated OFF by default.
   Never stores a seed or private key. */
import { EthereumProvider } from "https://esm.sh/@walletconnect/ethereum-provider@2.21.5?bundle";

const LS_KEY = "GROK_DESK_WC_PROJECT_ID";
const EXPECTED = (window.GrokUni && window.GrokUni.EXPECTED_EOA) ||
  "0x6dfD705E0dE92D743E58b32A7b43d3D2D6Ec40B3";

const state = {
  provider: null,
  address: null,
  chainId: null,
  live: false,
  quote: null,
  plan: null,
  balances: null,
};

const $ = (id) => document.getElementById(id);

function log(msg, cls) {
  const box = $("live-log");
  if (!box) return;
  const line = document.createElement("div");
  if (cls) line.className = cls;
  const ts = new Date().toISOString().slice(11, 19);
  line.textContent = ts + "  " + msg;
  box.prepend(line);
}

function shortAddr(a) {
  if (!a) return "—";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function readProjectId() {
  const params = new URLSearchParams(location.search);
  const fromQuery = (params.get("wcProjectId") || "").trim();
  const fromCfg = (window.GROK_DESK_WC_PROJECT_ID || "").trim();
  const fromInput = ($("wc-project-id") && $("wc-project-id").value.trim()) || "";
  const fromLs = (localStorage.getItem(LS_KEY) || "").trim();
  return fromQuery || fromCfg || fromInput || fromLs;
}

function isLikelyProjectId(id) {
  return /^[0-9a-f]{32}$/i.test(id);
}

function setLiveUi() {
  const on = state.live;
  const badge = $("live-mode-badge");
  const pill = $("live-send-pill");
  if (badge) {
    badge.textContent = on ? "LIVE SEND ON" : "LIVE SEND OFF";
    badge.className = "badge " + (on ? "live-on" : "live-off");
  }
  if (pill) {
    pill.textContent = on ? "LIVE ARMED" : "QUOTES ONLY";
    pill.className = "pill " + (on ? "live-armed" : "muted");
  }
  updateActionButtons();
}

function updateActionButtons() {
  const connected = !!state.address;
  const confirm = $("btn-confirm");
  if (confirm) {
    confirm.disabled = !(state.live && connected && state.plan);
  }
  const propose = $("btn-propose");
  if (propose) propose.disabled = !state.quote;
}

function renderAddress() {
  const el = $("connected-addr");
  const note = $("addr-note");
  if (el) el.textContent = state.address || "not connected";
  if (!note) return;
  if (!state.address) {
    note.textContent = "Connect Trust Wallet to load balances. Expected holder: " + EXPECTED;
    note.className = "field-hint";
    return;
  }
  if (state.address.toLowerCase() === EXPECTED.toLowerCase()) {
    note.textContent = "Connected address matches the expected holder " + shortAddr(EXPECTED);
    note.className = "addr-match";
  } else {
    note.textContent =
      "Connected " +
      shortAddr(state.address) +
      " — different from expected holder " +
      shortAddr(EXPECTED);
    note.className = "addr-diff";
  }
}

function renderBalances(bals) {
  const keys = ["ETH", "WETH", "USDC", "USDT"];
  keys.forEach((k) => {
    const el = $("bal-" + k);
    if (!el) return;
    el.textContent = bals && bals[k] ? bals[k].formatted : "—";
  });
}

async function refreshBalances() {
  if (!state.address || !window.GrokUni) return;
  try {
    const runner = walletReader() || window.GrokUni.publicProvider();
    const bals = await window.GrokUni.getBalances(state.address, runner);
    state.balances = bals;
    renderBalances(bals);
    log("balances updated for " + shortAddr(state.address));
  } catch (err) {
    log("balance error: " + (err.message || err), "warn");
  }
}

function walletReader() {
  if (!state.provider || !window.ethers) return null;
  try {
    return new window.ethers.BrowserProvider(state.provider, 1);
  } catch {
    return null;
  }
}

function hexChain(id) {
  return "0x" + Number(id).toString(16);
}

async function ensureMainnet() {
  if (!state.provider) throw new Error("Wallet not connected");
  let id = state.chainId;
  try {
    const raw = await state.provider.request({ method: "eth_chainId" });
    id = parseInt(raw, 16);
    state.chainId = id;
  } catch (_) {}
  if (id === 1) return;
  try {
    await state.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChain(1) }],
    });
    state.chainId = 1;
  } catch (err) {
    throw new Error("Switch Trust Wallet to Ethereum mainnet (chain id 1). " + (err.message || ""));
  }
}

async function connectWalletConnect() {
  const projectId = readProjectId();
  if (!projectId) {
    throw new Error(
      "No WalletConnect Project ID. Create a free one at https://cloud.reown.com and paste it above."
    );
  }
  if (!isLikelyProjectId(projectId)) {
    throw new Error("That Project ID does not look valid (expected 32 hex characters from cloud.reown.com).");
  }
  localStorage.setItem(LS_KEY, projectId);
  if ($("wc-project-id") && !$("wc-project-id").value) $("wc-project-id").value = projectId;

  log("opening WalletConnect QR — scan with Trust Wallet");
  const metadata = {
    name: "GROK DESK",
    description: "Paper swarm desk + Uniswap Ethereum quotes",
    url: location.origin + location.pathname.replace(/index\.html$/, ""),
    icons: ["https://666crypro.github.io/grok-desk/favicon.svg"],
  };

  const provider = await EthereumProvider.init({
    projectId,
    chains: [1],
    optionalChains: [1],
    showQrModal: true,
    methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData", "eth_signTypedData_v4"],
    events: ["chainChanged", "accountsChanged"],
    metadata,
    qrModalOptions: { themeMode: "dark", themeVariables: { "--wcm-z-index": "2000" } },
  });

  bindProvider(provider);
  await provider.connect();
}

async function connectInjected() {
  const eth = window.ethereum;
  if (!eth) throw new Error("No in-browser wallet found. Use WalletConnect QR from Trust Wallet.");
  log("requesting accounts from in-browser wallet");
  bindProvider(eth);
  const acc = await eth.request({ method: "eth_requestAccounts" });
  state.address = acc && acc[0] ? window.ethers.getAddress(acc[0]) : null;
  const chain = await eth.request({ method: "eth_chainId" });
  state.chainId = parseInt(chain, 16);
  afterConnect();
}

function bindProvider(provider) {
  if (state.provider && state.provider !== provider) {
    try {
      state.provider.removeListener && state.provider.removeListener("accountsChanged", onAccounts);
      state.provider.removeListener && state.provider.removeListener("chainChanged", onChain);
      state.provider.removeListener && state.provider.removeListener("disconnect", onDisconnect);
    } catch (_) {}
  }
  state.provider = provider;
  if (provider.on) {
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    provider.on("disconnect", onDisconnect);
  }
}

function onAccounts(accs) {
  if (!accs || !accs.length) {
    onDisconnect();
    return;
  }
  state.address = window.ethers.getAddress(accs[0]);
  afterConnect();
}

function onChain(chainId) {
  state.chainId = typeof chainId === "string" ? parseInt(chainId, 16) : Number(chainId);
  log("chain changed → " + state.chainId + (state.chainId === 1 ? " (Ethereum)" : " — switch to Ethereum mainnet"));
}

function onDisconnect() {
  state.address = null;
  state.chainId = null;
  state.quote = null;
  state.plan = null;
  renderAddress();
  renderBalances(null);
  $("btn-connect").textContent = "Connect Trust Wallet";
  $("btn-disconnect").disabled = true;
  log("wallet disconnected");
  updateActionButtons();
}

function afterConnect() {
  $("btn-connect").textContent = "Connected " + shortAddr(state.address);
  $("btn-disconnect").disabled = false;
  renderAddress();
  updateActionButtons();
  log("connected " + state.address + (state.chainId ? " · chain " + state.chainId : ""));
  refreshBalances();
}

async function disconnect() {
  try {
    if (state.provider && state.provider.disconnect) await state.provider.disconnect();
  } catch (_) {}
  onDisconnect();
}

async function runQuote() {
  const uni = window.GrokUni;
  const ethers = window.ethers;
  const fromSym = $("token-in").value;
  const toSym = $("token-out").value;
  const amountStr = $("amount-in").value.trim();
  const box = $("quote-box");
  state.quote = null;
  state.plan = null;
  updateActionButtons();
  if (!amountStr || Number(amountStr) <= 0) {
    box.textContent = "Enter an amount to quote.";
    box.className = "swap-quote";
    return;
  }
  const tokenIn = uni.TOKENS[fromSym];
  const tokenOut = uni.TOKENS[toSym];
  box.textContent = "Fetching Uniswap v3 quote (read-only)…";
  box.className = "swap-quote";
  try {
    const amountInRaw = ethers.parseUnits(amountStr, tokenIn.decimals);
    const runner = walletReader() || uni.publicProvider();
    const q = await uni.quoteExact({ tokenIn, tokenOut, amountInRaw, runner });
    const slip = Number($("slippage").value || 50);
    const min = uni.minOut(q.amountOut, slip);
    state.quote = q;
    const outFmt = uni.formatAmount(q.amountOut, tokenOut.decimals, tokenOut.decimals === 6 ? 6 : 8);
    const minFmt = uni.formatAmount(min, tokenOut.decimals, tokenOut.decimals === 6 ? 6 : 8);
    const rate =
      Number(ethers.formatUnits(q.amountOut, tokenOut.decimals)) /
      Number(ethers.formatUnits(q.amountIn, tokenIn.decimals));
    box.textContent = [
      "READ-ONLY Uniswap v3 quote (Ethereum mainnet)",
      "In:  " + amountStr + " " + tokenIn.symbol,
      "Out: ~" + outFmt + " " + tokenOut.symbol,
      "Min out (" + (slip / 100).toFixed(2) + "% slip): " + minFmt + " " + tokenOut.symbol,
      "Fee tier: " + q.fee + " (" + (q.fee / 10000).toFixed(2) + "%)",
      "Est. rate: 1 " + tokenIn.symbol + " ≈ " + rate.toPrecision(6) + " " + tokenOut.symbol,
      "Quoter: " + uni.QUOTER_V2,
      "This quote does not spend gas or move funds.",
    ].join("\n");
    box.className = "swap-quote ready";
    log("quote " + amountStr + " " + tokenIn.symbol + " → ~" + outFmt + " " + tokenOut.symbol);
  } catch (err) {
    box.textContent = "Quote failed: " + (err.shortMessage || err.message || err);
    box.className = "swap-quote";
    log("quote failed: " + (err.message || err), "warn");
  }
  updateActionButtons();
}

function proposeSwap() {
  const box = $("quote-box");
  if (!state.quote) {
    log("quote first, then propose", "warn");
    return;
  }
  if (!state.address) {
    log("connect a wallet to bind the recipient (calldata can still be previewed after connect)", "warn");
  }
  const recipient = state.address || EXPECTED;
  const slip = Number($("slippage").value || 50);
  const plan = window.GrokUni.buildSwapTx({
    quote: state.quote,
    slippageBps: slip,
    recipient,
  });
  state.plan = plan;
  const extra = [
    "",
    "PROPOSED TX (not sent)",
    plan.approve ? "1) " + plan.approve.desc + " → " + plan.approve.to : "1) no ERC-20 approve needed (ETH in)",
    "2) " + plan.swap.desc + " → " + plan.swap.to,
    "value (wei): " + String(plan.swap.value),
    "calldata: " + plan.swap.data.slice(0, 74) + "… (" + plan.swap.data.length + " chars)",
    "recipient: " + recipient,
    state.live
      ? "LIVE is ON — press Confirm to ask Trust Wallet to sign."
      : "LIVE is OFF — Confirm is locked. No transaction will be broadcast.",
  ];
  box.textContent = (box.textContent || "") + extra.join("\n");
  log("swap proposed — waiting for LIVE + Confirm");
  updateActionButtons();
}

async function sendViaWallet(tx) {
  const params = {
    from: state.address,
    to: tx.to,
    data: tx.data,
    value: window.ethers.toBeHex(tx.value || 0n),
  };
  return state.provider.request({ method: "eth_sendTransaction", params: [params] });
}

async function confirmSwap() {
  if (!state.live) {
    log("blocked: LIVE send is OFF", "warn");
    return;
  }
  if (!state.address || !state.provider) {
    log("blocked: wallet not connected", "warn");
    return;
  }
  if (!state.plan) {
    log("blocked: propose a swap first", "warn");
    return;
  }
  const ok = window.confirm(
    "This will ask Trust Wallet to sign a REAL Ethereum mainnet transaction.\n\n" +
      "You will pay gas. You can lose money. Paper swarm PnL is unrelated.\n\n" +
      "Continue only if you intend to swap."
  );
  if (!ok) {
    log("user cancelled Confirm dialog — nothing sent");
    return;
  }
  try {
    await ensureMainnet();
    if (state.plan.approve) {
      const tokenIn = state.quote.tokenIn;
      let allow = 0n;
      try {
        allow = await window.GrokUni.allowance(tokenIn, state.address, walletReader() || window.GrokUni.publicProvider());
      } catch (_) {}
      if (allow < state.quote.amountIn) {
        // USDT may require resetting allowance to 0 first
        if (allow > 0n && tokenIn.symbol === "USDT") {
          log("USDT allowance reset to 0 (wallet popup)…");
          const erc20 = new window.ethers.Interface([
            "function approve(address spender, uint256 amount) returns (bool)",
          ]);
          await sendViaWallet({
            to: tokenIn.address,
            data: erc20.encodeFunctionData("approve", [window.GrokUni.SWAP_ROUTER_02, 0n]),
            value: 0n,
          });
        }
        log("requesting token approve in Trust Wallet…");
        const hashA = await sendViaWallet(state.plan.approve);
        log("approve submitted: " + hashA);
      }
    }
    log("requesting swap in Trust Wallet…");
    const hash = await sendViaWallet(state.plan.swap);
    log("swap submitted: " + hash);
    $("quote-box").textContent += "\n\nBroadcast tx: " + hash;
  } catch (err) {
    log("send failed / rejected: " + (err.message || err), "warn");
  }
}

function wire() {
  const pid = readProjectId();
  if ($("wc-project-id") && pid && !$("wc-project-id").value) $("wc-project-id").value = pid;

  const injectedWrap = $("injected-wrap");
  if (injectedWrap) {
    injectedWrap.hidden = !window.ethereum;
  }

  $("btn-save-pid") &&
    $("btn-save-pid").addEventListener("click", () => {
      const id = ($("wc-project-id").value || "").trim();
      if (!id) {
        localStorage.removeItem(LS_KEY);
        log("cleared saved Project ID");
        return;
      }
      if (!isLikelyProjectId(id)) {
        log("not saved — Project ID should be 32 hex characters from cloud.reown.com", "warn");
        return;
      }
      localStorage.setItem(LS_KEY, id);
      log("Project ID saved in this browser only (not a seed, not uploaded)");
    });

  $("btn-connect").addEventListener("click", async () => {
    try {
      await connectWalletConnect();
      const accs = state.provider.accounts || (await state.provider.request({ method: "eth_accounts" }));
      if (accs && accs[0]) {
        state.address = window.ethers.getAddress(accs[0]);
        try {
          const chain = await state.provider.request({ method: "eth_chainId" });
          state.chainId = parseInt(chain, 16);
        } catch (_) {}
        afterConnect();
      }
    } catch (err) {
      log("connect failed: " + (err.message || err), "warn");
    }
  });

  $("btn-injected") &&
    $("btn-injected").addEventListener("click", async () => {
      try {
        await connectInjected();
      } catch (err) {
        log("injected connect failed: " + (err.message || err), "warn");
      }
    });

  $("btn-disconnect").addEventListener("click", () => disconnect());

  $("live-toggle").checked = false;
  state.live = false;
  $("live-toggle").addEventListener("change", (e) => {
    state.live = !!e.target.checked;
    setLiveUi();
    log(state.live ? "LIVE send armed — Confirm can broadcast" : "LIVE send disarmed — no broadcasts");
  });

  $("btn-quote").addEventListener("click", () => runQuote());
  $("btn-propose").addEventListener("click", () => proposeSwap());
  $("btn-confirm").addEventListener("click", () => confirmSwap());
  $("btn-refresh-bal") && $("btn-refresh-bal").addEventListener("click", () => refreshBalances());

  ["token-in", "token-out", "amount-in", "slippage"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("change", () => { state.plan = null; updateActionButtons(); });
  });

  setLiveUi();
  renderAddress();
  renderBalances(null);
  $("btn-disconnect").disabled = true;
  updateActionButtons();

  if (!readProjectId()) {
    log("WalletConnect Project ID missing — quotes still work; QR connect needs an ID from cloud.reown.com");
  } else {
    log("WalletConnect Project ID present — ready to show a Trust Wallet QR");
  }
  log("LIVE send defaults OFF. No swap will be sent unless you arm LIVE and press Confirm.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wire);
} else {
  wire();
}
