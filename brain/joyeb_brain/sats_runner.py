"""Frozen SATS setup forecasts for observation, without order submission.

The saved seed is an immutable indicator prefix. Every job must bridge it to
the current completed bar; a short rolling download must never reset SATS's
recursive state. The saved ridge readouts and fly circuit never retrain here.
"""
from datetime import datetime, timezone
from io import BytesIO
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from .connectome import FlyFeatures
from .data import RUNTIME, SYMBOL, clean_bars
from .sats import SatsConfig, calculate_sats
from .sats_learning import build_feature_matrix, eligible_setups, score_setups
from .sats_research import ResearchPolicy

PIPELINE = "sats-setup-net-bps-v1"


class SatsPredictor:
    """Use a validated frozen learning snapshot; always return target flat."""

    observation_only = True

    def __init__(self, runtime=None, simulator_factory=None):
        # Shared bundle validation checks exact settings, feature schemas,
        # identities/hashes, positive scales and all finite model dimensions.
        from .deployment import SATS_FILES, validate_sats_files

        runtime = Path(runtime or RUNTIME / "sats-learning")
        try:
            files = {name: (runtime / name).read_bytes() for name in SATS_FILES}
        except OSError:
            raise ValueError("Frozen SATS snapshot is incomplete; restore all six saved artifacts") from None
        validate_sats_files(files)
        self.report = json.loads(files["evaluation.json"])
        with np.load(BytesIO(files["models.npz"]), allow_pickle=False) as stored:
            self.model = {name: stored[name].copy() for name in stored.files}
        self.seed = clean_bars(pd.read_csv(BytesIO(files["seed.csv"])),
                               now=pd.Timestamp(self.report["data"]["last"])+pd.Timedelta(minutes=15),
                               require_offset=True)
        self.seed_last = self.seed.time.iloc[-1]
        self.training_boundary = pd.Timestamp(str(self.model["training_boundary"])).tz_convert("UTC")
        self.fitted = {"status": "fitted", "graph_hash": str(self.model["graph_hash"]),
                       "input_mean": self.model["input_mean"], "input_scale": self.model["input_scale"]}
        for arm in ("simple", "fly"):
            self.fitted[arm] = tuple(self.model[f"{arm}_{key}"] for key in ("mean", "scale", "coef", "intercept"))
        # Opening Brian2 is deferred until validation succeeds. Tests inject a
        # zero-argument deterministic simulator rather than creating a graph.
        self.simulator = (simulator_factory() if simulator_factory is not None
                          else FlyFeatures(path=runtime / "graph.npz"))
        if str(self.simulator.graph_hash) != str(self.model["graph_hash"]):
            raise ValueError("Frozen SATS simulator graph does not match the saved readout")

    def fetch_days(self, now):
        """Fetch the entire post-seed interval, with two days of overlap."""
        stamp = pd.Timestamp(now)
        if stamp.tzinfo is None:
            raise ValueError("Observation time requires an explicit UTC offset")
        days = max(7, math.ceil((stamp.tz_convert("UTC")-self.seed_last).total_seconds()/86400)+2)
        if days > 365:
            raise ValueError("Frozen SATS seed is too old to bridge within the 365-day data limit; "
                             "restore a validated snapshot with updated seed history")
        return days

    def signal(self, bars, now=None, settle_seconds=60, strict=False):
        """Score only the latest eligible completed buy, with fixed readouts.

        Downloaded revisions to seed dates cannot alter the experiment. Future
        rows and unfinished bars are removed before causal indicator state is
        calculated. No fitted parameter, saved report or source file is changed.
        """
        now = now or datetime.now(timezone.utc)
        self.fetch_days(now)  # Fail even if called without the runner's fetch.
        downloaded = clean_bars(pd.DataFrame(bars), now=now,
                                settle_seconds=settle_seconds, strict=strict)
        newer = downloaded.loc[downloaded.time > self.seed_last]
        if not newer.empty and downloaded.time.iloc[0] > self.seed_last+pd.Timedelta(minutes=15):
            raise ValueError("Downloaded history does not bridge the frozen SATS seed; fetch the full post-seed interval")
        merged = pd.concat((self.seed, newer), ignore_index=True)
        completed = clean_bars(merged, now=now, settle_seconds=settle_seconds, strict=True)
        observations = calculate_sats(completed, SatsConfig())
        matrix = build_feature_matrix(completed, observations)
        row = observations.iloc[-1]
        eligible = bool(eligible_setups(observations, matrix, ResearchPolicy())[-1]
                        and row.time >= self.training_boundary)
        atr = float(row.atr)
        diagnostics = {"trend": int(row.trend), "tqi": float(row.tqi),
                       "atr_ratio": atr/float(row.close), "vol_ratio": float(row.vol_ratio),
                       "line_distance_atr": (float(row.close)-float(row.line))/atr if atr > 0 else 0.0,
                       "er": float(row.er)}
        if not all(math.isfinite(value) for value in diagnostics.values()):
            raise ValueError("SATS diagnostics are nonfinite; no observation can be published")
        signal = {"model_id": self.report["model_id"], "symbol": SYMBOL, "timeframe": "15Min",
                  "strategy": "sats-learning", "pipeline": PIPELINE,
                  "bar_time": row.time.isoformat(), "decision_time": (row.time+pd.Timedelta(minutes=15)).isoformat(),
                  "price": float(row.close), "target_position": 0, "predicted_return": None,
                  "distribution_ok": False, "active_readout_groups": 0,
                  "setup_signal": str(row.signal), "eligible_setup": eligible,
                  "simple_net_bps": None, "fly_net_bps": None, "simple_accept": False,
                  "fly_accept": False, "sats": diagnostics,
                  "training_boundary": self.training_boundary.isoformat(),
                  "reason": "Waiting for an eligible confirmed buy; frozen models were not scored"}
        if eligible:
            cache = {}
            scores, accepted, reasons = score_setups(matrix[[-1]], self.fitted, self.simulator, cache)
            signal["reason"] = str(reasons[0])
            signal["distribution_ok"] = reasons[0] == "scored_frozen_model"
            if signal["distribution_ok"]:
                signal.update(simple_net_bps=float(scores["simple"][0]), fly_net_bps=float(scores["fly"][0]),
                              simple_accept=bool(accepted["simple"][0]), fly_accept=bool(accepted["fly"][0]),
                              active_readout_groups=int(np.count_nonzero(next(iter(cache.values())))))
        json.dumps(signal, allow_nan=False)  # Enforce the existing publication transport contract.
        return signal
