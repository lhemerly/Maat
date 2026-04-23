const fs = require("fs");
const BigNumber = require("bignumber.js");
const { ethers } = require("ethers");
const chalk = require("chalk");

// ERC20 ABI for decimals
const erc20ABI = [
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
];

function isStructuredCycle(cycle) {
  return (
    Array.isArray(cycle) &&
    cycle.every(
      (edge) =>
        Array.isArray(edge) &&
        edge.length >= 3 &&
        typeof edge[0] === "string" &&
        typeof edge[1] === "string" &&
        BigNumber.isBigNumber(edge[2])
    )
  );
}

// Cache for token decimals
const decimalCache = {};

async function main() {
  // Load pairs from JSON file
  let pairs = [];
  try {
    pairs = JSON.parse(fs.readFileSync("pairs.json"));
  } catch (e) {
    console.error("Error loading pairs.json:", e.message);
  }

  // Load ABI from JSON file
  let dexFactoryABI = [];
  try {
    dexFactoryABI = JSON.parse(fs.readFileSync("ABIs/dexFactory.json"));
  } catch (e) {
    console.error("Error loading ABIs:", e.message);
    return;
  }

  // Load provider data from JSON file
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync("config.json"));
  } catch (e) {
    console.error("Error loading config.json:", e.message);
  }

  if (!config.rpcUrl || !config.privateKey) {
    console.error("Missing configuration. Please check config.json.");
    return;
  }

  if (typeof config.privateKey !== "string" || !/^(0x)?[0-9a-fA-F]{64}$/.test(config.privateKey)) {
    console.error("Invalid configuration. privateKey must be a valid 64-character hex string, with or without a 0x prefix.");
    return;
  }

  const normalizedPrivateKey = config.privateKey.startsWith("0x")
    ? config.privateKey
    : `0x${config.privateKey}`;

  // Set up provider and signer
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(normalizedPrivateKey, provider);

  // Set up contract instances
  const uniswapFactory = new ethers.Contract(
    config.uniswapFactoryAddress,
    dexFactoryABI,
    wallet
  );

  // Create graph of token pairs and prices
  const graph = {};
  for (let [tokenA, tokenB] of pairs) {
    const [tokenAPrice, tokenBPrice] = await getTokenPrices(
      tokenA,
      tokenB,
      uniswapFactory,
      config,
      provider
    );
    const tokenAPriceBN = new BigNumber(tokenAPrice);
    const tokenBPriceBN = new BigNumber(tokenBPrice);

    if (!graph[tokenA]) {
      graph[tokenA] = {};
    }
    graph[tokenA][tokenB] = tokenBPriceBN.div(tokenAPriceBN);

    if (!graph[tokenB]) {
      graph[tokenB] = {};
    }
    graph[tokenB][tokenA] = tokenAPriceBN.div(tokenBPriceBN);
  }

  // Find cycles in the graph and calculate profit for each cycle
  const foundCycles = findCycles(graph);
  for (let cycleString of foundCycles) {
    const nodes = cycleString.split(" -> ");
    const structuredCycle = [];
    let valid = true;
    for (let i = 0; i < nodes.length - 1; i++) {
      const u = nodes[i];
      const v = nodes[i + 1];
      if (graph[u] && graph[u][v]) {
        structuredCycle.push([u, v, graph[u][v]]);
      } else {
        valid = false;
        break;
      }
    }

    if (!valid || !isStructuredCycle(structuredCycle)) {
      console.warn(
        "Skipping profit calculation for unstructured cycle:",
        cycleString
      );
      continue;
    }
    const profit = calculateArbitrageProfit(structuredCycle);
    if (Number.isFinite(profit) && profit > 0) {
      console.log("Arbitrage opportunity found:", cycleString, "Profit:", profit);
    }
  }
}

