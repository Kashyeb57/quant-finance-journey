# SATS strategy research

SATS is the next main strategy being evaluated for the Brain. The Python research port follows
the owner-supplied **Self-Aware Trend System v1.12.0 by WillyAlgoTrader**. It is a trend indicator,
not a biological brain, a calibrated prediction probability, or proof of profitable execution.
The original fly-model artifacts and their failed evaluation are retained.

## Run the research

From `brain/`, in the existing Python environment with `requirements-github.txt` installed:

```sh
python -m joyeb_brain.sats_research
```

This reads saved MU 15-minute OHLCV and metadata. It makes no network requests, reads no credentials,
publishes nothing and submits no orders. Output stays in the ignored `runtime/sats-research/` folder:

- `evaluation.json`: bounded saved report for the Brain page's **Load evaluation JSON** control.
- `audit.json`: all simulated fills, completed trades, settings and full equity curves.
- `observations.csv`: every bar's trend, TQI components, score, pivots and proposed risk levels.

The site change is local until published. Loading a research report shows historical observations,
an inspectable trend chart and test comparisons; it cannot enable paper orders. The old local/GitHub
publisher still runs the fly model. SATS is not wired into that publisher or the order endpoint yet.

Use another MU CSV only with matching provenance metadata:

```sh
python -m joyeb_brain.sats_research --csv path/to/mu.csv --metadata path/to/data.json
python -m joyeb_brain.sats_research --session regular
python -m joyeb_brain.sats_research --target-mode Dynamic --exit-target tp3 --cost-bps 10
```

Metadata must identify `symbol: MU` and `timeframe: 15Min`; text timestamps need explicit UTC offsets.
Each run overwrites only this research folder's reports. It does not replace the original evaluation,
bars, model or encrypted deployment. The report records the source CSV's SHA256.

## Indicator rules

The default Auto preset on 15-minute bars resolves to Default: ATR 14, base band width 2,
efficiency window 20, RSI 14 and stop buffer 1.5 effective ATR. The default warmup is 110 bars.

- Wilder ATR uses its SMA seed and then RMA smoothing. Efficiency can reduce noisy ATR.
- TQI combines efficiency, volume regime, price structure and momentum persistence.
- TQI, legacy efficiency adaptation, asymmetry and smoothing modify the trend bands.
- A confirmed close beyond the previous trend band changes direction. Quality collapse can also
  cause a character flip. Signals occur on new flips after warmup, not on every bullish candle.
- Pivots are usable only after their right-hand confirmation bars. The score uses confirmed data.
- RSI, volume and structure score switches are **display** settings in the supplied source; they
  do not silently add entry filters. Scores and grades are not win probabilities.
- Fixed and Dynamic target calculations are supported. Experimental auto-calibration remains
  disabled, matching the source default; there is no claim of autonomous financial learning.

Tests cover hand-calculated factors, Wilder initialization, pivot confirmation, warmup, and unchanged
earlier observations when future prices/volume change. Exact TradingView numerical parity, especially
equal-pivot ties and initial-history differences, still requires identical exported candles and values.

## Execution assumptions differ from the indicator

The source tracks both long and short hypothetical trades and allocates one-third at each target.
The existing Brain is MU only, one whole share, long or flat. This research keeps that constraint:
bearish flips close longs, and the whole share exits at the chosen target (`tp3` by default).
There are no imaginary one-third broker fills or new short positions.

The simulation uses:

- Decisions at completed closes, entries/opposite-flip exits at the next contiguous bar's open.
- $10,000 starting research cash, one share, $1,500 buy-price cap, at most six entries per day.
- Default afternoon entry signals at 13:15–15:15 New York; `--session regular` permits 09:30–15:15.
  Both retain the 15:30 flatten signal / 15:45 intended next-open exit and early-close adjustments.
- Assumed resting stop and target orders. A stop wins an ambiguous bar that touches both.
- An adverse gap through a stop exits at the observed open. Losses are not clipped to −1R.
- A missing next candle cannot create an entry fill. A held position encountering a data gap exits
  at the next observed open, not retroactively at a previously favorable close.
- Costs charged on both sides; default 5 bps per side, with 0/10/20 bps sensitivity included.
- A disclosed accounting liquidation at the final sample close if still holding.

These resting protective orders **do not exist in the current SATS execution adapter**, because that
adapter has not been built. Next-open fills are also optimistic for the scheduled runner's minimum
60-second settling delay and GitHub scheduling delays. This is a strategy research backtest, not a
backtest proving that the current scheduler could reproduce those fills.

## First local result — October 5, 2026

Saved IEX history: 2,158 bars from May 28 through September 24, 2026. No fresh data was downloaded.
The indicator generated 86 buy and 86 sell flips after warmup across that history.
Parameters stayed at their defaults; the final 20% of sessions supplies 442 test bars,
September 1–24. Earlier bars initialize the indicator; test simulation starts flat.

| Test entry window | Completed trades | Net P&L after 5 bps per side |
|---|---:|---:|
| Existing afternoon window | 4 | −$5.68 |
| Regular-session research comparison | 14 | +$11.18 |

Both use one share and a $10,000 account basis. Under the afternoon policy, the fixed-band trend
control returned −$0.76, while a passive intraday share returned +$26.84 in the same window.
The fixed-band control is a new transparent ATR-band baseline, not the original fitted ridge model.
Results from different session policies must not be conflated. These small samples do not establish
an edge; selection of the profitable window after seeing this comparison would need fresh validation.

`paper_ready` is always false in this research version. Alongside the mechanical sample/profit/activity
checks, Pine parity, forward testing and the execution adapter remain explicitly unverified.

## Before paper execution

