"""Runtime/evaluation contract tests, with no network calls or real orders."""
import json
import hashlib
import io
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from joyeb_brain import research
from joyeb_brain.data import FEATURES, PIPELINE_VERSION, SYMBOL, features
from joyeb_brain.research import Predictor
from test_pipeline import fixture


class RuntimeContractTests(unittest.TestCase):
    def positive_predictor(self, bars):
        raw = features(bars, training=False).iloc[-1][FEATURES].to_numpy(float)
        predictor = Predictor.__new__(Predictor)
        predictor.report = {"model_id": "0123456789abcdef"}
        predictor.model = {"input_mean": raw, "input_scale": np.ones(len(FEATURES)),
                           "mean": np.zeros(1), "scale": np.ones(1), "coef": np.zeros(1),
                           "intercept": .01, "threshold": .001}
        predictor.simulator = SimpleNamespace(transform=lambda x: np.ones((len(x), 1)))
        return predictor

    def test_last_entry_bar_can_be_long_but_next_bar_targets_flat(self):
        bars = fixture()
        predictor = self.positive_predictor(bars.iloc[:24])  # latest 15:15 ET
        self.assertEqual(predictor.signal(bars.iloc[:24])["target_position"], 1)
        flat = predictor.signal(bars.iloc[:25])  # latest 15:30 ET
        self.assertEqual(flat["target_position"], 0)
        self.assertIsNone(flat["predicted_return"])

    def test_gap_cannot_reuse_older_tradeable_features(self):
        bars = fixture().iloc[:24]
        predictor = self.positive_predictor(bars)
        signal = predictor.signal(bars.drop(index=18))
        self.assertEqual(signal["target_position"], 0)
        self.assertEqual(signal["bar_time"], bars.time.iloc[-1].isoformat())
        self.assertFalse(signal["distribution_ok"])

    def test_out_of_range_input_overrides_positive_forecast(self):
        bars = fixture().iloc[:24]
        predictor = self.positive_predictor(bars)
        predictor.model["input_mean"] += 100
        signal = predictor.signal(bars)
        self.assertGreater(signal["predicted_return"], 0)
        self.assertFalse(signal["distribution_ok"])
        self.assertEqual(signal["target_position"], 0)

    @contextmanager
    def artifacts(self, version=PIPELINE_VERSION, names=FEATURES, model_id=None, graph_hash="test-graph"):
        # Exercise real NumPy serialization in memory. No disk artifacts or
        # Windows temporary-directory permissions are needed for these checks.
        data = io.BytesIO()
        np.savez(data, pipeline_version=version,
                 feature_names=np.array(names), graph_hash="test-graph")
        fingerprint = hashlib.sha256(data.getvalue()).hexdigest()
        report = {"symbol": SYMBOL, "pipeline_version": PIPELINE_VERSION,
                  "model_id": model_id or fingerprint[:16]}
        data.seek(0)
        with np.load(data, allow_pickle=False) as archive:
            with patch.object(research.np, "load", return_value=archive), patch.object(Path, "read_text", return_value=json.dumps(report)), patch.object(research, "digest", return_value=fingerprint), patch.object(research, "FlyFeatures", return_value=SimpleNamespace(graph_hash=graph_hash)):
                yield

    def test_old_pipeline_cannot_start_inference(self):
        with self.artifacts(version="old-pipeline"):
            with self.assertRaisesRegex(ValueError, "Pipeline changed"):
                Predictor()

    def test_changed_feature_order_cannot_start_inference(self):
        with self.artifacts(names=list(reversed(FEATURES))):
            with self.assertRaisesRegex(ValueError, "Feature schema"):
                Predictor()

    def test_evaluation_from_different_model_cannot_start_inference(self):
        with self.artifacts(model_id="0000000000000000"):
            with self.assertRaisesRegex(ValueError, "Model/evaluation mismatch"):
                Predictor()

    def test_changed_graph_cannot_start_inference(self):
        with self.artifacts(graph_hash="different-graph"):
            with self.assertRaisesRegex(ValueError, "Connectome changed"):
                Predictor()
