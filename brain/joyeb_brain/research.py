"""Chronological evaluation with next-open labels and a market-only baseline."""
import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .connectome import FlyFeatures, digest
from .data import FEATURES, PIPELINE_VERSION, RUNTIME, SYMBOL, atomic_json, clean_bars, features

COST = 0.0005  # illustrative 5 basis points per side, not an observed fill cost


def fit_ridge(x, y, penalty=10.0):
    mean, scale = x.mean(axis=0), x.std(axis=0)
    scale[scale < 1e-8] = 1
    z = (x - mean) / scale
    target_mean = float(y.mean())
    coef = np.linalg.solve(z.T @ z + penalty*np.eye(z.shape[1]), z.T @ (y - target_mean))
    return mean, scale, coef, target_mean


def predict(x, fitted):
    mean, scale, coef, intercept = fitted
    return ((x - mean) / scale) @ coef + intercept


def performance(prediction, frame, threshold):
    position = (np.asarray(prediction) > threshold).astype(float)
    previous = np.r_[0, position[:-1]]
    contiguous = frame.time.diff().eq(pd.Timedelta(minutes=15)).to_numpy()
    turnover = np.where(contiguous, abs(position - previous), position + previous)
    if len(turnover):
        turnover[-1] += position[-1]  # close the final position
    net = position * frame.target.to_numpy() - COST * turnover
    equity = np.cumprod(1 + net)
    peaks = np.maximum.accumulate(np.r_[1, equity])[1:]
    return {"return_pct": float((equity[-1]-1)*100),
            "max_drawdown_pct": float(np.min(equity/peaks-1)*100),
            "exposure_pct": float(position.mean()*100),
            "order_sides": int(turnover.sum()), "bars": len(frame),
            "curve": [{"time": t.isoformat(), "equity": round(float(e), 6)}
                      for t, e in zip(frame.target_end, equity)]}


def train(progress=print):
    bars = clean_bars(pd.read_csv(RUNTIME / "bars.csv"))
    samples = features(bars)
    if len(samples) < 90:
        raise ValueError(f"Only {len(samples)} usable samples; need at least 90. Collect more history or import a longer CSV.")
    n = len(samples)
    a, b = int(n*.6), int(n*.8)
    # Purge two decision rows so a training label cannot reach validation,
    # and a validation label cannot reach the untouched final test period.
    train_slice, val_slice, test_slice = slice(0, a-2), slice(a, b-2), slice(b, n)
    raw = samples[FEATURES].to_numpy(float)
    input_mean = raw[train_slice].mean(axis=0)
    input_scale = raw[train_slice].std(axis=0)
    input_scale[input_scale < 1e-8] = 1
    input_z = (raw-input_mean)/input_scale
    distribution_ok = (abs(input_z) <= 6).all(axis=1)
    normalized = np.clip(input_z, -3, 3)
    simulator = FlyFeatures()
    progress(f"Simulating {n} examples through {simulator.size} measured-connectome neurons...")
    neural = simulator.transform(normalized, lambda done, total: progress(f"Fly features: {done}/{total}"))
    y = samples.target.to_numpy()
    fly_fit = fit_ridge(neural[train_slice], y[train_slice])
    baseline_fit = fit_ridge(raw[train_slice], y[train_slice])
    reports = {}
    thresholds = {}
    for name, matrix, fitted in [("fly", neural, fly_fit), ("market_only", raw, baseline_fit)]:
        val_prediction = np.where(distribution_ok[val_slice], predict(matrix[val_slice], fitted), -np.inf)
        # Hyperparameters are chosen ONLY on validation, then frozen for test.
        threshold = max([0, .0002, .0005, .001, .002],
                        key=lambda t: performance(val_prediction, samples.iloc[val_slice], t)["return_pct"])
        thresholds[name] = threshold
        test_prediction = np.where(distribution_ok[test_slice], predict(matrix[test_slice], fitted), -np.inf)
        reports[name] = performance(test_prediction, samples.iloc[test_slice], threshold)
    reports["always_long"] = performance(np.ones(len(samples.iloc[test_slice])), samples.iloc[test_slice], 0)
    model = RUNTIME / "model.npz"
    np.savez_compressed(model, input_mean=input_mean, input_scale=input_scale,
                        mean=fly_fit[0], scale=fly_fit[1], coef=fly_fit[2], intercept=fly_fit[3],
                        threshold=thresholds["fly"], graph_hash=simulator.graph_hash,
                        pipeline_version=PIPELINE_VERSION,
                        feature_names=np.array(FEATURES))
    # Mechanical research gate, not evidence of future profitability. Small or
    # non-improving experiments remain observable but cannot enable orders.
    checks = {"at_least_100_test_bars": reports["fly"]["bars"] >= 100,
              "positive_after_assumed_costs": reports["fly"]["return_pct"] > 0,
              "beats_market_only": reports["fly"]["return_pct"] > reports["market_only"]["return_pct"],
              "at_least_10_order_sides": reports["fly"]["order_sides"] >= 10}
    graph = json.loads((RUNTIME / "graph.json").read_text())
    data_info = json.loads((RUNTIME / "data.json").read_text()) if (RUNTIME / "data.json").exists() else {"source": "User CSV"}
    report = {"schema": 1, "pipeline_version": PIPELINE_VERSION, "created_at": datetime.now(timezone.utc).isoformat(),
              "symbol": SYMBOL, "timeframe": "15Min", "model_id": digest(model)[:16],
              "graph": graph, "data": data_info, "samples": n,
              "split": {"train": a-2, "validation": b-a-2, "test": n-b,
                        "train_end": samples.time.iloc[a-3].isoformat(),
                        "validation_start": samples.time.iloc[a].isoformat(),
                        "test_start": samples.time.iloc[b].isoformat(),
                        "test_end": samples.target_end.iloc[-1].isoformat()},
              "cost_bps_per_side": COST*10000, "threshold": thresholds["fly"],
              "metrics": reports, "checks": checks, "paper_ready": all(checks.values()),
              "limitations": ["Experimental reduced circuit; market inputs are engineered.",
                              "IEX is one exchange; results are not consolidated-market fills.",
                              "Next-open fills and fixed costs are assumptions, not executed trades.",
                              "One chronological test is not proof of a trading advantage."]}
    atomic_json(RUNTIME / "evaluation.json", report)
    samples[["time", "target", "target_end"]].assign(predicted_return=predict(neural, fly_fit)).to_csv(RUNTIME / "predictions.csv", index=False)
    progress(f"Saved evaluation. Paper readiness: {report['paper_ready']} (see evaluation.json).")
    return report


