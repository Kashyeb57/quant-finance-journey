"""Frozen evidence publication and observation-only execution regressions."""
import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import pandas as pd

from joyeb_brain import runner
from test_pipeline import fixture
from test_safety import FakePredictor, TOKEN


class SatsPublicationTests(unittest.TestCase):
    def test_public_evidence_retains_curves_but_removes_every_fitted_readout(self):
        evidence = {"schema": 3, "strategy": "sats-learning", "paper_ready": False,
                    "training": {"samples": 53, "model": {"private_coef": [1, 2]}},
                    "folds": [{"model": {"private_coef": [3]}, "metrics": {"fly": {"net_pnl": -3}}}],
                    "metrics": {"fly": {"curve": [{"time": "2026-10-01", "equity": 1}]}}}
        original = copy.deepcopy(evidence)
        public = runner.publishable({"mode": "observe", "evaluation": evidence})
        self.assertNotIn("model", public["evaluation"]["training"])
        self.assertNotIn("model", public["evaluation"]["folds"][0])
        self.assertEqual(public["evaluation"]["metrics"], evidence["metrics"])
        self.assertEqual(evidence, original)
        self.assertNotIn("private_coef", json.dumps(public))

    def test_learning_report_cannot_silently_lose_required_evidence_when_oversized(self):
        state = {"evaluation": {"schema": 3, "strategy": "sats-learning", "metrics": {},
                                "notes": "x" * runner.MAX_REPORT_CHARS}}
        with self.assertRaisesRegex(ValueError, "exceeds"):
            runner.publishable(state)

    def test_recursive_cache_detects_revisions_before_the_legacy_twenty_bar_window(self):
        bars = fixture().iloc[:40].copy()
        revised = bars.copy()
        revised.loc[0, "volume"] += 1
        self.assertEqual(runner.window_key(bars), runner.window_key(revised))
        self.assertNotEqual(runner.window_key(bars, full_history=True), runner.window_key(revised, full_history=True))

    def test_observation_predictor_rejects_paper_before_database_or_network(self):
        predictor = FakePredictor()
        predictor.observation_only = True
        with patch.object(runner.sqlite3, "connect") as database, patch.object(runner, "fetch_bars") as fetch:
            with self.assertRaisesRegex(ValueError, "observation only"):
                runner.run_loop(threading.Event(), TOKEN, paper=True, once=True, predictor=predictor)
        database.assert_not_called()
        fetch.assert_not_called()

    def test_frozen_observer_fetches_bridge_history_and_never_reads_execution_controls(self):
        predictor = FakePredictor(target=0, paper_ready=False)
        predictor.observation_only = True
        predictor.fetch_days = lambda now: 37
        bars = fixture().iloc[:20]
        now = (bars.time.iloc[-1] + pd.Timedelta(minutes=16)).to_pydatetime()
        records = bars.assign(time=bars.time.map(lambda stamp: int(stamp.timestamp()))).to_dict("records")
        paths = []
        with tempfile.TemporaryDirectory() as directory, patch.object(runner, "RUNTIME", Path(directory)), \
                patch.object(runner, "fetch_bars", return_value=(records, "fixture")) as fetch, \
                patch.object(runner, "request", side_effect=lambda path, *args: paths.append(path) or {"ok": True}), \
                contextlib.redirect_stdout(io.StringIO()):
            state = runner.run_loop(threading.Event(), TOKEN, once=True, predictor=predictor, clock=lambda: now)
        fetch.assert_called_once_with(days=37)
        self.assertEqual(state["mode"], "observe")
        self.assertTrue(paths)
        self.assertEqual(set(paths), {"/_m/brain/report"})


if __name__ == "__main__":
    unittest.main()
