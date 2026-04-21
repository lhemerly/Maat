const { findCycles } = require('./index.js');
const chalk = require('chalk');

// Disable console.log for benchmarking
console.log = () => {};
chalk.blue = () => '';
chalk.green = () => '';
chalk.yellow = () => '';

// Generate a graph that doesn't exceed call stack size (limit < 5000)
// but has many edges to trigger back-edge checking heavily
const graph = {};
const N = 1000;
for (let i = 0; i < N; i++) {
  graph[`Node${i}`] = {};
  if (i < N - 1) {
    graph[`Node${i}`][`Node${i+1}`] = 1;
  }
}
// Add MANY back edges to trigger the else-if condition
for (let i = 0; i < N; i++) {
  for (let j = 0; j < i; j += 2) {
    graph[`Node${i}`][`Node${j}`] = 1;
  }
}

// Warmup
for (let i = 0; i < 2; i++) {
  findCycles(graph);
}

const start = process.hrtime.bigint();
findCycles(graph);
const end = process.hrtime.bigint();

process.stdout.write(`Execution time: ${Number(end - start) / 1e6} ms\n`);
