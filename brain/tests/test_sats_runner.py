"""Frozen observation tests. Synthetic fixtures are never market results."""
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from joyeb_brain.data import FEATURES, clean_bars
from joyeb_brain.sats import calculate_sats
from joyeb_brain.sats_learning import (FLY_FEATURES, SIMPLE_FEATURES, PENALTY, THRESHOLD_NET_BPS,
                                     build_feature_matrix, evaluate_learning, score_setups)
from joyeb_brain.sats_runner import SatsPredictor


def fixture_sessions(start="2026-08-10", end="2026-10-02"):
    frames = []
    for number, day in enumerate(pd.bdate_range(start, end)):
        index = np.arange(26)
        close = 200.+number+np.floor(index/3)
        frames.append(pd.DataFrame({"time": pd.date_range(day.strftime("%Y-%m-%d")+"T13:30:00Z", periods=26, freq="15min"),
                                   "open": close, "high": close+.5, "low": close-.5,
                                   "close": close, "volume": 1000+index*10+number}))
    return clean_bars(pd.concat(frames, ignore_index=True), now="2026-10-10T00:00:00Z")


def fixture_setups(frame, _config=None):
    """Known causal flips for isolating the frozen scoring path."""
    result = frame.copy().reset_index(drop=True)
    minute = result.time.dt.hour*60+result.time.dt.minute
    result["signal"] = np.where(minute.eq(17*60+15), "buy", "hold")
    for key, value in {"warmed_up": True, "atr": 2., "tqi": .8, "trend": 1,
                       "vol_ratio": 1.1, "er": .5}.items():
        result[key] = value
    result["line"] = result.close-.5
    result["stop"] = result.close-3
    for target in ("tp1", "tp2", "tp3"):
        result[target] = result.close+.3
    return result


class TestFly:
    """Deterministic injected output; does not import or run Brian2."""
    def __init__(self, graph_hash):
        self.graph_hash = graph_hash
        self.inputs = []

    def transform(self, rows):
        self.inputs.append(np.asarray(rows).copy())
        return np.tile(np.abs(rows), (1, 6))[:, :32]


def make_fixture(folder):
    frame = fixture_sessions()
    seed = frame.to_csv(index=False).encode()
    source = {"source": "Synthetic unit-test fixture, not market data", "symbol": "MU", "timeframe": "15Min",
              "rows": len(frame), "first": frame.time.iloc[0].isoformat(), "last": frame.time.iloc[-1].isoformat(),
              "sha256": sha256(seed).hexdigest()}
    graph_bytes = BytesIO()
    np.savez_compressed(graph_bytes, ids=np.arange(512, dtype=np.int64),
                        pre=np.arange(12, dtype=np.int32), post=np.arange(12, 24, dtype=np.int32),
                        weight=np.ones(12))
    graph = graph_bytes.getvalue()
    graph_hash = sha256(graph).hexdigest()
    factory = lambda: TestFly(graph_hash)
    with patch("joyeb_brain.sats_learning.calculate_sats", fixture_setups):
        report, _ = evaluate_learning(frame, data_info=source, end="2026-10-02T20:00:00Z", simulator_factory=factory)
    fitted = report["training"]["model"]
    arrays = {"model_id": report["model_id"], "status": fitted["status"], "graph_hash": graph_hash,
              "penalty": PENALTY, "threshold_net_bps": THRESHOLD_NET_BPS,
              "feature_names": np.asarray(FEATURES), "simple_feature_names": np.asarray(SIMPLE_FEATURES),
              "fly_feature_names": np.asarray(FLY_FEATURES), "settings_json": json.dumps(report["settings"], sort_keys=True),
              "training_start": report["training"]["start"], "training_end": report["training"]["end"],
              "training_boundary": report["evaluation"]["start"], "training_data_sha256": report["training"]["data_sha256"],
              "data_sha256": source["sha256"], "training_indices": np.asarray(fitted["training_indices"], dtype=np.int64),
              "input_mean": np.asarray(fitted["input_mean"]), "input_scale": np.asarray(fitted["input_scale"]),
              "scaler_sha256": fitted["scaler_sha256"], "coefficients_sha256": fitted["coefficients_sha256"]}
    for arm in ("simple", "fly"):
        arrays.update({f"{arm}_{key}": np.asarray(value) for key, value in fitted[arm].items()})
    np.savez_compressed(folder/"models.npz", **arrays)
    (folder/"evaluation.json").write_text(json.dumps(report, allow_nan=False), encoding="utf-8")
    (folder/"seed.csv").write_bytes(seed)
    (folder/"data.json").write_text(json.dumps(source), encoding="utf-8")
    (folder/"graph.npz").write_bytes(graph)
    (folder/"graph.json").write_text(json.dumps({"graph_sha256": graph_hash, "neurons": 512,
                                               "connection_rows": 12, "input_neurons": 12, "readout_groups": 32}), encoding="utf-8")
    return frame, report, arrays, factory


class SatsRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = tempfile.TemporaryDirectory()
        cls.fixture = Path(cls.saved.name)
        cls.frame, cls.report, cls.arrays, factory = make_fixture(cls.fixture)
        cls.factory = staticmethod(factory)
        cls.original = {path.name: path.read_bytes() for path in cls.fixture.iterdir()}

    @classmethod
    def tearDownClass(cls):
        cls.saved.cleanup()

    def setUp(self):
        self.folder_context = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder_context.cleanup)
        self.folder = Path(self.folder_context.name)
        for name, raw in self.original.items():
            (self.folder/name).write_bytes(raw)

    def predictor(self):
        return SatsPredictor(self.folder, simulator_factory=self.factory)

    def save_model(self, **changes):
        np.savez_compressed(self.folder/"models.npz", **(self.arrays | changes))

    def test_missing_snapshot_fails_before_opening_a_simulator(self):
        (self.folder/"seed.csv").unlink()
        with self.assertRaisesRegex(ValueError, "incomplete"), patch("joyeb_brain.sats_runner.FlyFeatures") as fly:
            SatsPredictor(self.folder)
        fly.assert_not_called()

    def test_invalid_scales_shapes_nan_and_feature_order_fail(self):
        invalid = [{"input_scale": np.zeros(6)}, {"simple_scale": -np.ones(12)},
                   {"fly_coef": np.zeros(37)}, {"simple_coef": np.full(12, np.nan)},
                   {"feature_names": np.asarray(FEATURES[::-1])},
                   {"training_indices": np.zeros(len(self.arrays["training_indices"]), dtype=int)},
                   {"simple_intercept": np.asarray([0.])}]
        for change in invalid:
            with self.subTest(field=next(iter(change))):
                self.save_model(**change)
                with self.assertRaises(ValueError):
                    self.predictor()

    def test_pickle_object_arrays_are_rejected(self):
        self.save_model(simple_mean=np.asarray([{}]*12, dtype=object))
        with self.assertRaises(ValueError):
            self.predictor()

    def test_frozen_model_identity_and_seed_hash_must_match(self):
        for name in ("model_id", "graph_hash", "scaler_sha256", "coefficients_sha256", "training_data_sha256", "data_sha256"):
            with self.subTest(name=name):
                self.save_model(**{name: "0"*len(str(self.arrays[name]))})
                with self.assertRaises(ValueError):
                    self.predictor()
        self.save_model()
        (self.folder/"seed.csv").write_bytes(self.original["seed.csv"]+b"\n")
        with self.assertRaisesRegex(ValueError, "hash"):
            self.predictor()

    def test_metadata_and_settings_cannot_enable_paper_or_change_policy(self):
        for mutate in (lambda r: r.update(paper_ready=True),
                       lambda r: r["settings"]["learning"].update(threshold_net_bps=-1),
                       lambda r: r["evaluation"].update(kind="historical_only"),
                       lambda r: r["evaluation"].update(fresh_training_cutoff="2026-09-26T04:00:00Z")):
            report = deepcopy(self.report)
            mutate(report)
            (self.folder/"evaluation.json").write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaises(ValueError):
                self.predictor()

    def test_injected_simulator_must_match_the_frozen_graph(self):
        with self.assertRaisesRegex(ValueError, "simulator graph"):
            SatsPredictor(self.folder, simulator_factory=lambda: TestFly("0"*64))

    def test_fetch_interval_bridges_the_entire_seed_age_and_expires(self):
        predictor = self.predictor()
        self.assertEqual(predictor.fetch_days(predictor.seed_last), 7)
        self.assertEqual(predictor.fetch_days(predictor.seed_last+pd.Timedelta(days=20, seconds=1)), 23)
        self.assertEqual(predictor.fetch_days(predictor.seed_last+pd.Timedelta(days=363)), 365)
        with self.assertRaisesRegex(ValueError, "365-day"):
            predictor.fetch_days(predictor.seed_last+pd.Timedelta(days=364))
        with self.assertRaisesRegex(ValueError, "offset"):
            predictor.fetch_days("2026-10-05")

    def test_seed_revisions_are_ignored_and_full_history_is_used(self):
        predictor = self.predictor()
        fresh = fixture_sessions("2026-10-05", "2026-10-05")
        download = pd.concat((self.frame.tail(26), fresh), ignore_index=True)
        overlap = download.time <= predictor.seed_last
        download.loc[overlap, ["open", "high", "low", "close"]] *= 2
        before = predictor.seed.copy(deep=True)
        with patch("joyeb_brain.sats_runner.calculate_sats", wraps=calculate_sats) as calculate:
            signal = predictor.signal(download, now="2026-10-05T20:01:00Z")
        observed = calculate.call_args.args[0]
        self.assertEqual(len(observed), len(self.frame)+len(fresh))
        pd.testing.assert_frame_equal(observed.iloc[:len(before)].reset_index(drop=True), before.reset_index(drop=True))
        pd.testing.assert_frame_equal(predictor.seed, before)
        self.assertEqual(signal["bar_time"], "2026-10-05T19:45:00+00:00")

    def test_a_truncated_download_cannot_reset_recursive_indicator_history(self):
        predictor = self.predictor()
        fresh = fixture_sessions("2026-10-05", "2026-10-05")
        with self.assertRaisesRegex(ValueError, "bridge"):
            predictor.signal(fresh, now="2026-10-05T20:01:00Z")

    def test_current_frozen_predictions_and_acceptance_match_research_scoring(self):
        predictor = self.predictor()
        cutoff = pd.Timestamp("2026-10-02T17:31:00Z")
        with patch("joyeb_brain.sats_runner.calculate_sats", fixture_setups):
            signal = predictor.signal(self.frame, now=cutoff)
        completed = clean_bars(self.frame, now=cutoff, settle_seconds=60)
        observations = fixture_setups(completed)
        matrix = build_feature_matrix(completed, observations)
        scores, accepted, _ = score_setups(matrix[[-1]], predictor.fitted, predictor.simulator)
        self.assertTrue(signal["eligible_setup"])
        self.assertTrue(signal["distribution_ok"])
        for arm in ("simple", "fly"):
            self.assertAlmostEqual(signal[f"{arm}_net_bps"], scores[arm][0])
            self.assertEqual(signal[f"{arm}_accept"], bool(accepted[arm][0]))
            self.assertEqual(signal[f"{arm}_accept"], signal[f"{arm}_net_bps"] > 0)
        self.assertEqual(predictor.simulator.inputs[0].shape, (1, 6))
        self.assertLessEqual(np.abs(predictor.simulator.inputs[0]).max(), 3)
        self.assertTrue(predictor.observation_only)
        self.assertEqual(signal["target_position"], 0)
        self.assertIsNone(signal["predicted_return"])
        self.assertEqual(signal["training_boundary"], self.report["evaluation"]["fresh_training_cutoff"])
        self.assertEqual(signal["decision_time"], "2026-10-02T17:30:00+00:00")
        json.dumps(signal, allow_nan=False)

    def test_hold_sell_outside_window_and_before_boundary_never_score(self):
        def sell(frame, config=None):
            result = fixture_setups(frame, config)
            result.loc[result.index[-1], "signal"] = "sell"
            return result

        def morning_buy(frame, config=None):
            result = fixture_setups(frame, config)
            result.loc[result.index[-1], "signal"] = "buy"
            return result

        cases = [(fixture_setups, "2026-10-02T17:46:00Z"), (sell, "2026-10-02T17:31:00Z"),
                 (morning_buy, "2026-10-02T14:01:00Z"), (fixture_setups, "2026-09-24T17:31:00Z")]
        for indicator, cutoff in cases:
            predictor = self.predictor()
            with self.subTest(cutoff=cutoff, indicator=indicator.__name__), patch("joyeb_brain.sats_runner.calculate_sats", indicator):
                signal = predictor.signal(self.frame, now=cutoff)
                self.assertFalse(signal["eligible_setup"])
                self.assertFalse(signal["distribution_ok"])
                self.assertIsNone(signal["simple_net_bps"])
                self.assertIsNone(signal["fly_net_bps"])
                self.assertFalse(signal["simple_accept"])
                self.assertFalse(signal["fly_accept"])
                self.assertEqual(predictor.simulator.inputs, [])
                self.assertEqual(signal["target_position"], 0)

    def test_outside_training_distribution_fails_both_arms_together(self):
        predictor = self.predictor()
        def extreme(frame, observations):
            matrix = build_feature_matrix(frame, observations)
            matrix[-1, 0] = predictor.fitted["simple"][0][0]+7*predictor.fitted["simple"][1][0]
            return matrix
        with patch("joyeb_brain.sats_runner.calculate_sats", fixture_setups), patch("joyeb_brain.sats_runner.build_feature_matrix", extreme):
            signal = predictor.signal(self.frame, now="2026-10-02T17:31:00Z")
        self.assertTrue(signal["eligible_setup"])
        self.assertFalse(signal["distribution_ok"])
        self.assertEqual(signal["reason"], "outside_training_distribution")
        self.assertIsNone(signal["simple_net_bps"])
        self.assertIsNone(signal["fly_net_bps"])
        self.assertEqual(predictor.simulator.inputs, [])

    def test_future_and_unsettled_seed_rows_do_not_change_a_signal(self):
        predictor = self.predictor()
        cutoff = "2026-10-02T17:30:59Z"
        changed = self.frame.copy()
        future = changed.time >= pd.Timestamp("2026-10-02T17:15:00Z")
        changed.loc[future, ["open", "high", "low", "close"]] *= 100
        with patch("joyeb_brain.sats_runner.calculate_sats", fixture_setups):
            original = predictor.signal(self.frame, now=cutoff)
            modified = predictor.signal(changed, now=cutoff)
        self.assertEqual(original, modified)
        self.assertEqual(original["bar_time"], "2026-10-02T17:00:00+00:00")

    def test_real_indicator_prefix_is_causal_and_saved_artifacts_stay_unchanged(self):
        predictor = self.predictor()
        report_before = deepcopy(predictor.report)
        model_before = {name: value.copy() for name, value in predictor.model.items()}
        cutoff = "2026-10-02T17:31:00Z"
        full = predictor.signal(self.frame, now=cutoff)
        prefix = predictor.signal(self.frame.loc[self.frame.time <= pd.Timestamp("2026-10-02T17:15:00Z")], now=cutoff)
        self.assertEqual(full, prefix)
        self.assertEqual(predictor.report, report_before)
        for name, value in model_before.items():
            np.testing.assert_array_equal(predictor.model[name], value)
        self.assertEqual({path.name: path.read_bytes() for path in self.folder.iterdir()}, self.original)


if __name__ == "__main__":
    unittest.main()
