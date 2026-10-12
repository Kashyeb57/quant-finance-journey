"""Causal setup-outcome learning tests; fixtures are never market results."""
from dataclasses import replace
import json
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from joyeb_brain.data import FEATURES
from joyeb_brain.sats import calculate_sats
from joyeb_brain.sats_research import ResearchPolicy, backtest_long_flat
from joyeb_brain.sats_learning import (FRESH_START, FLY_FEATURES, SATS_FEATURES, SIMPLE_FEATURES,
                                      _bounded, build_feature_matrix, evaluate_learning,
                                      fit_setup_models, generate_setup_labels, score_setups,
                                      select_training_labels)


class DeterministicFly:
    """Injectable test double: records input contract, no biological claim."""
    graph_hash = "test-only-graph"

    def __init__(self):
        self.inputs = []

    def transform(self, rows):
        self.inputs.append(np.asarray(rows).copy())
        return np.tile(rows, (1, 6))[:, :32]


def execution_rows(prices, signals=None, target=110.0):
    frame = pd.DataFrame({"time": pd.date_range("2026-09-01T17:15:00Z", periods=len(prices), freq="15min"),
                          "open": prices, "close": prices, "high": np.asarray(prices)+.01,
                          "low": np.asarray(prices)-.01, "signal": signals or ["buy"]+["hold"]*(len(prices)-1)})
    for key, value in {"warmed_up": True, "atr": 2., "tqi": .8, "stop": 95.,
                       "tp1": target, "tp2": target, "tp3": target}.items():
        frame[key] = value
    return frame


def sessions(start="2026-08-10", end="2026-09-29"):
    frames = []
    for day_number, day in enumerate(pd.bdate_range(start, end)):
        index = np.arange(26)
        close = 100+day_number*.1+.3*np.sin(index/3)+index*.01
        frames.append(pd.DataFrame({"time": pd.date_range(day.strftime("%Y-%m-%d")+"T13:30:00Z", periods=26, freq="15min"),
                                   "open": close-.01, "close": close, "high": close+.5, "low": close-.1,
                                   "volume": 1000+index*10+day_number}))
    return pd.concat(frames, ignore_index=True)


def known_setups(frame, _config=None):
    """Predetermined causal signals to isolate learner and common execution."""
    result = frame.copy().reset_index(drop=True)
    minutes = result.time.dt.hour*60+result.time.dt.minute
    result["signal"] = np.where(minutes.eq(17*60+15), "buy", "hold")
    for key, value in {"warmed_up": True, "atr": 2., "tqi": .8, "trend": 1,
                       "vol_ratio": 1.1, "er": .5}.items():
        result[key] = value
    result["line"] = result.close-.5
    result["stop"] = result.close-3
    for target in ("tp1", "tp2", "tp3"):
        result[target] = result.close+.3
    return result


def training_fixture():
    rng = np.random.default_rng(7)
    matrix = rng.normal(0, .4, (16, 12))
    labels = [{"signal_index": i, "outcome_net_bps": float(2+matrix[i, 0]*4)} for i in range(12)]
    return matrix, labels


