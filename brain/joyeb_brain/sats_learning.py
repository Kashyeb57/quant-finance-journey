"""Offline SATS setup-outcome research; never an execution authorization.

``evaluate_learning`` returns ``(bounded_report, full_audit)``. The CLI writes
only runtime/sats-learning/{audit.json,evaluation.json,models.npz,decisions.csv}.
Labels and all three strategies use sats_research.backtest_long_flat. A learned
mask can veto a new confirmed buy; the common simulator still controls exits.
"""
import argparse
from copy import deepcopy
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from .connectome import FlyFeatures
from .data import EARLY_CLOSES, FEATURES, RUNTIME, SYMBOL, atomic_json, clean_bars, features
from .research import fit_ridge, predict
from .sats import SatsConfig, calculate_sats
from .sats_research import ResearchPolicy, backtest_long_flat

FRESH_START = "2026-09-25T00:00:00-04:00"
INSPECTED_THROUGH = "2026-09-24T23:59:59-04:00"
PENALTY = 10.0
THRESHOLD_NET_BPS = 0.0
MIN_TRAINING_SETUPS = 10
SATS_FEATURES = ["sats_trend", "sats_tqi", "sats_atr_ratio", "sats_vol_ratio",
                 "sats_line_distance_atr", "sats_er"]
SIMPLE_FEATURES = list(FEATURES) + SATS_FEATURES
FLY_FEATURES = [f"fly_pool_{i:02d}" for i in range(32)] + SATS_FEATURES
ARMS = ("sats", "simple", "fly")


def _timestamp(value):
    result = pd.Timestamp(value)
    if result.tzinfo is None:
        raise ValueError("Research boundaries require an explicit UTC offset")
    return result.tz_convert("UTC")


def _hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False,
                                     separators=(",", ":")).encode()).hexdigest()


