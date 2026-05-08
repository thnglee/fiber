# Summary of TOCL Future and Past Operators Semantics

Temporal Object Constraint Language (TOCL) defines a formal semantics for reasoning about system behavior over an infinite sequence of states, \(\hat{\sigma} = \langle \sigma_0, \sigma_1, \ldots \rangle\). Each operator is evaluated in an environment \(\tau = (\hat{\sigma}, i, \beta)\), where \(i\) is the current state index and \(\beta\) is a variable assignment. Below is a concise summary of the future and past operators' semantics.

## Future Operators

- **`next e`**  
  True if `e` holds in the next state (\(i+1\)).

- **`always e`**  
  True if `e` holds in the current state and all future states (\(j \geq i\)).

- **`sometime e`**  
  True if `e` holds in the current state or at least one future state (\(j \geq i\)).

- **`always e1 until e2`**  
  True if `e1` remains true until `e2` becomes true (at some \(k \geq i\)), and `e1` holds for all states between \(i\) and \(k\). If `e2` never becomes true, `e1` must hold indefinitely.

- **`sometime e1 before e2`**  
  True if `e1` becomes true before `e2` does (or if `e1` becomes true and `e2` never does).

- **`anext`**  
  Evaluates an operation (e.g., \(\omega(e1, \ldots, en)\)) in the next state (\(i+1\)).

## Past Operators

- **`previous e`**  
  True if at the initial state (\(i = 0\)) or if `e` was true in the previous state (\(i-1\)).

- **`alwaysPast e`**  
  True if `e` was true in all past states (\(0 \leq j < i\)).

- **`sometimePast e`**  
  True if `e` was true in at least one past state (\(0 \leq j < i\)).

- **`always e1 since e2`**  
  True if `e1` has been true continuously since the last time `e2` was true (or from the start if `e2` was never true).

- **`sometime e1 since e2`**  
  True if `e1` was true at some point since the last time `e2` was true (or from the start if `e2` was never true).

- **`apre`**  
  Evaluates an operation (e.g., \(\omega(e1, \ldots, en)\)) in the previous state (\(i-1\)), returning \(\perp\) if \(i = 0\).