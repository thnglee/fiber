### 2.2.1 Temporal Operators

Temporal operators enhance the Object Constraint Language (OCL) by enabling the specification of properties that must hold over time, across multiple states of a system. While standard OCL is limited to evaluating constraints within a single system state or across a single state transition (via pre- and postconditions), many system requirements involve dynamic behaviors that unfold over sequences of states. Examples include properties such as "eventually, the system will reach a stable state" or "once a condition is met, it must remain true thereafter." To address this, Temporal OCL (TOCL), as introduced by Ziemann and Gogolla \[28\], extends OCL with elements of linear temporal logic, allowing these temporal properties to be expressed directly within a familiar OCL-like syntax.

TOCL introduces a comprehensive set of temporal operators, divided into future and past categories, which are adopted in TOCL+ as the foundation for temporal reasoning. Below, we review these operators, their syntax, semantics, and provide illustrative examples.

#### Adopted TOCL Temporal Operators

The temporal operators in TOCL are categorized as follows:

**Future Operators:**

- **next e**: True if the expression `e` holds in the next state.
- **always e**: True if `e` holds in the current state and all subsequent states.
- **sometime e**: True if `e` holds in the current state or at least one future state.
- **always e1 until e2**: True if `e1` remains true until `e2` becomes true, or if `e1` remains true indefinitely if `e2` never becomes true.
- **sometime e1 before e2**: True if `e1` becomes true at some point before `e2` does, or if `e1` becomes true and `e2` never does.

**Past Operators:**

- **previous e**: True if `e` was true in the previous state (or if there is no previous state, i.e., at the initial state).
- **alwaysPast e**: True if `e` was true in all past states.
- **sometimePast e**: True if `e` was true in at least one past state.
- **always e1 since e2**: True if `e1` has been true since the last time `e2` was true.
- **sometime e1 since e2**: True if `e1` has been true at some point since the last time `e2` was true.

**Modifiers:**

- **anext**: Evaluates an operation in the next state.
- **apre**: Evaluates an operation in the previous state.

These operators enable precise specification of temporal relationships, making TOCL suitable for modeling and verifying dynamic system behaviors.

#### Syntax and Semantics

The syntax of TOCL integrates these temporal operators seamlessly into OCL expressions, allowing them to be used within invariants, preconditions, and postconditions. For example:

- An invariant using `always`:

  ```
  context C inv:
    always (self.attribute > 0)
  ```
- A condition using `next`:

  ```
  context C inv:
    (self.state = #active) implies next (self.state = #idle)
  ```

The semantics of these operators are defined over infinite sequences of system states, where each state represents a snapshot of the system at a given time. The evaluation of an expression depends on its position within this sequence:

- `next e` is true if `e` holds at the state immediately following the current one.
- `always e` is true if `e` holds at the current state and all future states.
- `sometime e` is true if `e` holds at the current state or some future state.
- For past operators, the evaluation considers the sequence of states preceding the current state, with `previous e` being true if `e` held in the prior state, and so forth.

Formal definitions of the semantics are provided in \[28\], based on a state sequence (\\hat{\\sigma} = \\langle \\sigma_0, \\sigma_1, \\ldots \\rangle), ensuring a rigorous foundation for TOCL. For a detailed formal treatment, readers are referred to the original paper.

#### Example Specifications

To demonstrate the practical application of these operators, we adapt examples from the steam boiler control specification problem \[1\], as presented in \[28\]:

1. **Initialization Persistence:**

   ```
   context Program inv:
     self.mode = #initialization implies
     always self.mode = #initialization
     until (PhysicalUnit.allInstances->forAll(pu | pu.ready)
            or self.wlmdFailure)
   ```

   This invariant specifies that if the program is in `initialization` mode, it remains in that mode until all physical units are ready or a water level measurement failure occurs.

2. **Eventual Water Level Drop:**

   ```
   context SteamBoiler inv:
     self.valve = #open implies sometime self.wlmd.q <= n2
   ```

   This constraint ensures that if the steam boiler's valve is open, the water level will eventually drop to or below the normal upper boundary `n2`.

3. **Mode Transition:**

   ```
   context Program inv:
     (self.mode = #initialization and self.wlmdFailure)
     implies next self.mode = #emergencystop
   ```

   This specifies that if a failure is detected during initialization, the next state must transition to `emergencystop`.

These examples highlight how TOCL's temporal operators enable the specification of complex dynamic properties, forming a critical component of the TOCL+ language. In the subsequent subsections, we build upon this foundation by introducing event-based constructs and their integration with these temporal capabilities.