class SharedSimulatorTests(unittest.TestCase):
    def test_all_true_mask_preserves_every_existing_fill_metric_and_exit(self):
        rows = execution_rows([100., 100., 110.])
        baseline = backtest_long_flat(rows)
        self.assertEqual(baseline, backtest_long_flat(rows, entry_mask=np.ones(len(rows), dtype=bool)))
        self.assertEqual(baseline["trades"][0]["label_end"], "2026-09-01T18:00:00+00:00")

    def test_masks_filter_only_entries_and_never_block_protective_exit(self):
        rows = execution_rows([100., 100., 94., 100.], ["buy", "hold", "buy", "hold"])
        baseline = backtest_long_flat(rows)
        gated = backtest_long_flat(rows, entry_mask=np.asarray([True, False, False, False]))
        self.assertEqual(gated["trades"][0], baseline["trades"][0])
        self.assertEqual(gated["trades"][0]["reason"], "stop")
        blocked = backtest_long_flat(rows, entry_mask=np.zeros(len(rows), dtype=bool))
        self.assertEqual(blocked["trade_count"], 0)
        self.assertEqual(blocked["order_sides"], 0)

    def test_bad_mask_types_shapes_and_lengths_are_rejected(self):
        rows = execution_rows([100., 100., 110.])
        for mask in ([True], [1, 1, 1], [[True], [True], [True]], [True, None, True]):
            with self.subTest(mask=mask), self.assertRaises(ValueError):
                backtest_long_flat(rows, entry_mask=mask)

    def test_independent_outcome_is_filled_entry_net_return_after_both_sides(self):
        rows = execution_rows([100., 100., 110.])
        label = generate_setup_labels(rows, [True, False, False])[0]
        self.assertEqual(label["status"], "complete")
        self.assertAlmostEqual(label["net_pnl"], 10-.05-.055)
        self.assertAlmostEqual(label["outcome_net_bps"], 989.5)
        self.assertEqual(label["label_end"], "2026-09-01T18:00:00+00:00")

    def test_small_gross_win_can_be_negative_after_costs(self):
        rows = execution_rows([100., 100., 100.05], target=100.05)
        label = generate_setup_labels(rows, [True, False, False])[0]
        self.assertLess(label["outcome_net_bps"], 0)

    def test_no_fill_and_incomplete_accounting_exit_have_no_training_outcome(self):
        incomplete = generate_setup_labels(execution_rows([100., 100., 103.]), [True, False, False])[0]
        no_fill = generate_setup_labels(execution_rows([100., 94., 103.]), [True, False, False])[0]
        self.assertEqual(incomplete["status"], "incomplete")
        self.assertEqual(no_fill["status"], "no_fill")
        self.assertIsNone(incomplete["outcome_net_bps"])
        self.assertIsNone(no_fill["outcome_net_bps"])

    def test_overlapping_buys_receive_independent_labels_from_the_same_rules(self):
        rows = execution_rows([100., 100., 101., 101., 110.], ["buy", "hold", "buy", "hold", "hold"])
        labels = generate_setup_labels(rows, [True, False, True, False, False])
        self.assertEqual(len(labels), 2)
        self.assertEqual([label["entry"] for label in labels], [100., 101.])
        self.assertEqual(backtest_long_flat(rows)["trade_count"], 1)


