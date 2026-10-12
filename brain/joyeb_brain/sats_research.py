"""Offline SATS research command: no token, publishing, or order submission.

    python -m joyeb_brain.sats_research

Writes only runtime/sats-research. It never replaces the fly evaluation/model.
"""
import argparse
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from .data import EARLY_CLOSES, RUNTIME, SYMBOL, atomic_json, clean_bars
from .sats import SatsConfig, calculate_sats


@dataclass(frozen=True)
class ResearchPolicy:
    capital: float = 10000.0
    cost_bps: float = 5.0
    max_buy_price: float = 1500.0
    max_entries_per_day: int = 6
    entry_start: int = 795  # 13:15 NY signal-bar start, existing Brain contract
    entry_end: int = 915    # 15:15 NY signal-bar start
    flatten_start: int = 930  # 15:30 signal -> next open 15:45
    exit_target: str = "tp3"  # Whole-share exit; no fictitious thirds
    timeout_bars: int = 100

    def __post_init__(self):
        if any(not math.isfinite(v) for v in (self.capital, self.cost_bps, self.max_buy_price)):
            raise ValueError("Policy amounts must be finite")
        if self.capital <= 0 or self.max_buy_price <= 0 or not 0 <= self.cost_bps <= 100:
            raise ValueError("Invalid capital, cost or buy cap")
        if type(self.max_entries_per_day) is not int or not 1 <= self.max_entries_per_day <= 6:
            raise ValueError("Entry cap must be 1..6")
        if not 570 <= self.entry_start <= self.entry_end < self.flatten_start <= 945:
            raise ValueError("Entry/flatten times must fit the regular NY session")
        if self.exit_target not in {"tp1", "tp2", "tp3"} or type(self.timeout_bars) is not int or self.timeout_bars < 1:
            raise ValueError("Invalid exit target or timeout")


