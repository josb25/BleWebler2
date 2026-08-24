---
layout: default
title: Universal Label Template
---

# Universal Label Template

**A safe, adaptive JSON format for labels that outlive one printer.**

ULT separates reusable label intent from printer protocols. Templates use typed parameters, responsive geometry, constraints, and a bounded expression language; they never contain executable JavaScript.

- [Read the 1.0 specification](SPEC.html)
- [Browse the examples](https://github.com/josb25/BleWebler2/tree/main/packages/ult/examples)
- [View the reference implementation](https://github.com/josb25/BleWebler2/tree/main/packages/renderer)
- [Open BleWebler2](https://josb25.github.io/BleWebler2/)

## Core properties

| Property | Meaning |
| --- | --- |
| Adaptive | Resolves against the target media size and printer resolution |
| Parametric | Declares typed fields without embedding application logic |
| Safe | Uses validated data and a bounded, non-Turing-complete expression AST |
| Portable | JSON documents contain no printer protocol or platform dependency |

This is version 1 of the format. Incompatible future changes require a new document version.
