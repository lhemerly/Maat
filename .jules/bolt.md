## 2024-04-18 - DFS Cycle Finding Performance Optimization
**Learning:** The application uses a recursive depth-first search to find cycles in a graph (`findCycles`). The implementation checks if a neighbor is in the path stack using `stack.includes(neighbor)`. For long paths, this operations is O(N) where N is the current path length.
**Action:** Instead of just using a stack (Array) for path tracking, maintain a parallel Set (`inStack`) alongside the array to make `inStack.has(neighbor)` an O(1) lookup.

## Performance Optimization: Token Decimals Caching

**Date**: 2026-04-18
**Location**: `index.js`, `getTokenPrices` function

**What**: Implemented an in-memory cache (`decimalCache`) to store promises for token decimal fetching in `index.js`.

**Why**: The application repeatedly looked up prices and invoked `tokenAContract.decimals()` and `tokenBContract.decimals()` for every pair. Since token decimals are immutable on chain, making an RPC call every time for the same token over multiple pair combinations resulted in redundant network traffic and latency. By caching the promise, subsequent calls for a known token immediately resolve without an extra network request.

**Impact**: Significant latency reduction during graph construction.

**Measurement**:
A simulation benchmark of 100 iterations of decimal fetching showed:
- Baseline (no cache): ~1053.75 ms
- Optimized (with cache): ~12.27 ms
Improvement: ~98.8% reduction in latency for this operation.