def backtest_long_flat(observations, policy=None, start_index=0, benchmark=False, entry_mask=None):
    """One-share cash-account simulation, causal close signals / next-open fills.

    Stop orders are a RESEARCH assumption, not an existing broker feature.
    Stop beats target on ambiguous OHLC bars; a gap stop fills at the open.
    Missing bars do not grant an imaginary exit at the previous close.
    entry_mask is an optional positional boolean mask on signal bars. It filters
    new entries only; protective orders and all exit decisions remain identical.
    """
    policy = policy or ResearchPolicy()
    if not 0 <= start_index < len(observations):
        raise ValueError("Test start must be inside the observations")
    allowed = np.ones(len(observations), dtype=bool) if entry_mask is None else np.asarray(entry_mask)
    if allowed.ndim != 1 or len(allowed) != len(observations) or allowed.dtype.kind != "b":
        raise ValueError("Entry mask must contain one boolean per observation")
    cash, position, pending = policy.capital, None, None
    fills, trades, curve = [], [], []
    entry_counts, skipped = {}, {}
    ambiguous, exposed = 0, 0
    cost = policy.cost_bps/10000

    def skip(reason):
        skipped[reason] = skipped.get(reason, 0)+1

    def sell(price, reason, row):
        nonlocal cash, position
        fee = price*cost
        cash += price-fee
        fills.append({"bar_time": row.time.isoformat(), "side": "sell", "price": price, "quantity": 1,
                      "assumed_cost": fee, "reason": reason})
        net = price-position["entry"]-fee-position["entry_cost"]
        trades.append({"signal_bar": position["signal_bar"], "entry_bar": position["entry_bar"],
                       "exit_bar": row.time.isoformat(),
                       "label_end": (row.time+pd.Timedelta(minutes=15)).isoformat(),
                       "entry": position["entry"], "exit": price, "net_pnl": net, "reason": reason,
                       "risk": position["entry"]-position["stop"], "entry_tqi": position["tqi"]})
        position = None

    previous = None
    for i in range(start_index, len(observations)):
        row = observations.iloc[i]
        eastern = row.time.tz_convert("America/New_York")
        day, minute = eastern.strftime("%Y-%m-%d"), eastern.hour*60+eastern.minute
        flatten = min(policy.flatten_start, 750 if day in EARLY_CLOSES else policy.flatten_start)
        contiguous = previous is not None and row.time-previous.time == pd.Timedelta(minutes=15)
        if position and not contiguous:
            sell(float(row.open), "data_gap_exit", row)
            pending = None
        if pending is not None:
            action = pending
            pending = None
            if action["side"] == "sell" and position is not None:
                sell(float(row.open), action["reason"], row)
            elif action["side"] == "buy" and position is None:
                price = float(row.open)
                if not contiguous or day != action["day"]:
                    skip("missing_next_open")
                elif not minute < flatten+15:
                    skip("late_entry")
                elif price > policy.max_buy_price or price*(1+cost) > cash:
                    skip("price_or_cash_cap")
                elif not benchmark and not action["stop"] < price < action["target"]:
                    skip("open_beyond_stop_or_target")
                elif entry_counts.get(day, 0) >= policy.max_entries_per_day:
                    skip("daily_entry_cap")
                else:
                    fee = price*cost
                    cash -= price+fee
                    entry_counts[day] = entry_counts.get(day, 0)+1
                    position = {"entry": price, "entry_cost": fee, "entry_index": i,
                                "signal_bar": action["signal_bar"],
                                "entry_bar": row.time.isoformat(), "stop": action["stop"],
                                "target": action["target"], "tqi": action["tqi"]}
                    fills.append({"bar_time": row.time.isoformat(), "side": "buy", "price": price,
                                  "quantity": 1, "assumed_cost": fee, "reason": "passive_entry" if benchmark else "confirmed_buy"})
        if position is not None:
            exposed += 1
            if not benchmark:
                stopped = float(row.low) <= position["stop"]
                targeted = float(row.high) >= position["target"]
                if stopped:
                    ambiguous += int(targeted)
                    sell(min(float(row.open), position["stop"]), "stop", row)
                elif targeted:
                    sell(position["target"], policy.exit_target, row)
        # Every decision here occurs AFTER observing this bar's close.
        if position is not None:
            reason = ("scheduled_flat" if minute >= flatten else
                      "opposite_flip" if not benchmark and row.signal == "sell" else
                      "timeout" if not benchmark and i-position["entry_index"]+1 >= policy.timeout_bars else None)
            if reason:
                pending = {"side": "sell", "reason": reason}
        elif row.warmed_up and minute < flatten:
            eligible = (benchmark and entry_counts.get(day, 0) == 0) or (not benchmark and row.signal == "buy")
            if eligible:
                if not policy.entry_start <= minute <= policy.entry_end:
                    skip("outside_entry_window")
                elif not allowed[i]:
                    skip("learned_filter")
                elif not benchmark and row.atr <= 0:
                    skip("zero_atr")
                else:
                    pending = {"side": "buy", "day": day, "signal_bar": row.time.isoformat(), "stop": float(row.stop),
                               "target": float(row[policy.exit_target]), "tqi": float(row.tqi)}
        equity = cash+(float(row.close) if position is not None else 0)
        curve.append({"time": (row.time+pd.Timedelta(minutes=15)).isoformat(), "equity": equity/policy.capital})
        previous = row
    # Explicit accounting close at the final observed close, not a forecast of an executable fill.
    if position is not None:
        sell(float(previous.close), "end_of_sample", previous)
        curve[-1]["equity"] = cash/policy.capital
    if pending and pending["side"] == "buy":
        skip("no_future_fill_bar")
    peak, drawdown = 1.0, 0.0
    for point in curve:
        peak = max(peak, point["equity"])
        drawdown = min(drawdown, point["equity"]/peak-1)
    return {"return_pct": (cash/policy.capital-1)*100, "net_pnl": cash-policy.capital,
            "max_drawdown_pct": drawdown*100, "order_sides": len(fills), "trade_count": len(trades),
            "win_rate_pct": 100*sum(t["net_pnl"] > 0 for t in trades)/len(trades) if trades else None,
            "exposure_pct": 100*exposed/len(curve), "bars": len(curve), "ambiguous_stop_target_bars": ambiguous,
            "skipped_entries": skipped, "curve": curve, "fills": fills, "trades": trades}