def build_feature_matrix(frame, observations):
    """Align six causal market inputs and six close-known SATS diagnostics.

    features(training=False) also returns legacy label columns. They are never
    selected here, so future opens cannot enter either learned arm's inputs.
    """
    market = features(frame, training=False).set_index("time")[FEATURES]
    raw = market.reindex(observations.time).to_numpy(float)
    close, atr = observations.close.to_numpy(float), observations.atr.to_numpy(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        diagnostics = np.column_stack((observations.trend, observations.tqi, atr/close,
                                       observations.vol_ratio,
                                       (close-observations.line.to_numpy(float))/atr,
                                       observations.er))
    return np.column_stack((raw, diagnostics))


def eligible_setups(observations, matrix, policy):
    eastern = observations.time.dt.tz_convert("America/New_York")
    minutes = eastern.dt.hour*60 + eastern.dt.minute
    days = eastern.dt.strftime("%Y-%m-%d")
    flatten = np.where(days.isin(EARLY_CLOSES), np.minimum(policy.flatten_start, 750), policy.flatten_start)
    return (observations.signal.eq("buy").to_numpy() & observations.warmed_up.to_numpy(bool)
            & (observations.atr.to_numpy(float) > 0)
            & minutes.between(policy.entry_start, policy.entry_end).to_numpy()
            & (minutes.to_numpy() < flatten) & np.isfinite(matrix).all(axis=1))


def generate_setup_labels(observations, candidate_mask, policy=None, progress=None):
    """Independently simulate each candidate, accepting just its own signal.

    No-fill and end-of-sample accounting closes are observable audit records,
    never training labels. label_end uses exit-bar close even for intrabar exits.
    """
    policy = policy or ResearchPolicy()
    records = []
    indices = np.flatnonzero(candidate_mask)
    for offset, index in enumerate(indices):
        # A filled trade must close by timeout's next open; avoid walking all
        # later sessions after this independent outcome is already determined.
        subset = observations.iloc[:min(len(observations), int(index)+policy.timeout_bars+3)]
        mask = np.zeros(len(subset), dtype=bool)
        mask[index] = True
        result = backtest_long_flat(subset, policy, start_index=int(index), entry_mask=mask)
        record = {"signal_index": int(index), "time": observations.time.iloc[index].isoformat(),
                  "decision_time": (observations.time.iloc[index]+pd.Timedelta(minutes=15)).isoformat(),
                  "status": "no_fill", "entry": None, "net_pnl": None,
                  "outcome_net_bps": None, "label_end": None,
                  "exit_reason": None, "skipped_entries": result["skipped_entries"]}
        if result["trades"]:
            trade = result["trades"][0]
            record.update(entry=trade["entry"], net_pnl=trade["net_pnl"],
                          exit_reason=trade["reason"],
                          label_end=(pd.Timestamp(trade["exit_bar"])+pd.Timedelta(minutes=15)).isoformat())
            if trade["reason"] == "end_of_sample":
                record["status"] = "incomplete"
            else:
                record.update(status="complete", outcome_net_bps=trade["net_pnl"]/trade["entry"]*10000)
        records.append(record)
        if progress and ((offset+1) % 25 == 0 or offset+1 == len(indices)):
            progress(f"Completed setup labels: {offset+1}/{len(indices)}")
    return records


def select_training_labels(labels, boundary):
    """Freeze signals before boundary and purge outcomes ending at/after it."""
    boundary = _timestamp(boundary)
    historical = [row for row in labels if _timestamp(row["time"]) < boundary and row["status"] == "complete"]
    accepted = [row for row in historical if _timestamp(row["label_end"]) < boundary]
    return accepted, len(historical)-len(accepted)


def _fly_transform(matrix, input_mean, input_scale, simulator, cache):
    # Cache identity includes graph, fitted scaler and all six normalized inputs.
    normalized = np.clip((matrix[:, :6]-input_mean)/input_scale, -3, 3)
    scaler_hash = _hash([input_mean.tolist(), input_scale.tolist()])
    keys = [(str(simulator.graph_hash), scaler_hash, row.tobytes()) for row in normalized]
    missing = {}
    for index, key in enumerate(keys):
        if key not in cache:
            missing.setdefault(key, index)
    if missing:
        values = np.asarray(simulator.transform(normalized[list(missing.values())]), dtype=float)
        if values.shape != (len(missing), 32):
            raise ValueError("FlyFeatures must return exactly 32 pooled outputs from six market inputs")
        cache.update(zip(missing, values))
    return np.asarray([cache[key] for key in keys], dtype=float).reshape(len(keys), 32)


def fit_setup_models(matrix, training_labels, simulator, cache=None):
    """Fit both fixed ridge readouts on exactly the same historical outcomes."""
    if len(training_labels) < MIN_TRAINING_SETUPS:
        return {"status": "cannot_fit", "reason": "Fewer than 10 completed historical training setups",
                "training_setups": len(training_labels), "graph_hash": None}
    cache = {} if cache is None else cache
    indices = [row["signal_index"] for row in training_labels]
    x = matrix[indices]
    y = np.asarray([row["outcome_net_bps"] for row in training_labels], dtype=float)
    if not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError("Training inputs and completed outcomes must be finite")
    simple = fit_ridge(x, y, penalty=PENALTY)
    input_mean, input_scale = simple[0][:6].copy(), simple[1][:6].copy()
    pooled = _fly_transform(x, input_mean, input_scale, simulator, cache)
    if not np.isfinite(pooled).all():
        raise ValueError("Fly training readouts must be finite")
    fly = fit_ridge(np.column_stack((pooled, x[:, 6:])), y, penalty=PENALTY)
    return {"status": "fitted", "reason": "Frozen historical setup-outcome fit",
            "training_setups": len(indices), "training_indices": indices,
            "input_mean": input_mean, "input_scale": input_scale,
            "simple": simple, "fly": fly, "graph_hash": str(simulator.graph_hash)}


def score_setups(matrix, fitted, simulator=None, cache=None):
    """Use features alone; uniformly veto missing/nonfinite or >6std inputs."""
    scores = {"simple": np.full(len(matrix), np.nan), "fly": np.full(len(matrix), np.nan)}
    accepted = {arm: np.zeros(len(matrix), dtype=bool) for arm in ("simple", "fly")}
    reasons = np.full(len(matrix), "cannot_fit", dtype=object)
    if fitted["status"] != "fitted":
        return scores, accepted, reasons
    finite = np.isfinite(matrix).all(axis=1)
    reasons[:] = "missing_or_nonfinite_features"
    z = (matrix-fitted["simple"][0])/fitted["simple"][1]
    distribution_ok = finite & (np.abs(z) <= 6).all(axis=1)
    reasons[finite & ~distribution_ok] = "outside_training_distribution"
    indices = np.flatnonzero(distribution_ok)
    if len(indices):
        pooled = _fly_transform(matrix[indices], fitted["input_mean"], fitted["input_scale"],
                                simulator, {} if cache is None else cache)
        valid = np.isfinite(pooled).all(axis=1)
        reasons[indices[~valid]] = "missing_or_nonfinite_fly_readout"
        good = indices[valid]
        scores["simple"][good] = predict(matrix[good], fitted["simple"])
        scores["fly"][good] = predict(np.column_stack((pooled[valid], matrix[good, 6:])), fitted["fly"])
        both_finite = np.isfinite(scores["simple"][good]) & np.isfinite(scores["fly"][good])
        bad = good[~both_finite]
        scores["simple"][bad] = scores["fly"][bad] = np.nan
        reasons[bad] = "nonfinite_prediction"
        reasons[good[both_finite]] = "scored_frozen_model"
        for arm in accepted:
            accepted[arm] = np.isfinite(scores[arm]) & (scores[arm] > THRESHOLD_NET_BPS)
    return scores, accepted, reasons


def _model_audit(fitted):
    result = {key: value for key, value in fitted.items() if key not in {"simple", "fly", "input_mean", "input_scale"}}
    if fitted["status"] == "fitted":
        result.update(input_mean=fitted["input_mean"].tolist(), input_scale=fitted["input_scale"].tolist())
        for arm in ("simple", "fly"):
            mean, scale, coef, intercept = fitted[arm]
            result[arm] = {"mean": mean.tolist(), "scale": scale.tolist(), "coef": coef.tolist(),
                           "intercept": float(intercept)}
        result["scaler_sha256"] = _hash([result["input_mean"], result["input_scale"], result["simple"]["mean"], result["simple"]["scale"]])
        result["coefficients_sha256"] = _hash([result["simple"], result["fly"]])
    return result


def _empty_metrics():
    return {"net_pnl": 0.0, "return_pct": 0.0, "max_drawdown_pct": 0.0,
            "trade_count": 0, "order_sides": 0, "bars": 0, "curve": [],
            "fills": [], "trades": [], "skipped_entries": {}, "exposure_pct": 0.0,
            "win_rate_pct": None, "ambiguous_stop_target_bars": 0}


def _bounded(values, limit):
    if len(values) <= limit:
        return values
    indices = np.linspace(0, len(values)-1, limit, dtype=int)
    return [values[i] for i in indices]


def _compact_metrics(metrics, curve=False):
    result = {}
    for arm, metric in metrics.items():
        result[arm] = {key: value for key, value in metric.items() if key not in {"curve", "fills", "trades"}}
        if curve:
            result[arm]["curve"] = _bounded(metric["curve"], 240)
    return result


def _number(value):
    return float(value) if value is not None and math.isfinite(float(value)) else None


def _evaluate_period(observations, matrix, candidates, labels, start, stop, policy,
                     simulator, cache, kind, boundary=None):
    boundary = _timestamp(boundary if boundary is not None else start)
    training, purged = select_training_labels(labels, boundary)
    fitted = fit_setup_models(matrix, training, simulator, cache)
    indices = np.flatnonzero((observations.time >= _timestamp(start)).to_numpy()
                             & (observations.time < _timestamp(stop)).to_numpy())
    chosen = indices[candidates[indices]]
    scores, accepts, reasons = score_setups(matrix[chosen], fitted, simulator, cache)
    masks = {"sats": candidates.copy(), "simple": np.zeros(len(matrix), dtype=bool),
             "fly": np.zeros(len(matrix), dtype=bool)}
    for arm in accepts:
        masks[arm][chosen] = accepts[arm]
    metrics = {arm: _empty_metrics() for arm in ARMS}
    if len(indices):
        subset = observations.iloc[indices].reset_index(drop=True)
        metrics = {arm: backtest_long_flat(subset, policy, entry_mask=masks[arm][indices]) for arm in ARMS}
    outcomes = {row["signal_index"]: row for row in labels}
    decisions = []
    for offset, index in enumerate(chosen):
        row = observations.iloc[index]
        decisions.append({"time": row.time.isoformat(), "decision_time": (row.time+pd.Timedelta(minutes=15)).isoformat(),
                          "price": float(row.close), "tqi": float(row.tqi),
                          "atr_ratio": float(matrix[index, 8]), "line_distance_atr": float(matrix[index, 10]),
                          "simple_net_bps": _number(scores["simple"][offset]),
                          "fly_net_bps": _number(scores["fly"][offset]),
                          "simple_accept": bool(accepts["simple"][offset]), "fly_accept": bool(accepts["fly"][offset]),
                          "outcome_net_bps": outcomes[index]["outcome_net_bps"],
                          "outcome_status": outcomes[index]["status"], "label_end": outcomes[index]["label_end"],
                          "reason": str(reasons[offset]), "evaluation_kind": kind})
    return {"kind": kind, "train_end": (boundary-pd.Timedelta(nanoseconds=1)).isoformat(),
            "test_start": _timestamp(start).isoformat(), "test_end": _timestamp(stop).isoformat(),
            "training_setups": len(training), "purged": purged, "metrics": metrics,
            "model": _model_audit(fitted), "decisions": decisions,
            "training_labels": training}, fitted


def evaluate_learning(frame, config=None, policy=None, data_info=None,
                      fresh_start=FRESH_START, end=None, history_only=False,
                      simulator_factory=None, progress=None):
    """Return (page report, full audit), without filesystem or trading effects.

    Historical 60%/10% expanding-session folds are exploration on inspected
    history. Fresh fits freeze before fresh_start and use no fresh outcomes,
    prices or volume for fitting/scaling. end is the last allowed bar-close UTC
    boundary. simulator_factory is an injectable zero-argument FlyFeatures
    constructor for deterministic unit tests; production uses the real graph.
    """
    cfg, policy = config or SatsConfig(), policy or ResearchPolicy()
    if policy != ResearchPolicy() or cfg != SatsConfig():
        raise ValueError("SATS learning uses the fixed default indicator and afternoon TP3 execution policy")
    boundary = _timestamp(fresh_start)
    if boundary < _timestamp(FRESH_START):
        raise ValueError("Fresh start cannot precede September 25: earlier data was already inspected")
    frame = frame.copy().reset_index(drop=True)
    frame["time"] = pd.to_datetime(frame.time, utc=True)
    if end is not None:
        end = _timestamp(end)
        frame = frame.loc[frame.time+pd.Timedelta(minutes=15) <= end].reset_index(drop=True)
    if frame.empty:
        raise ValueError("No completed observations before the configured end")
    if not frame.time.is_monotonic_increasing or frame.time.duplicated().any():
        raise ValueError("Learning observations must be ordered unique bars")
    observations = calculate_sats(frame, cfg)
    matrix = build_feature_matrix(frame, observations)
    candidates = eligible_setups(observations, matrix, policy)
    if progress:
        progress(f"Labeling {int(candidates.sum())} independent eligible SATS buy setups with the common simulator")
    labels = generate_setup_labels(observations, candidates, policy, progress)
    historical = observations.loc[observations.time < boundary]
    days = historical.time.dt.tz_convert("America/New_York").dt.strftime("%Y-%m-%d")
    sessions = list(days.unique())
    periods = []
    if len(sessions) >= 10:
        initial, chunk = max(1, int(len(sessions)*.6)), max(1, int(math.ceil(len(sessions)*.1)))
        for first in range(initial, len(sessions), chunk):
            last = min(len(sessions), first+chunk)
            start = historical.loc[days.eq(sessions[first]), "time"].iloc[0]
            stop = (historical.loc[days.eq(sessions[last]), "time"].iloc[0] if last < len(sessions)
                    else min(boundary, historical.time.iloc[-1]+pd.Timedelta(minutes=15)))
            periods.append((start, stop))
    evaluation_end = end if end is not None else observations.time.iloc[-1]+pd.Timedelta(minutes=15)
    if history_only:
        if not periods:
            raise ValueError("Historical exploration needs at least 10 pre-fresh sessions")
        primary_start, primary_end = periods[-1]
    else:
        primary_start, primary_end = boundary, max(boundary, evaluation_end)
    all_boundaries = [start for start, _ in periods]+[primary_start]
    needs_fit = any(len(select_training_labels(labels, start)[0]) >= MIN_TRAINING_SETUPS for start in all_boundaries)
    simulator = (simulator_factory or FlyFeatures)() if needs_fit else None
    cache, folds = {}, []
    for start, stop in periods:
        if progress:
            progress(f"Historical exploration: {start.isoformat()} to {stop.isoformat()}")
        fold, _ = _evaluate_period(observations, matrix, candidates, labels, start, stop,
                                   policy, simulator, cache, "historical")
        folds.append(fold)
    kind = "historical_only" if history_only else "fresh"
    primary, fitted = _evaluate_period(observations, matrix, candidates, labels, primary_start, primary_end,
                                       policy, simulator, cache, kind)
    last_index = int(np.flatnonzero((observations.time < _timestamp(primary_end)).to_numpy())[-1])
    latest_row = observations.iloc[last_index]
    latest_eligible = bool(candidates[last_index] and latest_row.time >= _timestamp(primary_start))
    if latest_eligible:
        latest_scores, latest_accepts, latest_reasons = score_setups(matrix[[last_index]], fitted, simulator, cache)
    else:
        latest_scores = {arm: [None] for arm in ("simple", "fly")}
        latest_accepts = {arm: [False] for arm in ("simple", "fly")}
        latest_reasons = ["scored_frozen_model"]
    latest_reason = ("No fresh bars after the frozen training boundary" if kind == "fresh" and latest_row.time < boundary
                     else str(latest_reasons[0]) if latest_reasons[0] != "scored_frozen_model"
                     else "Confirmed buy evaluated by frozen setup models" if latest_eligible
                     else "Waiting for an eligible confirmed buy; common SATS exit rules remain active")
    training = primary["training_labels"]
    settings = {"indicator": asdict(cfg), "execution": {**asdict(policy), "entry_clock_timezone": "America/New_York"},
                "learning": {"penalty": PENALTY, "threshold_net_bps": THRESHOLD_NET_BPS,
                             "min_training_setups": MIN_TRAINING_SETUPS, "distribution_limit_std": 6,
                             "fly_input_clip_std": 3, "target": "net_pnl / filled_entry_price * 10000"}}
    info = deepcopy(data_info or {})
    info.update(source=info.get("source", "User CSV"), rows=len(frame),
                first=observations.time.iloc[0].isoformat(), last=observations.time.iloc[-1].isoformat())
    info.setdefault("sha256", hashlib.sha256(frame.to_csv(index=False).encode()).hexdigest())
    training_data_sha256 = hashlib.sha256(frame.loc[frame.time < _timestamp(primary_start)].to_csv(index=False).encode()).hexdigest()
    model_id = _hash({"settings": settings, "model": primary["model"], "training_data_sha256": training_data_sha256,
                      "training_boundary": _timestamp(primary_start).isoformat(),
                      "simple_features": SIMPLE_FEATURES, "fly_features": FLY_FEATURES})[:16]
    checks = {"fit_available": fitted["status"] == "fitted", "at_least_10_training_setups": len(training) >= 10,
              "training_labels_end_before_evaluation": all(_timestamp(row["label_end"]) < _timestamp(primary_start) for row in training),
              "six_market_inputs_preserved": len(FEATURES) == 6, "no_fresh_parameter_tuning": True,
              "at_least_10_fresh_order_sides": kind == "fresh" and primary["metrics"]["fly"]["order_sides"] >= 10,
              "positive_fresh_fly_after_costs": kind == "fresh" and primary["metrics"]["fly"]["net_pnl"] > 0,
              "pine_parity_verified": False, "forward_test_verified": False, "execution_adapter_verified": False}
    report = {"schema": 3, "strategy": "sats-learning", "symbol": SYMBOL, "timeframe": "15Min",
              "paper_ready": False, "model_id": model_id, "created_at": datetime.now(timezone.utc).isoformat(),
              "attribution": "SATS indicator by WillyAlgoTrader; owner-supplied Pine v1.12.0. FlyWire v630 reduced LIF feature circuit, adapted from Shiu/Spiller.",
              "checks": checks, "cost_bps_per_side": policy.cost_bps, "settings": settings, "data": info,
              "features": {"simple": SIMPLE_FEATURES, "fly": FLY_FEATURES, "fly_inputs": list(FEATURES)},
              "training": {"start": training[0]["time"] if training else None,
                           "end": max((row["label_end"] for row in training), key=_timestamp) if training else None,
                           "setups": len(training), "purged": primary["purged"], "status": fitted["status"],
                           "reason": fitted["reason"], "data_sha256": training_data_sha256, "model": primary["model"]},
              "evaluation": {"kind": kind, "start": _timestamp(primary_start).isoformat(),
                             "end": _timestamp(primary_end).isoformat(), "previously_inspected_through": INSPECTED_THROUGH,
                             "fresh_training_cutoff": boundary.isoformat(), "starts_flat": True},
              "metrics": primary["metrics"],
              "folds": [{key: value for key, value in fold.items() if key not in {"decisions", "training_labels", "metrics"}}
                        | {"metrics": _compact_metrics(fold["metrics"])} for fold in folds],
              "decisions": primary["decisions"],
              "latest": {"bar_time": latest_row.time.isoformat(), "signal": latest_row.signal,
                         "reason": latest_reason, "simple_net_bps": _number(latest_scores["simple"][0]),
                         "fly_net_bps": _number(latest_scores["fly"][0]),
                         "simple_accept": latest_eligible and bool(latest_accepts["simple"][0]),
                         "fly_accept": latest_eligible and bool(latest_accepts["fly"][0])},
              "limitations": [
                  "Research only; this report cannot authorize, publish or execute orders. Readiness always remains false.",
                  "Historical expanding-window folds explore data already inspected through September 24, 2026; they are not untouched tests.",
                  "Fresh data begins September 25, 2026. Fixed penalty 10 and prediction above zero net basis points; no fresh-period tuning.",
                  "Independent completed setup labels include both assumed 5bps sides; no-fill and incomplete final accounting exits never train a model.",
                  "Training labels ending at or after an evaluation boundary are purged. Both arms use the same eligible historical setups.",
                  "Simple uses six market inputs plus SATS diagnostics. Fly uses their existing six-input mapping and 32 pooled readouts plus the same SATS diagnostics; dimensions differ.",
                  "All three arms share feature availability and dates. Learned arms also share a finite-input and six-standard-deviation guard; direct SATS does not use that learned distribution guard.",
                  "The common one-share simulator starts each evaluation flat, uses next-open buys, afternoon entries, TP3, stops, opposite flips and scheduled flattening.",
                  "Stops beat targets on ambiguous bars; gap exits and next-open fills are research assumptions. End-of-sample exits are accounting only.",
                  "IEX-only OHLCV, sparse fresh samples and assumed costs do not establish achievable fills or a trading advantage.",
                  "Pine numerical parity and the Worker/GitHub execution adapter remain unverified; neither live runner nor its original model is changed."]}
    audit = deepcopy(report)
    exclusions = []
    for index in np.flatnonzero(observations.signal.eq("buy").to_numpy() & ~candidates):
        row = observations.iloc[index]
        eastern = row.time.tz_convert("America/New_York")
        minute = eastern.hour*60+eastern.minute
        reason = ("indicator_warmup" if not row.warmed_up else
                  "outside_entry_window" if not policy.entry_start <= minute <= policy.entry_end else
                  "early_close_session" if eastern.strftime("%Y-%m-%d") in EARLY_CLOSES and minute >= 750 else
                  "invalid_atr" if not math.isfinite(float(row.atr)) or row.atr <= 0 else
                  "missing_contiguous_or_nonfinite_features")
        exclusions.append({"time": row.time.isoformat(), "reason": reason})
    audit.update(labels=labels, historical_folds=folds, primary=primary,
                 excluded_buy_setups=exclusions,
                 feature_availability={"eligible_buy_setups": int(candidates.sum()),
                                       "buy_signals": int(observations.signal.eq("buy").sum()),
                                       "missing_or_nonfinite_feature_rows": int((~np.isfinite(matrix).all(axis=1)).sum())})
    report["metrics"] = _compact_metrics(primary["metrics"], curve=True)
    report["decisions"] = _bounded(primary["decisions"], 300)
    return report, audit


def main():
    parser = argparse.ArgumentParser(description="Offline fixed-policy SATS outcome learning; no publishing or trading")
    parser.add_argument("--csv", type=Path, default=RUNTIME/"bars.csv")
    parser.add_argument("--metadata", type=Path, default=RUNTIME/"data.json")
    parser.add_argument("--fresh-start", default=FRESH_START)
    parser.add_argument("--end", help="Last allowed completed bar-close boundary with explicit UTC offset")
    parser.add_argument("--history-only", action="store_true")
    args = parser.parse_args()
    info = json.loads(args.metadata.read_text(encoding="utf-8"))
    if info.get("symbol") != SYMBOL or info.get("timeframe", "15Min") != "15Min":
        parser.error("Input metadata must identify MU 15-minute bars")
    info["sha256"] = hashlib.sha256(args.csv.read_bytes()).hexdigest()
    frame = clean_bars(pd.read_csv(args.csv), require_offset=True)
    try:
        report, audit = evaluate_learning(frame, data_info=info, fresh_start=args.fresh_start,
                                          end=args.end, history_only=args.history_only, progress=print)
    except ValueError as error:
        parser.error(str(error))
    folder = RUNTIME/"sats-learning"
    folder.mkdir(parents=True, exist_ok=True)
    atomic_json(folder/"audit.json", audit)
    atomic_json(folder/"evaluation.json", report)
    model = audit["primary"]["model"]
    stored = {"model_id": report["model_id"], "status": model["status"],
              "graph_hash": model["graph_hash"] or "", "penalty": PENALTY,
              "threshold_net_bps": THRESHOLD_NET_BPS,
              "feature_names": np.asarray(FEATURES), "simple_feature_names": np.asarray(SIMPLE_FEATURES),
              "fly_feature_names": np.asarray(FLY_FEATURES),
              "settings_json": json.dumps(report["settings"], sort_keys=True),
              "training_start": report["training"]["start"] or "",
              "training_end": report["training"]["end"] or "",
              "training_boundary": report["evaluation"]["start"],
              "training_data_sha256": report["training"]["data_sha256"],
              "data_sha256": report["data"]["sha256"],
              "training_indices": np.asarray(model.get("training_indices", []), dtype=np.int64)}
    if model["status"] == "fitted":
        stored.update(input_mean=np.asarray(model["input_mean"]), input_scale=np.asarray(model["input_scale"]),
                      scaler_sha256=model["scaler_sha256"], coefficients_sha256=model["coefficients_sha256"])
        for arm in ("simple", "fly"):
            stored.update({f"{arm}_{key}": np.asarray(value) for key, value in model[arm].items()})
    np.savez_compressed(folder/"models.npz", **stored)
    decisions = [row for fold in audit["historical_folds"] for row in fold["decisions"]]+audit["primary"]["decisions"]
    pd.DataFrame(decisions, columns=["time", "decision_time", "price", "tqi", "atr_ratio", "line_distance_atr",
                                   "simple_net_bps", "fly_net_bps", "simple_accept", "fly_accept", "outcome_net_bps",
                                   "outcome_status", "label_end", "reason", "evaluation_kind"]).to_csv(folder/"decisions.csv", index=False)
    print(json.dumps({"strategy": report["strategy"], "evaluation": report["evaluation"],
                      "training": {key: value for key, value in report["training"].items() if key != "model"},
                      "metrics": _compact_metrics(report["metrics"]), "paper_ready": False,
                      "report": "runtime/sats-learning/evaluation.json"}, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