class FrozenLearningTests(unittest.TestCase):
    def test_label_end_at_the_boundary_is_purged(self):
        boundary = "2026-09-25T04:00:00Z"
        labels = [{"signal_index": index, "time": "2026-09-24T17:15:00Z", "status": "complete", "label_end": end}
                  for index, end in enumerate(["2026-09-24T18:00:00Z", boundary, "2026-09-25T04:15:00Z"])]
        labels.append({"signal_index": 3, "time": boundary, "status": "complete", "label_end": "2026-09-25T04:30:00Z"})
        chosen, purged = select_training_labels(labels, boundary)
        self.assertEqual([label["signal_index"] for label in chosen], [0])
        self.assertEqual(purged, 2)

    def test_scalers_fit_only_training_setups_and_fly_receives_exactly_six_clipped_inputs(self):
        matrix, labels = training_fixture()
        matrix[12:] = 1000000
        simulator = DeterministicFly()
        fitted = fit_setup_models(matrix, labels, simulator)
        np.testing.assert_allclose(fitted["input_mean"], matrix[:12, :6].mean(axis=0))
        np.testing.assert_allclose(fitted["input_scale"], matrix[:12, :6].std(axis=0))
        self.assertEqual(simulator.inputs[0].shape, (12, 6))
        self.assertLessEqual(np.abs(simulator.inputs[0]).max(), 3)
        self.assertEqual(len(fitted["simple"][2]), 12)
        self.assertEqual(len(fitted["fly"][2]), 38)
        self.assertEqual(SIMPLE_FEATURES[:6], FEATURES)
        self.assertEqual(SIMPLE_FEATURES[6:], SATS_FEATURES)
        self.assertEqual(FLY_FEATURES[32:], SATS_FEATURES)

    def test_nonfinite_and_six_standard_deviation_guard_veto_both_arms(self):
        matrix, labels = training_fixture()
        simulator = DeterministicFly()
        fitted = fit_setup_models(matrix, labels, simulator)
        inputs = matrix[:3].copy()
        inputs[0, 0] = np.nan
        inputs[1, 10] = fitted["simple"][0][10]+6.1*fitted["simple"][1][10]
        scores, accepts, reasons = score_setups(inputs, fitted, simulator)
        for arm in ("simple", "fly"):
            self.assertFalse(accepts[arm][:2].any())
            self.assertTrue(np.isnan(scores[arm][:2]).all())
        self.assertEqual(reasons[0], "missing_or_nonfinite_features")
        self.assertEqual(reasons[1], "outside_training_distribution")

    def test_zero_net_basis_point_prediction_rejects_the_setup(self):
        matrix, labels = training_fixture()
        for label in labels:
            label["outcome_net_bps"] = 0.
        simulator = DeterministicFly()
        fitted = fit_setup_models(matrix, labels, simulator)
        scores, accepts, _ = score_setups(matrix[:2], fitted, simulator)
        for arm in ("simple", "fly"):
            np.testing.assert_array_equal(scores[arm], [0., 0.])
            self.assertFalse(accepts[arm].any())

    def test_missing_market_feature_setup_is_excluded_from_all_three_arms(self):
        original_builder = build_feature_matrix

        def missing_fresh_feature(frame, observations):
            matrix = original_builder(frame, observations)
            matrix[observations.time >= pd.Timestamp(FRESH_START), 0] = np.nan
            return matrix

        with patch("joyeb_brain.sats_learning.calculate_sats", side_effect=known_setups), \
             patch("joyeb_brain.sats_learning.build_feature_matrix", side_effect=missing_fresh_feature):
            report, audit = evaluate_learning(sessions(end="2026-09-25"), simulator_factory=DeterministicFly)
        for metric in report["metrics"].values():
            self.assertEqual(metric["trade_count"], 0)
            self.assertEqual(metric["bars"], 26)
        self.assertEqual(report["decisions"], [])
        self.assertEqual(audit["excluded_buy_setups"][-1]["reason"], "missing_contiguous_or_nonfinite_features")

    def test_causal_feature_prefix_ignores_future_prices_volume_and_legacy_targets(self):
        frame = sessions(end="2026-08-14")
        cut = len(frame)-10
        original = build_feature_matrix(frame, calculate_sats(frame))
        changed = frame.copy()
        changed.loc[cut:, ["open", "high", "low", "close"]] *= 20
        changed.loc[cut:, "volume"] *= 100
        modified = build_feature_matrix(changed, calculate_sats(changed))
        prefix = build_feature_matrix(frame.iloc[:cut], calculate_sats(frame.iloc[:cut]))
        np.testing.assert_allclose(original[:cut], modified[:cut], equal_nan=True)
        np.testing.assert_allclose(original[:cut], prefix, equal_nan=True)

    def test_fresh_prices_and_outcomes_cannot_change_training_model_or_scalers(self):
        frame = sessions()
        changed = frame.copy()
        fresh = changed.time >= pd.Timestamp(FRESH_START)
        changed.loc[fresh, ["open", "high", "low", "close"]] *= 3
        changed.loc[fresh, "volume"] *= 10
        with patch("joyeb_brain.sats_learning.calculate_sats", side_effect=known_setups):
            report, audit = evaluate_learning(frame, simulator_factory=DeterministicFly)
            altered_report, altered = evaluate_learning(changed, simulator_factory=DeterministicFly)
        self.assertEqual(audit["primary"]["model"], altered["primary"]["model"])
        self.assertEqual(report["model_id"], altered_report["model_id"])
        self.assertEqual(report["training"]["data_sha256"], altered_report["training"]["data_sha256"])
        for label in audit["primary"]["training_labels"]:
            self.assertLess(pd.Timestamp(label["label_end"]), pd.Timestamp(FRESH_START))
        self.assertEqual(report["training"]["setups"], 34)
        self.assertTrue(all(fold["kind"] == "historical" for fold in report["folds"]))
        for fold in audit["historical_folds"]:
            for label in fold["training_labels"]:
                self.assertLess(pd.Timestamp(label["label_end"]), pd.Timestamp(fold["test_start"]))
            self.assertEqual(fold["training_setups"], len(fold["training_labels"]))
        self.assertEqual(report["evaluation"]["kind"], "fresh")
        self.assertEqual(set(report["metrics"]), {"sats", "simple", "fly"})
        self.assertEqual(len({metric["bars"] for metric in report["metrics"].values()}), 1)
        self.assertFalse(report["paper_ready"])
        self.assertEqual(report["schema"], 3)
        self.assertEqual(len(report["data"]["sha256"]), 64)
        json.dumps(report, allow_nan=False)
        self.assertTrue(all(len(metric["curve"]) <= 240 for metric in report["metrics"].values()))
        self.assertIsNone(report["latest"]["simple_net_bps"])  # Latest hold is not a buy-setup forecast.
        self.assertIsNone(report["latest"]["fly_net_bps"])

    def test_incomplete_fresh_setup_still_receives_a_causal_score(self):
        frame = sessions(end="2026-09-25")
        # End just after the fresh signal: no next bar, so no outcome is known.
        stop = "2026-09-25T17:30:00Z"
        with patch("joyeb_brain.sats_learning.calculate_sats", side_effect=known_setups):
            report, _ = evaluate_learning(frame, end=stop, simulator_factory=DeterministicFly)
        decision = report["decisions"][-1]
        self.assertEqual(decision["outcome_status"], "no_fill")
        self.assertIsNone(decision["outcome_net_bps"])
        self.assertIsNotNone(decision["simple_net_bps"])
        self.assertIsNotNone(decision["fly_net_bps"])
        self.assertLessEqual(pd.Timestamp(report["data"]["last"])+pd.Timedelta(minutes=15), pd.Timestamp(stop))

    def test_small_history_is_honest_and_does_not_construct_a_mock_or_real_graph(self):
        with patch("joyeb_brain.sats_learning.calculate_sats", side_effect=known_setups):
            report, audit = evaluate_learning(sessions(start="2026-09-21", end="2026-09-29"),
                                              simulator_factory=lambda: self.fail("Cold data must not instantiate a graph"))
        self.assertEqual(report["training"]["status"], "cannot_fit")
        self.assertFalse(report["checks"]["fit_available"])
        self.assertFalse(report["paper_ready"])
        self.assertEqual(audit["primary"]["model"]["reason"], "Fewer than 10 completed historical training setups")
        self.assertIsNone(report["decisions"][0]["fly_net_bps"])

    def test_configurable_end_and_historical_only_never_present_inspected_history_as_fresh(self):
        with patch("joyeb_brain.sats_learning.calculate_sats", side_effect=known_setups):
            report, _ = evaluate_learning(sessions(), history_only=True, simulator_factory=DeterministicFly)
        self.assertEqual(report["evaluation"]["kind"], "historical_only")
        self.assertLessEqual(pd.Timestamp(report["evaluation"]["end"]), pd.Timestamp(FRESH_START))
        self.assertFalse(report["paper_ready"])
        self.assertEqual(len(_bounded(list(range(10000)), 240)), 240)
        self.assertEqual(_bounded(list(range(10000)), 240)[-1], 9999)

    def test_protocol_does_not_accept_policy_tuning_or_backdated_fresh_cut(self):
        with self.assertRaises(ValueError):
            evaluate_learning(sessions(), policy=replace(ResearchPolicy(), cost_bps=0))
        with self.assertRaises(ValueError):
            evaluate_learning(sessions(), fresh_start="2026-09-01T00:00:00-04:00")


if __name__ == "__main__":
    unittest.main()