def evaluate_sats(frame, config=None, policy=None, data_info=None):
    cfg, policy = config or SatsConfig(), policy or ResearchPolicy()
    observations = calculate_sats(frame, cfg)
    days = observations.time.dt.tz_convert("America/New_York").dt.strftime("%Y-%m-%d")
    unique_days = list(days.unique())
    if len(unique_days) < 10 or len(observations) < cfg.warmup+100:
        raise ValueError("Need at least 10 sessions and warmup + 100 bars for chronological research")
    first_test_day = unique_days[int(len(unique_days)*0.8)]
    split = int(observations.index[days.eq(first_test_day)][0])
    if split <= cfg.warmup:
        raise ValueError("Insufficient history before the test boundary")
    baseline_config = replace(cfg, adaptive=False, quality=False, quality_strength=0,
                              asymmetric=False, efficiency_atr=False, character_flip=False)
    baseline = calculate_sats(frame, baseline_config)
    metrics = {"sats": backtest_long_flat(observations, policy, split),
               "fixed_band": backtest_long_flat(baseline, policy, split),
               "passive": backtest_long_flat(observations, policy, split, benchmark=True)}
    cost_sensitivity = {str(bps): backtest_long_flat(observations, replace(policy, cost_bps=bps), split)["net_pnl"]
                        for bps in sorted({0.0, policy.cost_bps, 10.0, 20.0})}
    latest = observations.iloc[-1]
    old = observations.loc[observations.signal.ne("hold")]
    latest_signal = old.iloc[-1] if not old.empty else None
    settings = {"indicator": asdict(cfg), "execution": asdict(policy)}
    strategy_id = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()[:16]
    core = metrics["sats"]
    checks = {"at_least_100_test_bars": core["bars"] >= 100,
              "positive_after_assumed_costs": core["net_pnl"] > 0,
              "beats_fixed_band_baseline": core["net_pnl"] > metrics["fixed_band"]["net_pnl"],
              "at_least_10_order_sides": core["order_sides"] >= 10,
              "pine_parity_verified": False, "forward_test_verified": False,
              "execution_adapter_verified": False}
    diagnostics = {k: float(latest[k]) for k in ("tqi", "er", "vol_ratio", "score", "line", "atr", "rsi",
                   "tqi_efficiency", "tqi_volume", "tqi_structure", "tqi_momentum")}
    test_rows = observations.iloc[split:]
    sampled = test_rows.iloc[::max(1, math.ceil(len(test_rows)/499))]
    if sampled.index[-1] != test_rows.index[-1]:
        sampled = pd.concat([sampled, test_rows.iloc[-1:]])
    chart_bars = [{"time": row.time.isoformat(), "close": float(row.close), "line": float(row.line),
                   "tqi": float(row.tqi), "trend": int(row.trend), "signal": row.signal}
                  for row in sampled.itertuples()]
    sessions = {}
    for name, start in (("afternoon", 795), ("regular", 570)):
        result = backtest_long_flat(observations, replace(policy, entry_start=start), split)
        sessions[name] = {key: result[key] for key in ("net_pnl", "trade_count", "order_sides", "return_pct")}
    report = {"schema": 2, "strategy": "sats", "strategy_version": "1.12.0-research-1",
              "attribution": "SATS indicator by WillyAlgoTrader; owner-supplied Pine v1.12.0",
              "created_at": datetime.now(timezone.utc).isoformat(), "symbol": SYMBOL, "timeframe": "15Min",
              "model_id": strategy_id, "paper_ready": False, "checks": checks, "settings": settings,
              "data": {**(data_info or {}), "rows": len(frame), "first": observations.time.iloc[0].isoformat(),
                       "last": latest.time.isoformat()},
              "split": {"history": split, "test": len(frame)-split,
                        "test_start": observations.time.iloc[split].isoformat(),
                        "test_end": (latest.time+pd.Timedelta(minutes=15)).isoformat()},
              "cost_bps_per_side": policy.cost_bps, "metrics": metrics,
              "cost_sensitivity_net_pnl": cost_sensitivity,
              "latest": {"bar_time": latest.time.isoformat(), "price": float(latest.close),
                         "trend": int(latest.trend), "signal": latest.signal, **diagnostics,
                         "reason": ("Confirmed bullish flip" if latest.signal == "buy" else
                                    "Confirmed bearish flip" if latest.signal == "sell" else
                                    "Bullish trend continues; waiting for a new flip" if latest.trend == 1 else
                                    "Bearish trend continues; no long entry"),
                         "last_signal": None if latest_signal is None else {
                             "bar_time": latest_signal.time.isoformat(), "side": latest_signal.signal,
                             "price": float(latest_signal.close), "stop": float(latest_signal.stop),
                             "tp1": float(latest_signal.tp1), "tp2": float(latest_signal.tp2), "tp3": float(latest_signal.tp3)}},
              "signal_counts": {"buy": int(observations.signal.eq("buy").sum()),
                                "sell": int(observations.signal.eq("sell").sum())},
              "test_observations": chart_bars, "session_comparison": sessions,
              "limitations": [
                  "Research port; exact Pine numerical parity, including pivot ties, is not yet verified.",
                  "Fixed default parameters; final 20% of sessions evaluated chronologically, no tuning on test.",
                  "One share, long or flat; bearish signals exit, not short. Whole position exits at chosen TP, not thirds.",
                  "Stops/targets are assumed resting orders for research; the current Worker/GitHub runner does not implement them.",
                  "Next-open fills are optimistic for a delayed, 60-second-settled scheduled runner; this is not its execution backtest.",
                  "Stops win ambiguous OHLC bars; adverse gaps fill at open, with no -1R clipping. End-of-sample close is accounting only.",
                  "Assumed costs and IEX-only OHLCV do not establish achievable fills or future profitability.",
                  "SATS grades are diagnostics, not calibrated probabilities; experimental auto-calibration remains off."]}
    return report, observations


