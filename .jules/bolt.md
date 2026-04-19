
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

## Performance Optimization: Parallel Token Price Fetching

**Date**: 2026-04-19
**Location**: `index.js`, `main` function (graph construction loop)

**What**: Replaced sequential async calls for `getTokenPrices` with parallel execution using `Promise.all()`, adding individual error handling for each request.

**Why**: During startup, the bot builds a graph by fetching reserves and decimals for each token pair. Previously, this was done sequentially within a `for...of` loop, meaning the bot waited for each network request to complete before starting the next. Parallelizing these requests allows multiple requests to be processed concurrently by the RPC provider, significantly reducing the total startup time. Robust error handling was added to prevent a single network failure from halting the entire graph construction process.

**Impact**: Dramatic reduction in graph construction time, directly proportional to the number of token pairs.

**Measurement**:
A benchmark simulation with 5 token pairs and a simulated 100ms network latency per request showed:
- Baseline (sequential): ~503 ms
- Optimized (parallel): ~101 ms
Improvement: ~79.9% reduction in graph construction time.
