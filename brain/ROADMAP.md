# Joyeb Brain — roadmap

Updated 2026-09-24. How it works and how to run it: [README.md](README.md).

## Goal and definition of done

Connect an experimental model to the website so its decisions can be observed and, only after validation and an explicit owner decision, placed as automatic Alpaca **paper** trades with visible orders, position limits, a pause control and recovery after failures. Scope: Micron (MU) since 2026-09-24 (SPY before), completed 15-minute bars, long one share or flat, buy quote capped at $1,500.

The fruit-fly connectome is a research feature generator. It is not a trained financial brain and does not establish a trading advantage. Success means a working, tested paper-trading system and honest measurement; profitable results cannot be promised.

## Phases

| Phase | Status | Exit condition |
|---|---|---|
| 1. Reuse the existing site | Done | Docusaurus site, Cloudflare Worker, Alpaca paper transport and owner passphrase reused |
| 2. Local model and website integration | Done | Python runner, measured subgraph, evaluation, `/brain` page and protected Worker routes work together |
| 3. Verify the first release | Done | Tests, retraining, build, browser checks and documentation complete |
| 4. Publish website and Worker, paused | Done (2026-09-24) | GitHub checks pass; `/brain` and `/_m/brain/status` live, automation disabled |
| 5. Enough history, honest assessment | In progress | Longer real dataset; evaluation reported once, without tuning to the test period |
| 6. Observe, then supervised paper operation | Later | Signals visible; a qualified model submits and reconciles bounded paper orders; pause and restart tested |
| 7. Reliability and research | Later | Recorded paper outcomes, failures and costs guide the next experiment |

## Current evidence (do not exaggerate)

**MU run 1 (2026-09-24, current).** Switched from SPY at the owner's request. 2,158 real IEX bars from `/_m/brain/bars` (2026-05-28 to 2026-09-24) gave 747 examples: 446 train, 147 validation, 150 test (2026-09-01 to 2026-09-24). The validation-chosen entry threshold was 0.10% and no test forecast exceeded it, so the fly readout never traded: 0.000% with 0 order sides. The market-only model returned −0.769% with 18 order sides, and always-long +3.809% while MU rose. Two checks passed (test bars; better than market-only, trivially) and two failed (no positive return, 0 of 10 order sides), so the model is not paper-ready (model `3dcc8e860f898314`). A readout that never trades cannot be judged; MU typically moves several times more per day than SPY, and the SPY runs below say nothing about MU.

**SPY run 2 (2026-09-24, history).** 2,158 real IEX bars from the published `/_m/brain/bars` endpoint (2026-05-28 to 2026-09-24) gave 747 usable examples: 446 train, 147 validation, 150 test (2026-09-01 to 2026-09-24). On the 150 test bars the fly readout returned +0.010% after assumed costs with 2 order sides (one round trip, 0.7% of bars in the market), the market-only model 0.000% with no trades, and always-long −2.238% over a falling month. Three checks passed, but the gate failed on order sides (2 of the required 10), so the model is not paper-ready (model `a90b90d9fe90aa71`, pipeline `fly-v630-market-v1`). One round trip says nothing about skill: the readout mostly stayed flat through a decline.

**SPY run 1 (2026-09-23, history).** 337 IEX bars from the short-window endpoint (2026-09-03 to 2026-09-23), 110 examples (64/20/22). On 22 test bars the fly readout returned −0.118% with 2 order sides, market-only 0.000%, always-long +0.201%. All four checks failed (model `1ca241f874892b71`).

Next evidence steps: walk-forward periods and cost sensitivity before reading anything into a pass; a model that trades almost never cannot pass the order-sides check, and that check stays.

## Phase 5 — what counts as evidence

- Collect at least 120 calendar days and confirm the source and range in `runtime/data.json`; the short-window fallback does not count.
- The gate stays as defined: at least 100 test bars, positive after costs, better than the market-only model, at least 10 order sides.
- Before treating a pass as useful: several chronological walk-forward periods, cost sensitivity, and each experiment's data range, pipeline version, graph hash and model id saved.
- If the fly circuit adds nothing over the market-only model, report that. A conventional strategy would be a separate, explicit experiment, not a silent change to this one.

## Phase 6 — operating rules

- Start with observation, then published observation. Paper orders need a `--paper` runner, a passed gate and the owner's explicit enable.
- The computer running the runner must stay on and awake; this version is not a hosted service. Moving to always-on hosting is a separate decision (no paid resources without the owner's approval).
- Pause blocks new orders, including the scheduled exit; it never cancels or liquidates.
- Manual MU positions in the paper account, partial fills and uncertain broker state halt automation. Settle uncertain orders with `python -m joyeb_brain resolve <client_id>`; never erase the ledger.
- Before a supervised pilot: test timeout and restart reconciliation, confirm the correct paper account, and monitor daily.

## Guardrails

- Paper only; the Worker has no live-money endpoint.
- Credentials stay in Cloudflare secrets and the owner's private prompt; never in the repository, a command line, a URL or a report.
- Development tests never contact a real broker or submit real paper orders.
- Failed results are reported as they are; the gate is not loosened to get a demonstration trade.