async function getTokenPrices(
  tokenA,
  tokenB,
  uniswapFactory,
  config,
  provider
) {
  console.log(
    `Getting prices for ${chalk.yellow(tokenA)} and ${chalk.yellow(tokenB)}...`
  );

  const pairAddress = await uniswapFactory.getPair(tokenA, tokenB);
  console.log(`Pair address: ${chalk.blue(pairAddress)}`);

  const pairContract = new ethers.Contract(
    pairAddress,
    config.uniswapPairABI,
    provider
  );
  const [tokenAReserves, tokenBReserves] = await pairContract.getReserves();

  console.log(
    `Token A (${chalk.yellow(tokenA)}) reserves: ${chalk.green(
      ethers.formatEther(tokenAReserves)
    )}`
  );
  console.log(
    `Token B (${chalk.yellow(tokenB)}) reserves: ${chalk.green(
      ethers.formatEther(tokenBReserves)
    )}`
  );

  if (!decimalCache[tokenA]) {
    const tokenAContract = new ethers.Contract(tokenA, erc20ABI, provider);
    decimalCache[tokenA] = tokenAContract.decimals();
  }
  if (!decimalCache[tokenB]) {
    const tokenBContract = new ethers.Contract(tokenB, erc20ABI, provider);
    decimalCache[tokenB] = tokenBContract.decimals();
  }

  const [tokenADecimals, tokenBDecimals] = await Promise.all([
    decimalCache[tokenA],
    decimalCache[tokenB],
  ]);

  console.log(
    `Token A (${chalk.yellow(tokenA)}) decimals: ${chalk.blue(
      tokenADecimals.toString()
    )}`
  );
  console.log(
    `Token B (${chalk.yellow(tokenB)}) decimals: ${chalk.blue(
      tokenBDecimals.toString()
    )}`
  );

  const tokenAPrice = tokenBReserves
    .mul(10 ** tokenADecimals)
    .div(tokenAReserves.mul(10 ** tokenBDecimals));
  const tokenBPrice = tokenAReserves
    .mul(10 ** tokenBDecimals)
    .div(tokenBReserves.mul(10 ** tokenADecimals));

  console.log(
    `Token A (${chalk.yellow(tokenA)}) price: ${chalk.green(
      ethers.formatUnits(tokenAPrice, tokenADecimals)
    )}`
  );
  console.log(
    `Token B (${chalk.yellow(tokenB)}) price: ${chalk.green(
      ethers.formatUnits(tokenBPrice, tokenBDecimals)
    )}`
  );

  return [tokenAPrice.toString(), tokenBPrice.toString()];
}

const findCycles = (graph) => {
  const visited = new Set();
  const cycles = new Set();
  const stack = [];
  // Set for O(1) path checks to improve cycle detection performance
  const inStack = new Set();

  const dfs = (node) => {
    visited.add(node);
    stack.push(node);
    inStack.add(node);

    if (graph[node]) {
      Object.keys(graph[node]).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (stack.includes(neighbor)) {
          const cycle = [...stack.slice(stack.indexOf(neighbor)), neighbor].join(
            " -> "
          );
          cycles.add(cycle);
        }
      });
    }

    inStack.delete(node);
    stack.pop();
  };

  Object.keys(graph).forEach((node) => {
    if (!visited.has(node)) {
      dfs(node);
    }
  });

  console.log(chalk.blue("All cycles found:"));
  cycles.forEach((cycle) => console.log(chalk.green(cycle)));

  return cycles;
};

function calculateArbitrageProfit(rates) {
  let cycleRate = new BigNumber(1);

  for (let i = 0; i < rates.length; i++) {
    const rate = rates[i][2];
    cycleRate = cycleRate.multipliedBy(rate);
  }

  const potentialProfit = cycleRate.minus(1);

  if (potentialProfit.isGreaterThan(0)) {
    console.log(chalk.yellow(`Arbitrage cycle found:`));
    for (let i = 0; i < rates.length; i++) {
      const [buyCurrency, sellCurrency, rate] = rates[i];
      console.log(
        chalk.yellow(`Swap ${buyCurrency} for ${sellCurrency} at rate ${chalk.green(rate.toFixed(4))}`)
      );
    }
    const formattedProfit = chalk.green((potentialProfit.multipliedBy(100)).toFixed(2));
    console.log(chalk.green(`Profit: ${formattedProfit}%`));
    return potentialProfit.toNumber();
  }

  return 0;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  findCycles,
  calculateArbitrageProfit,
};
