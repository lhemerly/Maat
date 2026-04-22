const test = require('node:test');
const assert = require('node:assert');
const { calculateArbitrageProfit } = require('../index.js');

test('calculateArbitrageProfit', async (t) => {
  await t.test('returns profit when cycle product is greater than 1', () => {
    // 1.5 * 1.2 * 0.6 = 1.08 => 8% profit
    const cycle = [
      ["A", "B", 1.5],
      ["B", "C", 1.2],
      ["C", "A", 0.6]
    ];
    const profit = calculateArbitrageProfit(cycle);
    // Should be close to 0.08
    assert.ok(Math.abs(profit - 0.08) < 0.0001);
  });

  await t.test('returns 0 when cycle product is 1 or less', () => {
    // 1.5 * 1.2 * 0.5 = 0.90 => no profit
    const cycle = [
      ["A", "B", 1.5],
      ["B", "C", 1.2],
      ["C", "A", 0.5]
    ];
    const profit = calculateArbitrageProfit(cycle);
    assert.strictEqual(profit, 0);
  });
});
