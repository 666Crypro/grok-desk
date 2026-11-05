/* Uniswap v3 read-only quotes + calldata prep on Ethereum mainnet.
   Never stores keys. Does not broadcast transactions by itself. */
(function (global) {
  const CHAIN_ID = 1;
  const EXPECTED_EOA = "0x6dfD705E0dE92D743E58b32A7b43d3D2D6Ec40B3";

  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
  const SWAP_ROUTER_02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

  const FEE_TIERS = [500, 3000, 10000, 100];

  const TOKENS = {
    ETH: { symbol: "ETH", address: "ETH", decimals: 18, native: true },
    WETH: { symbol: "WETH", address: WETH, decimals: 18, native: false },
    USDC: { symbol: "USDC", address: USDC, decimals: 6, native: false },
    USDT: { symbol: "USDT", address: USDT, decimals: 6, native: false },
  };

  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];

  const QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  ];

  const ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
    "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
    "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
    "function refundETH() payable",
  ];

  const PUBLIC_RPCS = [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://1rpc.io/eth",
    "https://rpc.ankr.com/eth",
    "https://eth.drpc.org",
  ];

  function ethersLib() {
    if (!global.ethers) throw new Error("ethers.js failed to load");
    return global.ethers;
  }

  let cachedProvider = null;
  function publicProvider() {
    const { FallbackProvider, JsonRpcProvider, Network } = ethersLib();
    if (cachedProvider) return cachedProvider;
    const network = Network.from(CHAIN_ID);
    const providers = PUBLIC_RPCS.map(
      (url, i) =>
        new JsonRpcProvider(url, network, { staticNetwork: network, batchMaxCount: 1 })
    );
    // Weighted fallback: first RPC preferred
    cachedProvider = new FallbackProvider(
      providers.map((p, i) => ({ provider: p, stallTimeout: 1800, priority: i + 1, weight: 1 })),
      network
    );
    return cachedProvider;
  }

  function tokenAddr(token) {
    return token.native ? WETH : token.address;
  }

  function formatAmount(value, decimals, maxFrac) {
    const { formatUnits } = ethersLib();
    const s = formatUnits(value, decimals);
    const n = Number(s);
    if (!Number.isFinite(n)) return s;
    const frac = maxFrac != null ? maxFrac : decimals > 8 ? 6 : decimals;
    return n.toLocaleString(undefined, { maximumFractionDigits: frac });
  }

  async function getBalances(address, runner) {
    const { Contract, JsonRpcProvider } = ethersLib();
    const r = runner || publicProvider();
    const ethBal = await r.getBalance(address);
    const out = {
      address,
      ETH: { raw: ethBal, formatted: formatAmount(ethBal, 18, 6), decimals: 18 },
    };
    for (const key of ["WETH", "USDC", "USDT"]) {
      const t = TOKENS[key];
      const c = new Contract(t.address, ERC20_ABI, r);
      const raw = await c.balanceOf(address);
      out[key] = { raw, formatted: formatAmount(raw, t.decimals, t.decimals === 6 ? 2 : 6), decimals: t.decimals };
    }
    return out;
  }

  async function quoteExact({ tokenIn, tokenOut, amountInRaw, runner }) {
    const { Contract } = ethersLib();
    if (tokenIn.symbol === tokenOut.symbol) {
      throw new Error("Choose two different tokens");
    }
    const r = runner || publicProvider();
    const quoter = new Contract(QUOTER_V2, QUOTER_ABI, r);
    const addrIn = tokenAddr(tokenIn);
    const addrOut = tokenAddr(tokenOut);
    let best = null;
    let lastErr = null;
    for (const fee of FEE_TIERS) {
      try {
        const res = await quoter.quoteExactInputSingle.staticCall({
          tokenIn: addrIn,
          tokenOut: addrOut,
          amountIn: amountInRaw,
          fee,
          sqrtPriceLimitX96: 0,
        });
        const amountOut = res.amountOut ?? res[0];
        const gasEstimate = res.gasEstimate ?? res[3];
        if (!best || amountOut > best.amountOut) {
          best = { amountOut, fee, gasEstimate, tokenIn, tokenOut, amountIn: amountInRaw };
        }
      } catch (err) {
        lastErr = err;
      }
    }
    if (!best) {
      throw new Error(
        "No Uniswap v3 pool quote for this pair/amount" +
          (lastErr && lastErr.shortMessage ? " (" + lastErr.shortMessage + ")" : "")
      );
    }
    return best;
  }

  function minOut(amountOut, slippageBps) {
    const bps = BigInt(slippageBps);
    return (amountOut * (10000n - bps)) / 10000n;
  }

  function buildSwapTx({ quote, slippageBps, recipient }) {
    const { Interface } = ethersLib();
    const router = new Interface(ROUTER_ABI);
    const erc20 = new Interface(ERC20_ABI);
    const tokenIn = quote.tokenIn;
    const tokenOut = quote.tokenOut;
    const amountOutMinimum = minOut(quote.amountOut, slippageBps);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

    const exactParams = {
      tokenIn: tokenAddr(tokenIn),
      tokenOut: tokenAddr(tokenOut),
      fee: quote.fee,
      recipient: tokenOut.native ? SWAP_ROUTER_02 : recipient,
      amountIn: quote.amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    };

    const swapData = router.encodeFunctionData("exactInputSingle", [exactParams]);
    let data = swapData;
    let value = tokenIn.native ? quote.amountIn : 0n;

    if (tokenOut.native) {
      const unwrap = router.encodeFunctionData("unwrapWETH9", [amountOutMinimum, recipient]);
      const refund = router.encodeFunctionData("refundETH");
      data = router.encodeFunctionData("multicall", [deadline, [swapData, unwrap, refund]]);
    }

    const approve = tokenIn.native
      ? null
      : {
          to: tokenIn.address,
          data: erc20.encodeFunctionData("approve", [SWAP_ROUTER_02, quote.amountIn]),
          value: 0n,
          desc: "Approve " + tokenIn.symbol + " for Uniswap SwapRouter02",
        };

    return {
      chainId: CHAIN_ID,
      router: SWAP_ROUTER_02,
      approve,
      swap: {
        to: SWAP_ROUTER_02,
        data,
        value,
        desc:
          "Swap " +
          tokenIn.symbol +
          " → " +
          tokenOut.symbol +
          " on Uniswap v3 (fee " +
          (quote.fee / 10000).toFixed(2) +
          "%)",
      },
      amountOutMinimum,
      deadline: Number(deadline),
    };
  }

  async function allowance(token, owner, runner) {
    if (token.native) return null;
    const { Contract } = ethersLib();
    const c = new Contract(token.address, ERC20_ABI, runner || publicProvider());
    return c.allowance(owner, SWAP_ROUTER_02);
  }

  global.GrokUni = {
    CHAIN_ID,
    EXPECTED_EOA,
    TOKENS,
    WETH,
    QUOTER_V2,
    SWAP_ROUTER_02,
    FEE_TIERS,
    publicProvider,
    getBalances,
    quoteExact,
    buildSwapTx,
    formatAmount,
    minOut,
    allowance,
    tokenAddr,
  };
})(window);