class Predictor:
    def __init__(self):
        # Read everything now and close the file, so retraining while a runner is
        # up cannot break this process's later signals.
        with np.load(RUNTIME / "model.npz", allow_pickle=False) as stored:
            self.model = {name: stored[name] for name in stored.files}
        self.report = json.loads((RUNTIME / "evaluation.json").read_text())
        if self.report.get("symbol") != SYMBOL:
            raise ValueError(f"The saved model was trained on {self.report.get('symbol')}, not {SYMBOL}; collect and train before running")
        if str(self.model["pipeline_version"]) != PIPELINE_VERSION or self.report.get("pipeline_version") != PIPELINE_VERSION:
            raise ValueError("Pipeline changed; retrain before running")
        if list(self.model["feature_names"]) != FEATURES:
            raise ValueError("Feature schema changed; retrain before running")
        if digest(RUNTIME / "model.npz")[:16] != self.report["model_id"]:
            raise ValueError("Model/evaluation mismatch; retrain before running")
        self.simulator = FlyFeatures()
        if self.simulator.graph_hash != str(self.model["graph_hash"]):
            raise ValueError("Connectome changed; retrain before running")

    def signal(self, bars, now=None, settle_seconds=0, strict=True):
        cleaned = clean_bars(pd.DataFrame(bars), now=now, settle_seconds=settle_seconds, strict=strict)
        latest = cleaned.iloc[-1]
        base = {"bar_time": latest.time.isoformat(), "symbol": SYMBOL, "price": float(latest.close),
                "predicted_return": None, "target_position": 0, "distribution_ok": False,
                "active_readout_groups": 0, "model_id": self.report["model_id"]}
        eastern = latest.time.tz_convert("America/New_York")
        minute = eastern.hour*60 + eastern.minute
        # The research labels cover decisions at 13:15..15:15 ET. The 15:30
        # bar closes at 15:45, when the evaluated strategy becomes flat.
        if not 795 <= minute <= 915:
            return {**base, "reason": "Outside entry window; target flat"}
        samples = features(cleaned, training=False)
        if samples.empty or samples.time.iloc[-1] != latest.time:
            return {**base, "reason": "Missing contiguous feature window; target flat"}
        row = samples.iloc[-1]
        raw = row[FEATURES].to_numpy(float)
        neural = self.simulator.transform(np.clip((raw-self.model["input_mean"])/self.model["input_scale"], -3, 3)[None, :])
        forecast = float(predict(neural, (self.model["mean"], self.model["scale"], self.model["coef"], self.model["intercept"]))[0])
        # Out-of-distribution inputs are observable, but must not submit orders.
        distribution_ok = bool((abs((raw-self.model["input_mean"])/self.model["input_scale"]) <= 6).all())
        return {"bar_time": row.time.isoformat(), "symbol": SYMBOL, "price": float(row.close),
                "predicted_return": forecast, "target_position": int(distribution_ok and forecast > float(self.model["threshold"])),
                "distribution_ok": distribution_ok,
                "reason": "Model forecast" if distribution_ok else "Input outside training range; target flat",
                "active_readout_groups": int(np.count_nonzero(neural)),
                "model_id": self.report["model_id"]}
