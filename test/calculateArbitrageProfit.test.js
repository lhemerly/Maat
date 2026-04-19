const test = require("node:test");
const assert = require("node:assert");
const { after } = require("node:test");

// Mocking required modules that are missing in the environment
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {
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
  if (path === "chalk") {
    return {
      yellow: (s) => s,
      blue: (s) => s,
      green: (s) => s,
      red: (s) => s,
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
  await t.test("should throw Error when reverse rate is missing", () => {
    const rates = [
      ["A", "B", 1.5], // Missing B -> A rate
    ];

    assert.throws(
      () => calculateArbitrageProfit(rates),
      {
        name: "Error",
        message: "Missing reverse rate for pair B:A",
      }
    );
  });

  await t.test("should return no arbitrage opportunities if none exist", () => {
    const rates = [
      ["A", "B", 1.0],
      ["B", "A", 1.0],
    ];

    const result = calculateArbitrageProfit(rates);
    assert.strictEqual(result, "No arbitrage opportunities found");
  });

  await t.test("should return formatted total profit when arbitrage opportunity exists", () => {
    // Example: Buy B with A at 1.0, Sell B for A at 1.1 -> Profit!
    // Profit = (sellRate / buyRate) - 1
    // potentialProfit = 1.1 / 1.0 - 1 = 0.1
    // (profit * 100).toFixed(2) = 10.00%
    const rates = [
      ["A", "B", 1.0],
      ["B", "A", 1.1],
    ];

    const result = calculateArbitrageProfit(rates);
    assert.strictEqual(result, "Total profit: 10.00%");
  });
});
