# Joyeb Brain

An experimental research service for SPY that feeds a reduced, measured fruit-fly connectome with market features, trains a readout on its activity, and can place Alpaca **paper** orders through this website's Worker, but only after its research gate passes and the owner enables it. It is not a trained financial brain and it has not shown a trading advantage. Phases and current evidence: [ROADMAP.md](ROADMAP.md). Attribution: [THIRD_PARTY.md](THIRD_PARTY.md).

All commands below run from this `brain/` folder in a Python 3.10+ environment with `python -m pip install -r requirements.txt`. Times shown on the website are Central Time.

## What is being modeled

The default circuit contains 512 measured FlyWire v630 neurons, selected deterministically from the upstream model's connectivity data. All measured connections among the selected neurons are kept, with their signs. Six causal market features (1- and 4-bar returns, 8-bar volatility, bar range, bar body, volume ratio) drive 12 input channels. Thirty-two pooled spike-count features feed a ridge-regression readout. The wiring is fixed; only the readout is trained.

Training uses chronological 60/20/20 train, validation and test partitions, with two decision rows purged at each boundary. Scaling is fitted on the training part only, and the entry threshold is chosen on validation only. The test period is reported once. Returns are next-open to next-open with an assumed 5 basis points per order side. Two comparisons are reported: a ridge model on the same market inputs without the circuit, and "always long" on the same evaluated bars.

Results are normalized strategy exposure returns, not the paper account's one-share dollar profit. The feature window needs 16 contiguous same-session bars, so decisions are made only on bars starting 13:15–15:15 New York time; the 15:30 bar targets flat, and that exit is submitted about 15:46 New York (14:46 CT). Inputs more than six training standard deviations out force flat.

### Research gate (not weakened to make the interface enable)

At least 100 test bars, a positive net test return after the assumed costs, a better return than the market-only model, and at least 10 order sides. The first small-data experiment failed every check. Passing is a screening result, not evidence of future profitability.

## Data

```
python -m joyeb_brain prepare --connectome <path-to-Drosophila_brain_model> --neurons 512
python -m joyeb_brain collect --days 120
python -m joyeb_brain train
```

`prepare` extracts the reduced graph from a local checkout of the upstream model and its data (see THIRD_PARTY.md); it only needs repeating after a graph change. `collect` downloads SPY 15-minute IEX bars through the website's `/_m/brain/bars` endpoint (default 120 calendar days, maximum 365). If that endpoint is not deployed, it falls back to a short-window endpoint and says so: always check `runtime/data.json` for the source and the actual range before trusting an evaluation.

Instead of `collect`, a genuine SPY 15-minute OHLCV CSV can be imported:

```
python -m joyeb_brain import <spy-15min.csv>
```

Columns `time,open,high,low,close,volume`; `time` is the bar start, either Unix seconds or text **with an explicit UTC offset** (`2026-09-23T13:30:00Z` or `2026-09-23T09:30:00-04:00`). Times without an offset are rejected because they are ambiguous. Only completed, 15-minute-aligned regular-session bars are kept; on NYSE early-close days from late 2022 through 2027 bars from 13:00 New York onward are dropped as after-hours (the importer warns about bars outside that range, where early closes are not filtered). The importer checks OHLC consistency but cannot prove a file's symbol or origin, and synthetic data must never be used for an evaluation.

## Run

```
python -m joyeb_brain run            # observation only
python -m joyeb_brain run --once     # one cycle, then exit
python -m joyeb_brain status         # print the latest local status
```

The runner polls every 30 seconds and serves a read-only status page at `http://127.0.0.1:8767/status` (loopback only, GET only, Host-checked, readable cross-origin only by this website and its local preview; a second runner on the same port is refused). A bar is used only **60 seconds after it ends**, so late prints have arrived, and a forecast is recomputed whenever the bars it reads change. Stop the runner with Ctrl+C before retraining.

To see it on the website, start the local preview from the repository root (`npm start`), open `/brain` and choose **My local runner**. A saved `runtime/evaluation.json` can also be loaded on the page without a runner.

## Publish, then paper

```
python -m joyeb_brain run --publish  # observation, published to the website
python -m joyeb_brain run --paper    # may request paper orders, see below
```

Both prompt privately for the website's existing owner passphrase; it is never saved, printed, or put in a URL, and it is sent only as a header to the site's fixed HTTPS origin. The published report (mode, evaluation, latest signal, recent automated orders) is public; equity curves are thinned to 240 points so it stays under the website's size limit. Broker credentials live only in the Worker's Cloudflare secrets.

A paper order needs all three: a runner in `--paper` mode, a passed research gate, and the owner enabling automation on `/brain`. The Worker then re-checks everything: the runner's heartbeat, the published signal and model, the candle's age (from bar end + 60 s to 20 minutes for entries, 30 minutes for exits), the 13:15–15:15 New York entry window, market hours and the last 20 minutes of the session, the account state, a 2% daily drawdown limit for entries, open orders, the managed position, the quote's price (at most $1,000), age and cash, and six entry attempts per UTC day (the count resets at 7:00 PM CT, 6:00 PM CT in winter). Each candle is claimed in the database before any order is sent, so retries, restarts and concurrent requests cannot double-order. Orders go only to Alpaca's paper endpoint; there is no live-money path.

## Pause and recovery

- **Pause blocks every new automated order, including the scheduled flat exit.** It does not cancel submitted orders or close a position. If you pause while the bot holds its share, close or manage it yourself on the paper account.
- The bot trades SPY only, holds zero or one share it bought itself, never shorts, and never adopts or sells a position opened by hand. Any mismatch between its own ledger and the account halts automation for investigation.
- A definite broker rejection (4xx other than a timeout) is recorded as rejected and does not block later candles.
- An uncertain submission (timeout, server error) blocks automation until it is settled. After five minutes, settle it with `python -m joyeb_brain resolve <client_id>` (the id is in the order table on `/brain`). This also applies after a rate-limit rejection (HTTP 429) when the broker could not be asked straight away whether the order exists. It copies what the broker reports, or records that the broker has no such order. Never delete ledger rows to force a retry.
- Partial fills, manual trades, paper-account resets or drift need investigation; the bot will not sell a whole share against a fractional managed position.
- The service depends on your computer, the network and timely data. A stopped runner or an outage can prevent the intended exit. This version is not an always-on hosted service.

Alpaca's paper trading simulates fills and does not reproduce every live-market cost; see [paper trading](https://docs.alpaca.markets/us/docs/paper-trading) and the [orders API](https://docs.alpaca.markets/us/docs/working-with-orders).

## Files and tests

`runtime/` is ignored and holds the extracted graph, downloaded bars, the model, the evaluation, predictions, status and the runner's local decision log. Never commit datasets, models or credentials.

```
python -m unittest discover -s tests -v
```

From the repository root: `npm run lint`, `npm test`, `npm run build`, `npm run check:build`. The Worker tests use Node's built-in SQLite (Node 22.13+ or 23.4+; earlier 22.x needs `--experimental-sqlite`, otherwise the database cases are skipped); CI runs them on Node 24 and fails if they cannot run. No test contacts a real broker.