def main():
    parser = argparse.ArgumentParser(description="Offline SATS research; no publishing or trading")
    parser.add_argument("--csv", type=Path, default=RUNTIME/"bars.csv")
    parser.add_argument("--metadata", type=Path, default=RUNTIME/"data.json")
    parser.add_argument("--preset", choices=["Auto", "Default", "Scalping", "Swing", "Custom"], default="Auto")
    parser.add_argument("--target-mode", choices=["Fixed", "Dynamic"], default="Fixed")
    parser.add_argument("--exit-target", choices=["tp1", "tp2", "tp3"], default="tp3")
    parser.add_argument("--cost-bps", type=float, default=5)
    parser.add_argument("--session", choices=["afternoon", "regular"], default="afternoon",
                        help="Research entry window only; never changes Worker controls")
    args = parser.parse_args()
    info = json.loads(args.metadata.read_text(encoding="utf-8"))
    if info.get("symbol") != SYMBOL or info.get("timeframe", "15Min") != "15Min":
        parser.error("Research input metadata must identify MU 15-minute bars")
    frame = clean_bars(pd.read_csv(args.csv), require_offset=True)
    cfg = SatsConfig.for_preset(args.preset, target_mode=args.target_mode)
    policy = ResearchPolicy(cost_bps=args.cost_bps, exit_target=args.exit_target, timeout_bars=cfg.timeout_bars,
                            entry_start=570 if args.session == "regular" else 795)
    report, observations = evaluate_sats(frame, cfg, policy, info)
    report["data"]["sha256"] = hashlib.sha256(args.csv.read_bytes()).hexdigest()
    folder = RUNTIME/"sats-research"
    folder.mkdir(parents=True, exist_ok=True)
    observations.to_csv(folder/"observations.csv", index=False)
    # Full-resolution audit artifacts stay private; page import uses a bounded curve.
    atomic_json(folder/"audit.json", report)
    for metric in report["metrics"].values():
        metric.pop("fills", None)
        metric.pop("trades", None)
        curve = metric["curve"]
        step = max(1, math.ceil(len(curve)/239))
        metric["curve"] = curve[::step]+([curve[-1]] if curve[-1] != curve[::step][-1] else [])
    atomic_json(folder/"evaluation.json", report)
    print(json.dumps({"strategy": report["strategy"], "data_first": report["data"]["first"],
                      "data_last": report["data"]["last"], "signal_counts": report["signal_counts"],
                      "test": {name: {k: v for k, v in value.items() if k != "curve"} for name, value in report["metrics"].items()},
                      "checks": report["checks"], "paper_ready": False,
                      "report": "runtime/sats-research/evaluation.json"}, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
