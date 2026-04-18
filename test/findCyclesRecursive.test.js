const test = require("node:test");
const assert = require("node:assert");

// Mocking required modules that are missing in the environment
const Module = require("module");
const originalRequire = Module.prototype.require;

// Simplified BigNumber mock for testing
class BigNumberMock {
  constructor(val) {
    this.val = Number(val);
  }
  times(other) {
    return new BigNumberMock(this.val * (other.val !== undefined ? other.val : other));
  }
  minus(other) {
    return new BigNumberMock(this.val - (other.val !== undefined ? other.val : other));
  }
  plus(other) {
    return new BigNumberMock(this.val + (other.val !== undefined ? other.val : other));
  }
  div(other) {
    return new BigNumberMock(this.val / (other.val !== undefined ? other.val : other));
  }
  gt(other) {
    return this.val > (other.val !== undefined ? other.val : other);
  }
  eq(other) {
    // Handle floating point precision in tests
    const otherVal = (other.val !== undefined ? other.val : other);
    return Math.abs(this.val - otherVal) < 1e-10;
  }
  toFixed(n) {
    return this.val.toFixed(n);
  }
}

Module.prototype.require = function (path) {
  if (path === "bignumber.js") {
    return BigNumberMock;
  }
  if (["ethers", "chalk"].includes(path)) {
    return {
      providers: { JsonRpcProvider: class {} },
      Wallet: class {},
      Contract: class {},
      utils: { formatEther: () => "0", formatUnits: () => "0" },
      yellow: (s) => s,
      blue: (s) => s,
      green: (s) => s,
      red: (s) => s,
    };
  }
  return originalRequire.apply(this, arguments);
};

const { findCyclesRecursive, calculateArbitrageProfit } = require("../index.js");

test("findCyclesRecursive", async (t) => {
  await t.test("should find a simple cycle A -> B -> A", () => {
    const graph = {
      A: { B: 1 },
      B: { A: 1 },
    };
    const cycles = [];
    findCyclesRecursive(graph, "A", {}, [], cycles);

    assert.strictEqual(cycles.length, 1);
    assert.deepStrictEqual(cycles[0], ["A", "B", "A"]);
  });

  await t.test("should find a 3-node cycle A -> B -> C -> A", () => {
    const graph = {
      A: { B: 1 },
      B: { C: 1 },
      C: { A: 1 },
    };
    const cycles = [];
    findCyclesRecursive(graph, "A", {}, [], cycles);

    assert.strictEqual(cycles.length, 1);
    assert.deepStrictEqual(cycles[0], ["A", "B", "C", "A"]);
  });

  await t.test("should not find cycles in a DAG", () => {
    const graph = {
      A: { B: 1 },
      B: { C: 1 },
      C: {},
    };
    const cycles = [];
    findCyclesRecursive(graph, "A", {}, [], cycles);

    assert.strictEqual(cycles.length, 0);
  });
});

test("calculateArbitrageProfit", async (t) => {
  await t.test("should calculate profit correctly for a simple cycle", () => {
    const graph = {
      A: { B: new BigNumberMock(2) },
      B: { A: new BigNumberMock(0.6) },
    };
    const cycle = ["A", "B", "A"];
    const profit = calculateArbitrageProfit(cycle, graph);
    // 2 * 0.6 = 1.2. Profit = 0.2
    assert.ok(profit.eq(0.2));
  });

  await t.test("should calculate profit correctly for a 3-node cycle", () => {
    const graph = {
      A: { B: new BigNumberMock(2) },
      B: { C: new BigNumberMock(0.5) },
      C: { A: new BigNumberMock(1.1) },
    };
    const cycle = ["A", "B", "C", "A"];
    const profit = calculateArbitrageProfit(cycle, graph);
    // 2 * 0.5 * 1.1 = 1.1. Profit = 0.1
    assert.ok(profit.eq(0.1));
  });

  await t.test("should return 0 if a link is missing", () => {
    const graph = {
      A: { B: new BigNumberMock(2) },
      B: {},
      C: { A: new BigNumberMock(1.1) },
    };
    const cycle = ["A", "B", "C", "A"];
    const profit = calculateArbitrageProfit(cycle, graph);
    assert.ok(profit.eq(0));
  });
});
