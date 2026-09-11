---
title: Introduction to Quantitative Finance
sidebar_label: Introduction
description: A complete quant finance course in 57 notes — derivatives and the Greeks, stochastic modelling, Value at Risk, swaps, model governance and portfolio measurement.
---

**Derivatives, risk management and quantitative modelling** — worked from first
principles, with every model built, every spreadsheet checked, and every number
recomputed rather than taken on trust.

Nine modules, **57 notes**. Each one is written to be read in order, but they
cross-reference heavily, so you can also drop into whichever part you need.

## The path through

### 1. Foundations — what a derivative is

**[Introduction to Derivatives](/docs/Finance/Quant_Finance_Bootcamp/Introduction_to_Derivatives)**

Forwards, futures and options from first principles: what an underlying is, the
difference between exchange-traded and OTC, why clearing houses and central
counterparties exist, how margin accounts operate, and the long and short payoff
diagrams. Covers European versus American exercise, and the roles of hedgers,
speculators and arbitrageurs.

### 2. Risk management — the Greeks and the hedges

**[Risk Management in Derivatives](/docs/Finance/Quant_Finance_Bootcamp/Risk_Management_Greeks)**

The five Greeks — **delta, gamma, theta, vega and rho** — what each measures,
where each peaks, and how they behave as expiry approaches. Then the six hedges
built on them: delta, gamma, delta-gamma, vega, theta and rho hedging, each with
a worked example.

The through-line: **you never remove risk, you choose which risk to carry.**

### 3. Modelling the underlying

**[Quant Modeling & Stochastic Processes](/docs/Finance/Quant_Finance_Bootcamp/Quant_Modeling_Stochastic_Processes)**

Binomial trees for option pricing, then Brownian motion, the Wiener process and
geometric Brownian motion. The Black-Scholes model — its six assumptions, the
formula, and what N(d1) and N(d2) actually mean. Finally Monte Carlo simulation,
applied to European, Asian and barrier options.

Three unrelated methods price the same contract to within a cent of each other,
which is the best evidence any of them work.

### 4. Interest rates as random processes

**[Stochastic Interest Rate Modeling](/docs/Finance/Quant_Finance_Bootcamp/Stochastic_Interest_Rate_Modeling)**

The **Vasicek** model and mean reversion, then **CIR** — Vasicek plus a square
root, which is what stops simulated rates going negative. Both calibrated to
real Treasury data by maximum likelihood.

### 5. How much could we lose?

**[Value at Risk Modeling](/docs/Finance/Quant_Finance_Bootcamp/Value_at_Risk)**

Three ways to compute VaR — historical, variance-covariance and Monte Carlo —
built on the same real bank portfolio so their disagreement is visible. Then two
ways to backtest it (the Basel traffic light and the Kupiec test), and
**Expected Shortfall**, which answers the question VaR refuses to: not where the
tail begins, but how deep it goes.

### 6. Swapping one risk for another

**[Swaps](/docs/Finance/Quant_Finance_Bootcamp/Swaps)**

Interest rate swaps — fixed against floating — with the spot and forward rate
machinery needed to value them, and the derivation of the forward rate from
no-arbitrage. Then currency swaps, where the principal genuinely is exchanged.

### 7. Who is accountable when the model is wrong?

**[SR 11-7 Framework for Model Risk Management](/docs/Finance/Quant_Finance_Bootcamp/Model_Risk_SR_11_7)**

The Federal Reserve and OCC supervisory guidance. What counts as a model, the
two ways model risk arises, the three elements of validation, and the governance
that makes a validation function worth having.

This is the module that frames all the others: **every model in this course is
something SR 11-7 would require you to validate.**

### 8. Was any of it worth doing?

**[Quant Investing & Portfolio Management](/docs/Finance/Quant_Finance_Bootcamp/Quant_Investing_Portfolio_Management)**

Returns and volatility, alpha, beta and R-squared against a benchmark, and the
**Sharpe, Sortino and Treynor** ratios — three measures with the same numerator
and three different ideas of what "risk" means.

Run on a real portfolio, so the numbers are answers rather than illustrations.

## How these notes are written

Three things worth knowing before you start.

**The spreadsheets were checked, not copied.** Every model here was rebuilt and
every figure recomputed independently. That turned transcription into review,
and it surfaced genuine defects — a volatility scaled as annual when it was
daily, a discount curve that disagreed with its own forward rates, an option
formula reusing the wrong term. Where a source is wrong, the note says so, shows
the correct figure, and explains what went wrong. Nothing is silently fixed.

**Results are verified where verification is possible.** Cholesky
decompositions are checked against the correlation matrix they came from. Monte
Carlo runs are checked against closed-form answers. Barrier options are checked
with in-plus-out parity. Where a claim could be tested, it was.

**The derivations are kept.** Where a formula has a reason — why volatility
scales with the square root of time, why the forward rate is what it is, why
gamma cannot be hedged with stock — the reason is in the note, not just the
result.
