## 2024-04-18 - DFS Cycle Finding Performance Optimization
**Learning:** The application uses a recursive depth-first search to find cycles in a graph (`findCycles`). The implementation checks if a neighbor is in the path stack using `stack.includes(neighbor)`. For long paths, this operation is O(N) where N is the current path length.
**Action:** Instead of just using a stack (Array) for path tracking, maintain a parallel Set (`inStack`) alongside the array to make `inStack.has(neighbor)` an O(1) lookup.
