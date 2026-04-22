const test = require('node:test');
const assert = require('node:assert');
const { calculateArbitrageProfit } = require('../index.js');
const BigNumber = require('bignumber.js');

test('calculateArbitrageProfit', async (t) => {
  await t.test('returns profit when cycle product is greater than 1', () => {
    // 1.5 * 1.2 * 0.6 = 1.08 => 8% profit
    const cycle = [
      ["A", "B", new BigNumber(1.5)],
      ["B", "C", new BigNumber(1.2)],
      ["C", "A", new BigNumber(0.6)]
    ];
    const profit = calculateArbitrageProfit(cycle);
    // Should be close to 0.08
    assert.ok(Math.abs(profit - 0.08) < 0.0001);
  });

  await t.test('returns 0 when cycle product is 1 or less', () => {
    // 1.5 * 1.2 * 0.5 = 0.90 => no profit
    const cycle = [
      ["A", "B", new BigNumber(1.5)],
      ["B", "C", new BigNumber(1.2)],
      ["C", "A", new BigNumber(0.5)]
    ];
    const profit = calculateArbitrageProfit(cycle);
    assert.strictEqual(profit, 0);
  });
});
