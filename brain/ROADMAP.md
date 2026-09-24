# Joyeb Brain — roadmap

Updated 2026-09-24. How it works and how to run it: [README.md](README.md).

## Goal and definition of done

Connect an experimental model to the website so its decisions can be observed and, only after validation and an explicit owner decision, placed as automatic Alpaca **paper** trades with visible orders, position limits, a pause control and recovery after failures. First scope: SPY, completed 15-minute bars, long one share or flat.

The fruit-fly connectome is a research feature generator. It is not a trained financial brain and does not establish a trading advantage. Success means a working, tested paper-trading system and honest measurement; profitable results cannot be promised.

## Phases

| Phase | Status | Exit condition |
|---|---|---|
| 1. Reuse the existing site | Done | Docusaurus site, Cloudflare Worker, Alpaca paper transport and owner passphrase reused |
| 2. Local model and website integration | Done | Python runner, measured subgraph, evaluation, `/brain` page and protected Worker routes work together |
| 3. Verify the first release | Done | Tests, retraining, build, browser checks and documentation complete |
| 4. Publish website and Worker, paused | In progress | GitHub checks pass; `/brain` and `/_m/brain/status` live, automation disabled |
| 5. Enough history, honest assessment | Next | Longer real dataset; evaluation reported once, without tuning to the test period |
| 6. Observe, then supervised paper operation | Later | Signals visible; a qualified model submits and reconciles bounded paper orders; pause and restart tested |
| 7. Reliability and research | Later | Recorded paper outcomes, failures and costs guide the next experiment |

## Current evidence (do not exaggerate)

The first research run used 337 real IEX bars (2026-09-03 to 2026-09-23), obtained through the short-window endpoint, giving 110 usable examples: 64 train, 20 validation, 22 test. On the 22 test bars the fly readout returned −0.118% after assumed costs with 2 order sides, the market-only model 0.000% with no trades, and always-long +0.201%. All four gate checks failed (model `1ca241f874892b71`, pipeline `fly-v630-market-v1`). This result is kept as a baseline; it is too small to say anything about skill.

## Phase 5 — what counts as evidence

- Collect at least 120 calendar days and confirm the source and range in `runtime/data.json`; the short-window fallback does not count.
- The gate stays as defined: at least 100 test bars, positive after costs, better than the market-only model, at least 10 order sides.
- Before treating a pass as useful: several chronological walk-forward periods, cost sensitivity, and each experiment's data range, pipeline version, graph hash and model id saved.
- If the fly circuit adds nothing over the market-only model, report that. A conventional strategy would be a separate, explicit experiment, not a silent change to this one.

## Phase 6 — operating rules

- Start with observation, then published observation. Paper orders need a `--paper` runner, a passed gate and the owner's explicit enable.
- The computer running the runner must stay on and awake; this version is not a hosted service. Moving to always-on hosting is a separate decision (no paid resources without the owner's approval).
- Pause blocks new orders, including the scheduled exit; it never cancels or liquidates.
- Manual SPY positions, partial fills and uncertain broker state halt automation. Settle uncertain orders with `python -m joyeb_brain resolve <client_id>`; never erase the ledger.
- Before a supervised pilot: test timeout and restart reconciliation, confirm the correct paper account, and monitor daily.

## Guardrails

- Paper only; the Worker has no live-money endpoint.
- Credentials stay in Cloudflare secrets and the owner's private prompt; never in the repository, a command line, a URL or a report.
- Development tests never contact a real broker or submit real paper orders.
- Failed results are reported as they are; the gate is not loosened to get a demonstration trade.
