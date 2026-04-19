const test = require("node:test");
const assert = require("node:assert");
const { after } = require("node:test");

// Mocking required modules that are missing in the environment
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {
  if (path === "chalk") {
    return {
      yellow: (s) => s,
      blue: (s) => s,
      green: (s) => s,
      red: (s) => s,
    };
  }
  // Also stub out others if index.js requires them when loaded
  if (path === "ethers") {
    return {
      ethers: {
        providers: { JsonRpcProvider: class {} },
        Wallet: class {},
        Contract: class {},
        utils: { formatEther: () => "0", formatUnits: () => "0" },
      },
    };
  }
  if (path === "bignumber.js") {
    return class BigNumber {};
  }
  return originalRequire.apply(this, arguments);
};

// Restore the original require after all tests complete
after(() => {
  Module.prototype.require = originalRequire;
});

const { calculateArbitrageProfit } = require("../index.js");

test("calculateArbitrageProfit", async (t) => {
  // Silence console.log during tests
  const originalConsoleLog = console.log;
  t.afterEach(() => {
    console.log = originalConsoleLog;
  });

  await t.test("should calculate profit when an arbitrage opportunity exists", () => {
    console.log = () => {}; // mock console.log

    // Setup rates: buy tokenA -> tokenB at 1.0, sell tokenB -> tokenA at 1.1
    // The structure is an array of [buyCurrency, sellCurrency, rate]
    const rates = [
      ["tokenA", "tokenB", 1.0],
      ["tokenB", "tokenA", 1.1],
    ];

    const result = calculateArbitrageProfit(rates);

    // Calculate expected profit for first pair: (1.1 / 1.0) - 1 = 0.1 (10%)
    // For the second pair: (1.0 / 1.1) - 1 = -0.09 (no profit, skipped)
    // The function calculates a sum, but here it's simple enough.
    assert.strictEqual(result, "Total profit: 10.00%");
  });

  await t.test("should return 'No arbitrage opportunities found' if there is no profit", () => {
    console.log = () => {};

    const rates = [
      ["tokenA", "tokenB", 1.0],
      ["tokenB", "tokenA", 1.0],
    ];

    const result = calculateArbitrageProfit(rates);

    assert.strictEqual(result, "No arbitrage opportunities found");
  });

  await t.test("should throw an Error when reverse rate is missing", () => {
    console.log = () => {};

    const rates = [
      ["tokenA", "tokenB", 1.0],
      // Missing tokenB -> tokenA
    ];

    assert.throws(
      () => {
        calculateArbitrageProfit(rates);
      },
      (err) => {
        return err instanceof Error && err.message === "Missing reverse rate for pair tokenB:tokenA";
      }
    );
  });
});
