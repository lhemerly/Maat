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
  let dexRouterABI = [];
  try {
    dexFactoryABI = JSON.parse(fs.readFileSync("ABIs/dexFactory.json"));
    dexRouterABI = JSON.parse(fs.readFileSync("ABIs/dexRouter.json"));
  } catch (e) {
    console.error("Error loading ABIs:", e.message);
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
  const uniswapRouter = new ethers.Contract(
    config.uniswapRouterAddress,
    dexRouterABI,
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
    const profit = calculateArbitrageProfit(cycle, graph);
    if (profit.gt(0)) {
      const formattedProfit = chalk.green(profit.times(100).toFixed(4));
      console.log(
        chalk.green(
          `Arbitrage opportunity found: ${cycle.join(
            " -> "
          )} | Profit: ${formattedProfit}%`
        )
      );
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

  const tokenAContract = new ethers.Contract(tokenA, erc20ABI, provider);
  const tokenBContract = new ethers.Contract(tokenB, erc20ABI, provider);
  const [tokenADecimals, tokenBDecimals] = await Promise.all([
    tokenAContract.decimals(),
    tokenBContract.decimals(),
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

function normalizeCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  let minNodes = nodes;
  let minStr = nodes.join(",");

  for (let i = 1; i < nodes.length; i++) {
    const rotated = [...nodes.slice(i), ...nodes.slice(0, i)];
    const rotatedStr = rotated.join(",");
    if (rotatedStr < minStr) {
      minStr = rotatedStr;
      minNodes = rotated;
    }
  }
  return [...minNodes, minNodes[0]];
}

const findCycles = (graph) => {
  const allCycles = [];
  Object.keys(graph).forEach((node) => {
    findCyclesRecursive(graph, node, {}, [], allCycles);
  });

  const uniqueCycles = [];
  const seen = new Set();
  for (const cycle of allCycles) {
    const normalized = normalizeCycle(cycle);
    const key = normalized.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCycles.push(cycle);
    }
  }

  console.log(chalk.blue("All cycles found:"));
  uniqueCycles.forEach((cycle) => console.log(chalk.green(cycle.join(" -> "))));

  return uniqueCycles;
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
        const foundCycle = [...cycle.slice(cycleIndex), neighbor];
        cycles.push(foundCycle);
      }
    }
  }

  cycle.pop();
  visited[currentToken] = false;
}

function calculateArbitrageProfit(cycle, graph) {
  let totalRate = new BigNumber(1);

  for (let i = 0; i < cycle.length - 1; i++) {
    const tokenA = cycle[i];
    const tokenB = cycle[i + 1];
    const rate = graph[tokenA][tokenB];
    if (rate) {
      totalRate = totalRate.times(rate);
    } else {
      return new BigNumber(0);
    }
  }

  const potentialProfit = totalRate.minus(1);
  return potentialProfit;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  findCycles,
  findCyclesRecursive,
  calculateArbitrageProfit,
};
