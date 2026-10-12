"""Causal indicator and conservative execution tests; no network or tokens."""
from dataclasses import replace
import json
import unittest

import numpy as np
import pandas as pd

from joyeb_brain.sats import SatsConfig, calculate_sats, wilder
from joyeb_brain.sats_research import ResearchPolicy, backtest_long_flat, evaluate_sats


def candles(count=240):
    close = 100+np.sin(np.arange(count)/8)*8+np.arange(count)*0.01
    return pd.DataFrame({"time": pd.date_range("2026-09-01T13:30:00Z", periods=count, freq="15min"),
                         "open": close, "high": close+1, "low": close-1, "close": close,
                         "volume": np.full(count, 1000.0)})


def execution_bars(rows):
    result = pd.DataFrame(rows)
    result["time"] = pd.date_range("2026-09-01T17:15:00Z", periods=len(rows), freq="15min")
    for key, value in {"signal": "hold", "warmed_up": True, "atr": 2.0, "tqi": 0.8,
                       "stop": 95.0, "tp1": 105.0, "tp2": 107.0, "tp3": 110.0}.items():
        if key not in result:
            result[key] = value
        else:
            result[key] = result[key].fillna(value)
    return result


class IndicatorTests(unittest.TestCase):
    def test_wilder_has_sma_seed_and_not_ema_seed(self):
        result = wilder(np.array([1., 2., 3., 4.]), 3)
        self.assertTrue(np.isnan(result[:2]).all())
        self.assertAlmostEqual(result[2], 2)
        self.assertAlmostEqual(result[3], 8/3)

    def test_default_and_auto_resolve_like_fifteen_minute_pine(self):
        self.assertEqual(SatsConfig.for_preset(), SatsConfig())
        self.assertEqual(SatsConfig.for_preset("Auto", 5).atr_length, 10)
        self.assertEqual(SatsConfig.for_preset("Auto", 1440).atr_length, 21)
        self.assertEqual(SatsConfig().warmup, 110)

    def test_future_prices_and_volume_cannot_change_a_prefix(self):
        data = candles()
        prefix = calculate_sats(data.iloc[:170])
        original = calculate_sats(data)
        changed = data.copy()
        changed.loc[170:, ["open", "high", "low", "close"]] *= 2
        changed.loc[170:, "volume"] *= 8
        altered = calculate_sats(changed)
        pd.testing.assert_frame_equal(prefix, original.iloc[:170].reset_index(drop=True))
        pd.testing.assert_frame_equal(prefix, altered.iloc[:170].reset_index(drop=True))

    def test_trending_tqi_matches_hand_calculation(self):
        data = candles()
        data["close"] = np.arange(len(data))+100.0
        data["open"] = data.close
        data["high"], data["low"] = data.close+0.5, data.close-0.5
        last = calculate_sats(data).iloc[-1]
        self.assertAlmostEqual(last.er, 1)
        self.assertAlmostEqual(last.tqi_momentum, 1)
        self.assertAlmostEqual(last.tqi_structure, .95)
        self.assertAlmostEqual(last.tqi_volume, 1/3)
        self.assertAlmostEqual(last.tqi, .35+.2/3+.25*.95+.2)
        self.assertEqual(last.signal, "hold")  # A trend alone is not a new BUY.

    def test_volume_is_latched_even_after_zero_volume(self):
        data = candles()
        data.volume = 0
        data.loc[2, "volume"] = 1000
        result = calculate_sats(data)
        self.assertAlmostEqual(result.iloc[-1].tqi_volume, 1/3)

    def test_pivot_is_not_available_until_right_bars_exist(self):
        data = candles(15)
        data.loc[7, "low"] = 50
        result = calculate_sats(data, replace(SatsConfig(), pivot_length=3))
        self.assertNotEqual(result.iloc[9].last_pivot_low, 50)
        self.assertEqual(result.iloc[10].last_pivot_low, 50)

    def test_warmup_blocks_every_signal(self):
        result = calculate_sats(candles())
        self.assertTrue(result.iloc[:110].signal.eq("hold").all())
        self.assertGreater(result.iloc[110:].signal.ne("hold").sum(), 0)

    def test_display_filters_do_not_change_entry_logic(self):
        data = candles()
        default = calculate_sats(data)
        disabled = calculate_sats(data, replace(SatsConfig(), score_structure=False, score_volume=False, score_rsi=False))
        pd.testing.assert_series_equal(default.signal, disabled.signal)
        self.assertFalse(default.score.equals(disabled.score))

    def test_dynamic_targets_remain_ordered_and_capped(self):
        result = calculate_sats(candles(), replace(SatsConfig(), target_mode="Dynamic", target_floor=10, target_ceiling=2))
        bullish, bearish = result.trend.eq(1), result.trend.eq(-1)
        self.assertTrue((result.loc[bullish, "tp1"] <= result.loc[bullish, "tp2"]).all())
        self.assertTrue((result.loc[bearish, "tp1"] >= result.loc[bearish, "tp2"]).all())
        self.assertTrue(np.isfinite(result.select_dtypes("number").drop(columns=["last_pivot_low", "last_pivot_high"])).all().all())

    def test_invalid_data_is_rejected(self):
        for edit in (lambda d: d.assign(high=d.low-1), lambda d: d.assign(volume=-1),
                     lambda d: d.assign(close=np.nan), lambda d: d.iloc[::-1],
                     lambda d: pd.concat([d, d.iloc[-1:]])):
            with self.subTest(edit=edit), self.assertRaises(ValueError):
                calculate_sats(edit(candles(12)))

    def test_invalid_settings_are_rejected(self):
        for changes in ({"quality_strength": 2}, {"atr_length": 0}, {"band_width": float("nan")},
                        {"weights": (1, 2)}, {"target_mode": "Magic"}, {"character_low": .8},
                        {"quality": "false"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                replace(SatsConfig(), **changes)


class ExecutionTests(unittest.TestCase):
    def test_next_open_entry_and_costs_on_both_sides(self):
        data = execution_bars([
            {"open": 99, "high": 105, "low": 98, "close": 100, "signal": "buy"},
            {"open": 101, "high": 104, "low": 100, "close": 102},
            {"open": 103, "high": 112, "low": 101, "close": 110}])
        result = backtest_long_flat(data)
        self.assertEqual(result["fills"][0]["price"], 101)
        self.assertEqual(result["fills"][1]["price"], 110)
        self.assertAlmostEqual(result["net_pnl"], 9-(101+110)*.0005)
        self.assertEqual(result["trade_count"], 1)

    def test_signal_bar_range_cannot_fill_its_new_trade(self):
        data = execution_bars([
            {"open": 100, "high": 120, "low": 90, "close": 100, "signal": "buy"},
            {"open": 101, "high": 104, "low": 100, "close": 102}])
        result = backtest_long_flat(data)
        self.assertEqual(result["trades"][0]["reason"], "end_of_sample")

    def test_stop_wins_ambiguous_bar(self):
        data = execution_bars([
            {"open": 100, "high": 101, "low": 99, "close": 100, "signal": "buy"},
            {"open": 100, "high": 115, "low": 90, "close": 102}])
        result = backtest_long_flat(data)
        self.assertEqual(result["ambiguous_stop_target_bars"], 1)
        self.assertEqual(result["trades"][0]["exit"], 95)
        self.assertEqual(result["trades"][0]["reason"], "stop")

    def test_gap_loss_is_not_clipped_to_stop_or_minus_one_r(self):
        data = execution_bars([
            {"open": 100, "high": 101, "low": 99, "close": 100, "signal": "buy"},
            {"open": 100, "high": 101, "low": 99, "close": 100},
            {"open": 90, "high": 94, "low": 89, "close": 92}])
        result = backtest_long_flat(data, replace(ResearchPolicy(), cost_bps=0))
        self.assertEqual(result["trades"][0]["exit"], 90)
        self.assertEqual(result["net_pnl"], -10)

    def test_opposite_signal_exits_at_following_open_without_shorting(self):
        data = execution_bars([
            {"open": 100, "high": 101, "low": 99, "close": 100, "signal": "buy"},
            {"open": 101, "high": 104, "low": 100, "close": 103, "signal": "sell"},
            {"open": 102, "high": 104, "low": 100, "close": 103}])
        result = backtest_long_flat(data)
        self.assertEqual([f["side"] for f in result["fills"]], ["buy", "sell"])
        self.assertEqual(result["trades"][0]["reason"], "opposite_flip")
        self.assertEqual(result["trades"][0]["exit"], 102)

    def test_missing_next_open_cannot_create_a_fill(self):
        data = execution_bars([
            {"open": 100, "high": 101, "low": 99, "close": 100, "signal": "buy"},
            {"open": 101, "high": 104, "low": 100, "close": 102}])
        data.loc[1, "time"] += pd.Timedelta(minutes=15)
        result = backtest_long_flat(data)
        self.assertEqual(result["fills"], [])
        self.assertEqual(result["skipped_entries"]["missing_next_open"], 1)

    def test_last_signal_has_no_future_fill(self):
        result = backtest_long_flat(execution_bars([
            {"open": 100, "high": 101, "low": 99, "close": 100, "signal": "buy"}]))
        self.assertEqual(result["fills"], [])

    def test_price_cap_and_end_of_sample_fees(self):
        data = execution_bars([
            {"open": 100, "high": 101, "low": 99, "close": 100, "signal": "buy"},
            {"open": 101, "high": 104, "low": 100, "close": 102}])
        result = backtest_long_flat(data, replace(ResearchPolicy(), max_buy_price=100))
        self.assertEqual(result["fills"], [])
        self.assertEqual(result["skipped_entries"]["price_or_cash_cap"], 1)

    def test_test_partition_starts_flat_without_inherited_trade(self):
        data = execution_bars([
            {"open": 100, "high": 101, "low": 99, "close": 100, "signal": "buy"},
            {"open": 101, "high": 104, "low": 100, "close": 102}])
        self.assertEqual(backtest_long_flat(data, start_index=1)["fills"], [])

    def test_full_report_remains_research_only_and_json_serializable(self):
        frames = []
        for day in pd.bdate_range("2026-08-03", periods=20):
            data = candles(26)
            data["time"] = pd.date_range(day.strftime("%Y-%m-%d")+"T13:30:00Z", periods=26, freq="15min")
            frames.append(data)
        report, _ = evaluate_sats(pd.concat(frames, ignore_index=True))
        self.assertFalse(report["paper_ready"])
        self.assertFalse(report["checks"]["execution_adapter_verified"])
        self.assertEqual(report["schema"], 2)
        self.assertNotIn("graph", report)
        json.dumps(report, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
