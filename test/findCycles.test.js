const test = require("node:test");
const assert = require("node:assert");
const { after, before } = require("node:test");

const Module = require("module");
const originalRequire = Module.prototype.require;

// Mock only when required from our test
before(() => {
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
});

after(() => {
  Module.prototype.require = originalRequire;
});

let findCycles;

before(() => {
  const index = require("../index.js");
  findCycles = index.findCycles;
});

test("findCycles", async (t) => {
  // Mock console.log for clean output
  const originalLog = console.log;
  console.log = () => {};

  t.after(() => {
    console.log = originalLog;
  });

  await t.test("should find a simple cycle A -> B -> A", () => {
    const graph = {
      A: { B: 1 },
      B: { A: 1 },
    };
    const cycles = Array.from(findCycles(graph));

    assert.strictEqual(cycles.length, 1);
    assert.strictEqual(cycles[0], "A -> B -> A");
  });

  await t.test("should find a 3-node cycle A -> B -> C -> A", () => {
    const graph = {
      A: { B: 1 },
      B: { C: 1 },
      C: { A: 1 },
    };
    const cycles = Array.from(findCycles(graph));

    assert.strictEqual(cycles.length, 1);
    assert.strictEqual(cycles[0], "A -> B -> C -> A");
  });

  await t.test("should not find cycles in a DAG", () => {
    const graph = {
      A: { B: 1 },
      B: { C: 1 },
      C: {},
    };
    const cycles = Array.from(findCycles(graph));

    assert.strictEqual(cycles.length, 0);
  });

  await t.test("should handle complex interconnected cycles", () => {
    const graph = {
      A: { B: 1 },
      B: { C: 1, D: 1 },
      C: { A: 1 },
      D: { B: 1 },
    };
    const cycles = Array.from(findCycles(graph));

    assert.strictEqual(cycles.length, 2);
    assert.ok(cycles.includes("A -> B -> C -> A"), "Missing cycle A -> B -> C -> A");
    assert.ok(cycles.includes("B -> D -> B"), "Missing cycle B -> D -> B");
  });
});
