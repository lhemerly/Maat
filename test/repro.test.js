const test = require("node:test");
const assert = require("node:assert");
const { after } = require("node:test");

// Mocking required modules
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

test("findCyclesRecursive Vulnerability Reproduction", async (t) => {
  await t.test("should not find a cycle when token name is 'toString' due to prototype property interference", () => {
    // A -> toString -> A
    const graph = {
      A: { "toString": 1 },
      "toString": { A: 1 },
    };
    const cycles = [];
    // If vulnerable, it will skip 'toString' because visited['toString'] exists (as a function)
    // and thus it won't find the cycle.
    // A secure implementation using Set or Object.create(null) would find the cycle.
    findCyclesRecursive(graph, "A", new Set(), [], cycles);

    const cycleFound = cycles.some(c => c.includes("toString"));
    assert.strictEqual(cycleFound, true, "Should find cycle with 'toString' when using Set for visited");
  });

  await t.test("should handle '__proto__' safely (or at least not crash/pollute)", () => {
    const graph = Object.create(null);
    graph["__proto__"] = Object.create(null);
    graph["__proto__"]["A"] = 1;
    graph["A"] = Object.create(null);
    graph["A"]["__proto__"] = 1;

    const cycles = [];
    const visited = new Set();
    findCyclesRecursive(graph, "__proto__", visited, [], cycles);

    // If it polluted the prototype, Object.prototype.A might be set or something.
    assert.strictEqual(Object.prototype.hasOwnProperty('A'), false, "Prototype should not be polluted");
    assert.strictEqual(cycles.length, 1, "Should find cycle with '__proto__'");
  });
});
