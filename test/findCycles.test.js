const { test } = require('node:test');
const assert = require('node:assert');
const { findCycles } = require('../index.js');

test('findCycles should correctly identify cycles', async (t) => {
  await t.test('detects multiple cycles in a directed graph', () => {
    // Suppress console.log for clean test output
    const originalLog = console.log;
    console.log = () => {};

    const graph = {
      A: { B: 1 },
      B: { C: 1 },
      C: { A: 1, D: 1 },
      D: { E: 1 },
      E: { C: 1 }
    };

    const cycles = findCycles(graph);

    console.log = originalLog;

    assert.strictEqual(cycles.size, 2);
    assert.ok(cycles.has('A -> B -> C -> A'));
    assert.ok(cycles.has('C -> D -> E -> C'));
  });

  await t.test('returns empty set for acyclic graph', () => {
    const originalLog = console.log;
    console.log = () => {};

    const graph = {
      A: { B: 1 },
      B: { C: 1 },
      C: { D: 1 }
    };

    const cycles = findCycles(graph);

    console.log = originalLog;

    assert.strictEqual(cycles.size, 0);
  });
});
