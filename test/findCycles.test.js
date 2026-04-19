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
    return class BigNumber {
        constructor(val) { this.val = val; }
        div(other) { return new BigNumber(this.val / other.val); }
    };
  }
  return originalRequire.apply(this, arguments);
};

// Restore the original require after all tests complete
after(() => {
  Module.prototype.require = originalRequire;
});

const { findCycles } = require("../index.js");

test("findCycles", async (t) => {
  await t.test("should find a simple cycle A -> B -> A", () => {
    const graph = {
      A: { B: 1 },
      B: { A: 1 },
    };
    const cycles = findCycles(graph);

    assert.strictEqual(cycles.size, 1);
    assert.ok(cycles.has("A -> B -> A") || cycles.has("B -> A -> B"));
  });

  await t.test("should find a 3-node cycle A -> B -> C -> A", () => {
    const graph = {
      A: { B: 1 },
      B: { C: 1 },
      C: { A: 1 },
    };
    const cycles = findCycles(graph);

    assert.strictEqual(cycles.size, 1);
    assert.ok(cycles.has("A -> B -> C -> A") || cycles.has("B -> C -> A -> B") || cycles.has("C -> A -> B -> C"));
  });

  await t.test("should not find cycles in a DAG", () => {
    const graph = {
      A: { B: 1 },
      B: { C: 1 },
      C: {},
    };
    const cycles = findCycles(graph);

    assert.strictEqual(cycles.size, 0);
  });

  await t.test("should find multiple cycles", () => {
    const graph = {
      A: { B: 1, C: 1 },
      B: { A: 1 },
      C: { A: 1 },
    };
    const cycles = findCycles(graph);

    assert.strictEqual(cycles.size, 2);
    assert.ok(cycles.has("A -> B -> A") || cycles.has("B -> A -> B"));
    assert.ok(cycles.has("A -> C -> A") || cycles.has("C -> A -> C"));
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
    const cycles = findCycles(graph);

    assert.strictEqual(cycles.size, 2);
    assert.ok(cycles.has("A -> B -> C -> A") || cycles.has("B -> C -> A -> B") || cycles.has("C -> A -> B -> C"));
    assert.ok(cycles.has("B -> D -> B") || cycles.has("D -> B -> D"));
  });
});
