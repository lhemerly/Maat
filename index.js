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
    const profit = calculateArbitrageProfit(cycle);
    if (profit > 0) {
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

const findCycles = (graph) => {
  const visited = new Set();
  const cycles = new Set();
  const stack = [];

  const dfs = (node) => {
    visited.add(node);
    stack.push(node);

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

  // Loop through each currency pair to check for arbitrage opportunities
  for (let i = 0; i < rates.length; i++) {
    const [buyCurrency, sellCurrency, buyRate] = rates[i];

    // Find the corresponding sell rate for the buy currency
    const sellRate = rates.find(
      (rate) => rate[0] === sellCurrency && rate[1] === buyCurrency
    )[2];

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
    process.exit(1);
  });
}

module.exports = {
  findCycles,
  findCyclesRecursive,
  calculateArbitrageProfit,
};
