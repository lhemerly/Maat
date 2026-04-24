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

const { findCyclesRecursive } = require("../index.js");

test("findCyclesRecursive", async (t) => {
  await t.test("should find a simple cycle A -> B -> A", () => {
    const graph = {
      A: { B: 1 },
      B: { A: 1 },
    };
    const cycles = [];
    findCyclesRecursive(graph, "A", new Set(), [], cycles);

    // The implementation adds the neighbor to the end of the cycle array
    // So A -> B -> A
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
    findCyclesRecursive(graph, "A", new Set(), [], cycles);

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
    findCyclesRecursive(graph, "A", new Set(), [], cycles);

    assert.strictEqual(cycles.length, 0);
  });

  await t.test("should find multiple cycles", () => {
    const graph = {
      A: { B: 1, C: 1 },
      B: { A: 1 },
      C: { A: 1 },
    };
    const cycles = [];
    findCyclesRecursive(graph, "A", new Set(), [], cycles);

    assert.strictEqual(cycles.length, 2);
    // Order depends on Object.keys(graph["A"])
    const expected = [
      ["A", "B", "A"],
      ["A", "C", "A"],
    ];
    // Check if both expected cycles are in the result
    for (const exp of expected) {
      assert.ok(cycles.some(c => JSON.stringify(c) === JSON.stringify(exp)), `Missing cycle ${exp}`);
    }
  });

  await t.test("should handle complex interconnected cycles", () => {
    // A -> B -> C -> A
    //      B -> D -> B
    const graph = {
      A: { B: 1 },
      B: { C: 1, D: 1 },
      C: { A: 1 },
      D: { B: 1 },
    };
    const cycles = [];
    findCyclesRecursive(graph, "A", new Set(), [], cycles);

    assert.strictEqual(cycles.length, 2);
    const expected = [
      ["A", "B", "C", "A"],
      ["B", "D", "B"]
    ];
    for (const exp of expected) {
      assert.ok(cycles.some(c => JSON.stringify(c) === JSON.stringify(exp)), `Missing cycle ${exp}`);
    }
  });
});