1. Compare the port against exported Pine observations on identical OHLCV/timeframe/settings.
2. Set the actual entry window and exit target before testing additional periods. Use new history,
   multiple chronological periods and costs; do not optimize on the reported final test results.
3. Implement and test broker-side protective orders, fill/reconciliation state and strategy identity
   in the existing runner/Worker. The old freshness, owner control, deduplication and pause rules stay.
4. Verify observation publication and delayed/missed-job behavior before any owner-enabled paper run.

Pine's broker-emulator execution rules are documented in
[TradingView Strategies](https://www.tradingview.com/pine-script-docs/concepts/strategies/).
The supplied indicator's on-chart hypothetical R statistics are not used as account profits.

## SATS setup-outcome learning experiment

The owner also approved a learned setup filter: SATS identifies a new bullish setup, and a trained
readout accepts or skips that entry. Stops, targets, opposite-flip exits, scheduled flattening,
position size, entry window and costs remain the same for every comparison arm.

The three arms are:

- **SATS alone:** take every eligible SATS buy flip, with the shared execution constraints.
- **SATS + simple learning:** ridge readout of the six existing market inputs plus SATS diagnostics.
- **SATS + fly learning:** ridge readout of the existing 32 pooled spike features plus the same SATS
  diagnostics. The measured circuit and its six market-input mapping remain fixed.

SATS diagnostics include trend, TQI, effective ATR relative to price, volatility ratio, efficiency,
and price-to-trend-line distance in ATR units. All inputs use information available at the signal
bar's close. No buy/sell imitation labels or future extrema enter the input features.

Each training label is the independently simulated setup's **net P&L divided by its filled entry
price, in basis points**, after costs on both sides. The setup uses the shared next-open entry and
the same subsequent exit rules. A setup that cannot fill or has only an end-of-sample accounting
exit supplies no completed training outcome. These labels describe hypothetical fills; they are
not actual broker results. Independent setup labels are different from a portfolio equity curve;
the comparison itself enforces the one-share/cash/entry-cap rules through the shared simulator.

The experiment settings were fixed before examining new results: afternoon signals (13:15–15:15
New York), one share, TP3 whole-position exit, $10,000 cash basis, $1,500 buy cap, five bps per side,
ridge penalty 10, and acceptance only when predicted **net** setup return exceeds zero bps. Missing
features or any of the twelve market/SATS inputs beyond six training standard deviations keep both
learned filters from entering. Fly market inputs are additionally clipped to three standard deviations
before simulation. There is no threshold adjustment to manufacture activity.

Training scaling and coefficients use earlier completed setup labels only. A label remains unavailable
until its exit bar has closed, even when the simulated fill happened earlier; any label reaching the
evaluation boundary is purged. Historical expanding-window folds are exploration. September 1–24
was already inspected during earlier experiments and is not presented as new independent evidence.
The fresh evaluation begins September 25; its models remain frozen throughout the later period.

From `brain/`, after obtaining genuine MU history and provenance in the ignored research folder:

```sh
python -m joyeb_brain.sats_learning --csv runtime/sats-learning/data.csv --metadata runtime/sats-learning/data.json --fresh-start 2026-09-25T00:00:00-04:00 --end 2026-10-02T20:00:00Z
```

This independent command writes its bounded `evaluation.json`, full `audit.json`, setup predictions
and fitted model parameters under `runtime/sats-learning/`. Load that evaluation on the Brain page
for the three-arm comparison and historical setup inspection. It retains the original fly model,
encrypted deployment, saved bars and SATS-only research. It never publishes or places orders.

The learned report also has `paper_ready=false`. A small positive result would need more unseen
periods and a verified execution adapter; a simple filter beating the fly filter would indicate
that the measured circuit has not demonstrated additional value in this experiment.

## First learned comparison — October 5, 2026

Retrieved genuine raw Alpaca IEX MU bars through the site's public market endpoint: 6,502 regular-session
15-minute bars across 251 sessions, October 3, 2025–October 2, 2026. The CSV hash and retrieval metadata
are saved beside the reports. Original bars, model, graph, evaluations and encrypted deployment remain
unchanged. The older overlap had one revised volume value and no revised prices; metadata records it.

Both models fitted on 53 completed earlier setup outcomes; zero labels crossed the frozen September 25
boundary. The primary fresh window contains 156 bars over six sessions, September 25–October 2, with
two eligible SATS setups. Every comparison starts flat and uses the prespecified afternoon policy.

| Fresh comparison | Completed trades | Net P&L after 5 bps per side |
|---|---:|---:|
| SATS alone | 2 | −$7.46 |
| SATS + simple learning | 1 | −$3.13 |
| SATS + fly learning | 1 | −$3.13 |

Both filters skipped the September 30 setup and accepted the October 1 setup. Both setups subsequently
lost money. The fly readout gave different forecasts but made the same choices as the simple readout;
it demonstrated no incremental value in this window. Two unseen setups cannot establish either
filter's usefulness, and all three arms lost money. The historical expanding folds remain exploration
and must not be combined with the fresh window as independent evidence.

The models and policy were not retuned after these results. Keep them frozen while collecting more
later observations. The saved report makes the expected net basis points, acceptance, later outcome,
three equity curves and exploratory folds inspectable on the Brain page. Paper readiness stays false.

## Scheduled observation — October 11, 2026

The GitHub runner uses a separate encrypted SATS snapshot to extend the indicator's immutable seed
with completed later bars and score eligible new setups using these frozen readouts. Current forecasts
appear separately from the saved comparison; publication strips fitted parameters. No cycle retrains
the model or updates historical test outcomes. Both Python and the Worker refuse SATS paper mode and
orders. Follow [GITHUB.md](GITHUB.md) for private secret setup, one manual verification run and schedule
activation. The original fly runner and its saved artifacts remain intact.
