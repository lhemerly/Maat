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
        typeof edge[1] === "string"
    )
  );
}

// calculateArbitrageProfit returns a number (profit sum) or a chalk-formatted
// string when no opportunity is found; normalize to a numeric value for comparison.
function toNumericProfit(profit) {
  if (typeof profit === "number") {
    return profit;
  }
  if (typeof profit === "string") {
    const parsed = Number(profit);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
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

  // Set up provider and signer
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);

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
  for (let cycle of foundCycles) {
    if (!isStructuredCycle(cycle)) {
      console.warn(
        "Skipping profit calculation for unstructured cycle:",
        cycle
      );
      continue;
    }
    const profit = calculateArbitrageProfit(cycle);
    const numericProfit = toNumericProfit(profit);
    if (Number.isFinite(numericProfit) && numericProfit > 0) {
      console.log("Arbitrage opportunity found:", cycle, "Profit:", profit);
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
      ethers.utils.formatEther(tokenAReserves)
    )}`
  );
  console.log(
    `Token B (${chalk.yellow(tokenB)}) reserves: ${chalk.green(
      ethers.utils.formatEther(tokenBReserves)
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
      ethers.utils.formatUnits(tokenAPrice, tokenADecimals)
    )}`
  );
  console.log(
    `Token B (${chalk.yellow(tokenB)}) price: ${chalk.green(
      ethers.utils.formatUnits(tokenBPrice, tokenBDecimals)
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
        } else if (inStack.has(neighbor)) { // O(1) cycle detection check leveraging the inStack Set
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

function findCyclesRecursive(graph, currentToken, visited, cycle, cycles) {
  visited[currentToken] = true;
  cycle.push(currentToken);

  const neighbors = graph[currentToken] ? Object.keys(graph[currentToken]) : [];

  for (const neighbor of neighbors) {
    if (!visited[neighbor]) {
      findCyclesRecursive(graph, neighbor, visited, cycle, cycles);
    } else {
      const cycleIndex = cycle.indexOf(neighbor);
      if (cycleIndex > -1) {
        const formattedCycle = [...cycle.slice(cycleIndex), neighbor];
        console.log(chalk.green(`Found cycle: ${formattedCycle.join(" -> ")}`));
        cycles.push(formattedCycle);
      }
    }
  }

  cycle.pop();
  visited[currentToken] = false;
}

function calculateArbitrageProfit(rates) {
  let profit = 0;

  // Pre-compute a Map of rates for O(1) lookup
  const ratesMap = new Map();
  for (let i = 0; i < rates.length; i++) {
    const [buyCurrency, sellCurrency, rate] = rates[i];
    ratesMap.set(`${buyCurrency}:${sellCurrency}`, rate);
  }

  // Loop through each currency pair to check for arbitrage opportunities
  for (let i = 0; i < rates.length; i++) {
    const [buyCurrency, sellCurrency, buyRate] = rates[i];

    // Find the corresponding sell rate for the buy currency
    const sellRate = ratesMap.get(`${sellCurrency}:${buyCurrency}`);
    if (sellRate == null) {
      throw new Error(
        `Missing reverse rate for pair ${sellCurrency}:${buyCurrency}`
      );
    }

    // Calculate the potential profit for this cycle
    const potentialProfit = sellRate / buyRate - 1;

    // If there is a profit opportunity, log the details and update the total profit
    if (potentialProfit > 0) {
      const formattedBuyRate = chalk.green(buyRate.toFixed(4));
      const formattedSellRate = chalk.green(sellRate.toFixed(4));
      const formattedProfit = chalk.green((potentialProfit * 100).toFixed(2));
      console.log(
        chalk.yellow(`Buy ${buyCurrency} at rate ${formattedBuyRate}`)
      );
      console.log(
        chalk.yellow(`Sell ${sellCurrency} at rate ${formattedSellRate}`)
      );
      console.log(chalk.green(`Profit: ${formattedProfit}%`));
      profit += potentialProfit;
    }
  }

  // Return the total profit rounded to 2 decimal places
  return profit > 0
    ? chalk.green(`Total profit: ${(profit * 100).toFixed(2)}%`)
    : chalk.red("No arbitrage opportunities found");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    // eslint-disable-next-line no-undef
    process.exit(1);
  });
}

module.exports = {
  findCycles,
  findCyclesRecursive,
  calculateArbitrageProfit,
};
