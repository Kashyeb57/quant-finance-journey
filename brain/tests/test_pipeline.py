import unittest
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from joyeb_brain.data import FEATURES, clean_bars, features
from joyeb_brain.research import fit_ridge, performance, predict
from joyeb_brain.runner import fresh


def fixture():
    # Synthetic fixture ONLY; never used as market data or training results.
    times = pd.date_range("2025-01-06 14:30", periods=26, freq="15min", tz="UTC")
    p = 100 + np.arange(26)*.1
    return pd.DataFrame({"time": times, "open": p, "close": p+.05,
                         "high": p+.1, "low": p-.1, "volume": 100+np.arange(26)})


class PipelineTests(unittest.TestCase):
    def test_incomplete_bar_is_excluded(self):
        bars = clean_bars(fixture(), now="2025-01-06T15:07:00Z")
        self.assertEqual(len(bars), 2)

    def test_invalid_price_is_rejected(self):
        f = fixture(); f.loc[0, "close"] = -1
        with self.assertRaises(ValueError): clean_bars(f)

    def test_future_prices_cannot_change_past_features(self):
        original = fixture()
        changed = original.copy()
        changed.loc[22:, ["open", "high", "low", "close"]] *= 3
        a, b = features(original), features(changed)
        np.testing.assert_allclose(a.loc[a.time < original.time.iloc[22], FEATURES],
                                   b.loc[b.time < original.time.iloc[22], FEATURES])

    def test_label_uses_next_open_not_observed_close(self):
        f = fixture(); s = features(f)
        first = s.iloc[0]
        idx = f.index[f.time == first.time][0]
        self.assertAlmostEqual(first.target, f.open.iloc[idx+2]/f.open.iloc[idx+1]-1)

    def test_gap_invalidates_window(self):
        f = fixture().drop(index=18)
        s = features(f)
        self.assertFalse((s.time >= fixture().time.iloc[19]).any())

    def test_training_scaler_does_not_see_test_data(self):
        x = np.arange(40, dtype=float).reshape(20,2)
        fit = fit_ridge(x[:10], np.arange(10)/100)
        np.testing.assert_allclose(fit[0], x[:10].mean(axis=0))
        self.assertTrue(np.isfinite(predict(x[10:], fit)).all())

    def test_costs_include_entry_and_exit(self):
        frame = pd.DataFrame({"time": pd.date_range("2025-01-01", periods=2, freq="15min", tz="UTC"),
                              "target_end": pd.date_range("2025-01-01 00:30", periods=2, freq="15min", tz="UTC"), "target": [0.,0.]})
        result = performance(np.ones(2), frame, 0)
        self.assertEqual(result["order_sides"], 2)
        self.assertLess(result["return_pct"], 0)

    def test_stale_signal_is_not_tradeable(self):
        signal = {"bar_time": "2025-01-06T15:00:00+00:00"}
        self.assertTrue(fresh(signal, datetime(2025,1,6,15,16,tzinfo=timezone.utc)))
        self.assertFalse(fresh(signal, datetime(2025,1,6,15,14,tzinfo=timezone.utc)))
        self.assertFalse(fresh(signal, datetime(2025,1,6,15,21,tzinfo=timezone.utc)))


if __name__ == "__main__": unittest.main()
