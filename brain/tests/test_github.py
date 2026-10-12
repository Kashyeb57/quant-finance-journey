"""GitHub packaging and one-cycle behavior. No network or credentials."""
import base64
import hashlib
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

from cryptography.fernet import Fernet

from joyeb_brain import deployment, github_runner


def snapshot(folder):
    folder.mkdir(parents=True, exist_ok=True)
    model, graph = b"test model bytes", b"test graph bytes"
    model_id = hashlib.sha256(model).hexdigest()[:16]
    graph_meta = {"graph_sha256": hashlib.sha256(graph).hexdigest()}
    files = {"model.npz": model, "graph.npz": graph,
             "evaluation.json": json.dumps({"symbol": "MU", "model_id": model_id, "graph": graph_meta}).encode(),
             "graph.json": json.dumps(graph_meta).encode(), "data.json": b'{"symbol":"MU"}'}
    for name, content in files.items():
        (folder / name).write_bytes(content)
    return files


class SnapshotTests(unittest.TestCase):
    def test_round_trip_excludes_credentials_status_and_database(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            files = snapshot(root / "source")
            for name in ("secret.env", "status.json", "runner.sqlite", "github-model.key"):
                (root / "source" / name).write_text("not for publication")
            key, bundle = root / "private/key", root / "published/model.fernet"
            deployment.export_snapshot(root / "source", bundle, key)
            self.assertNotIn(b"test model bytes", bundle.read_bytes())
            self.assertNotIn(key.read_bytes().strip(), bundle.read_bytes())
            deployment.restore_snapshot(bundle, key.read_bytes().strip(), root / "restored")
            self.assertEqual({p.name for p in (root / "restored").iterdir()}, set(files))
            for name, content in files.items():
                self.assertEqual((root / "restored" / name).read_bytes(), content)
            previous = key.read_bytes()
            deployment.export_snapshot(root / "source", bundle, key)
            self.assertEqual(key.read_bytes(), previous)

    def test_wrong_key_or_modified_bundle_cannot_write_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            snapshot(root / "source")
            deployment.export_snapshot(root / "source", root / "bundle", root / "key")
            for key in (Fernet.generate_key(), b"not-a-valid-key"):
                with self.assertRaisesRegex(ValueError, "could not be unlocked"):
                    deployment.restore_snapshot(root / "bundle", key, root / "destination")
                self.assertFalse((root / "destination").exists())
            encrypted = bytearray((root / "bundle").read_bytes())
            encrypted[len(encrypted) // 2] ^= 1
            (root / "bundle").write_bytes(encrypted)
            with self.assertRaises(ValueError):
                deployment.restore_snapshot(root / "bundle", (root / "key").read_bytes().strip(), root / "destination")
            self.assertFalse((root / "destination").exists())

    def test_extra_files_and_traversal_are_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            snapshot(root / "source")
            value = json.loads(deployment.encode_snapshot(root / "source"))
            value["files"]["../outside"] = base64.b64encode(b"bad").decode()
            key = Fernet.generate_key()
            (root / "bundle").write_bytes(Fernet(key).encrypt(json.dumps(value).encode()))
            with self.assertRaisesRegex(ValueError, "exactly the five"):
                deployment.restore_snapshot(root / "bundle", key, root / "destination")
            self.assertFalse((root / "destination").exists())
            self.assertFalse((root / "outside").exists())

    def test_mismatched_model_graph_or_symbol_cannot_be_exported(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name, bad in (("model.npz", b"different"), ("graph.npz", b"different"),
                              ("data.json", b'{"symbol":"SPY"}')):
                snapshot(root)
                (root / name).write_bytes(bad)
                with self.assertRaises(ValueError):
                    deployment.export_snapshot(root, root / "bundle", root / "key")
                self.assertFalse((root / "bundle").exists())
                self.assertFalse((root / "key").exists())


class GitHubJobTests(unittest.TestCase):
    def environment(self, **updates):
        return {"GITHUB_ACTIONS": "true", "BRAIN_MODEL_KEY": "fixture-key",
                "BRAIN_OWNER_TOKEN": "fixture-owner-token", "BRAIN_STRATEGY": "legacy", **updates}

    def test_defaults_to_one_observation_cycle_and_consumes_secret_environment(self):
        with patch.dict(os.environ, self.environment(), clear=True), \
                patch.object(github_runner, "restore_snapshot") as restore, \
                patch.object(github_runner, "run_loop", return_value={"error": None}) as loop:
            github_runner.run_job()
            restore.assert_called_once()
            self.assertFalse(loop.call_args.kwargs["paper"])
            self.assertTrue(loop.call_args.kwargs["once"])
            self.assertEqual(loop.call_args.kwargs["runner_kind"], "github-actions")
            self.assertNotIn("BRAIN_OWNER_TOKEN", os.environ)
            self.assertNotIn("BRAIN_MODEL_KEY", os.environ)

    def test_paper_is_only_an_explicit_mode_not_an_enable_request(self):
        with patch.dict(os.environ, self.environment(BRAIN_RUN_MODE="paper"), clear=True), \
                patch.object(github_runner, "restore_snapshot"), \
                patch.object(github_runner, "run_loop", return_value={"error": None}) as loop:
            github_runner.run_job()
            self.assertTrue(loop.call_args.kwargs["paper"])
            # Website authorization and evaluation remain in the existing loop.
            self.assertEqual(set(loop.call_args.kwargs), {"paper", "once", "runner_kind"})

    def test_config_errors_do_not_restore_publish_or_print_secrets(self):
        cases = [{}, self.environment(BRAIN_RUN_MODE="live"),
                 self.environment(BRAIN_OWNER_TOKEN=""), self.environment(BRAIN_MODEL_KEY=""),
                 self.environment(BRAIN_OWNER_TOKEN="sensitive\nvalue")]
        for environment in cases:
            with self.subTest(environment_keys=list(environment)), \
                    patch.dict(os.environ, environment, clear=True), \
                    patch.object(github_runner, "restore_snapshot") as restore, \
                    patch.object(github_runner, "run_loop") as loop, redirect_stderr(io.StringIO()) as output:
                self.assertEqual(github_runner.main(), 1)
                restore.assert_not_called()
                loop.assert_not_called()
                self.assertNotIn("fixture-owner-token", output.getvalue())
                self.assertNotIn("fixture-key", output.getvalue())
                self.assertNotIn("sensitive", output.getvalue())

    def test_failed_cycle_is_a_failed_actions_job(self):
        with patch.dict(os.environ, self.environment(), clear=True), \
                patch.object(github_runner, "restore_snapshot"), \
                patch.object(github_runner, "run_loop", return_value={"error": "publish failed"}), \
                redirect_stderr(io.StringIO()):
            self.assertEqual(github_runner.main(), 1)

    def test_bad_bundle_never_runs_the_model(self):
        with patch.dict(os.environ, self.environment(), clear=True), \
                patch.object(github_runner, "restore_snapshot", side_effect=ValueError("bad bundle")), \
                patch.object(github_runner, "run_loop") as loop, redirect_stderr(io.StringIO()):
            self.assertEqual(github_runner.main(), 1)
            loop.assert_not_called()


class SatsSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Shared synthetic fixture exercises both packaging and frozen inference.
        from test_sats_runner import make_fixture
        cls.context = tempfile.TemporaryDirectory()
        fixture = Path(cls.context.name)
        _, cls.report, cls.arrays, _ = make_fixture(fixture)
        cls.files = {name: (fixture/name).read_bytes() for name in deployment.SATS_FILES}

    @classmethod
    def tearDownClass(cls):
        cls.context.cleanup()

    def setUp(self):
        self.context = tempfile.TemporaryDirectory()
        self.addCleanup(self.context.cleanup)
        self.root = Path(self.context.name)
        self.source = self.root/"runtime"
        (self.source/"sats-learning").mkdir(parents=True)
        for name, raw in self.files.items():
            target = self.source/name if name in {"graph.npz", "graph.json"} else self.source/"sats-learning"/name
            if name == "seed.csv":
                target = self.source/"sats-learning/data.csv"
            target.write_bytes(raw)
        self.bundle, self.key = self.root/"bundle.fernet", self.root/"private/key"

    def test_round_trip_keeps_legacy_and_excludes_credentials_and_audit(self):
        (self.source/"model.npz").write_bytes(b"legacy model remains untouched")
        for name in ("github-model.key", "status.json", "runner.sqlite"):
            (self.source/name).write_text("private unrelated state")
        (self.source/"sats-learning/audit.json").write_text("private full audit")
        deployment.export_sats_snapshot(self.source, self.bundle, self.key)
        previous_key = self.key.read_bytes()
        encrypted = self.bundle.read_bytes()
        self.assertNotIn(b"Synthetic unit-test fixture", encrypted)
        self.assertNotIn(previous_key.strip(), encrypted)
        destination = self.root/"restored"
        identity = deployment.restore_sats_snapshot(self.bundle, previous_key.strip(), destination)
        self.assertEqual(identity, self.report["model_id"])
        self.assertEqual({path.name: path.read_bytes() for path in destination.iterdir()}, self.files)
        self.assertEqual((self.source/"model.npz").read_bytes(), b"legacy model remains untouched")
        deployment.export_sats_snapshot(self.source, self.bundle, self.key)
        self.assertEqual(self.key.read_bytes(), previous_key)

    def test_wrong_key_and_corruption_write_nothing(self):
        deployment.export_sats_snapshot(self.source, self.bundle, self.key)
        for key in (Fernet.generate_key(), b"invalid-key"):
            with self.assertRaisesRegex(ValueError, "could not be unlocked"):
                deployment.restore_sats_snapshot(self.bundle, key, self.root/"destination")
            self.assertFalse((self.root/"destination").exists())
        raw = bytearray(self.bundle.read_bytes())
        raw[len(raw)//2] ^= 1
        self.bundle.write_bytes(raw)
        with self.assertRaises(ValueError):
            deployment.restore_sats_snapshot(self.bundle, self.key.read_bytes().strip(), self.root/"destination")
        self.assertFalse((self.root/"destination").exists())

    def test_extra_path_and_file_digest_mismatch_fail_before_writing(self):
        original = json.loads(deployment.encode_sats_snapshot(self.source))
        for kind in ("extra", "digest", "content"):
            value = json.loads(json.dumps(original))
            if kind == "extra":
                value["files"]["../outside"] = base64.b64encode(b"bad").decode()
                value["sha256"]["../outside"] = hashlib.sha256(b"bad").hexdigest()
            elif kind == "digest":
                value["sha256"]["seed.csv"] = "0"*64
            else:
                value["files"]["seed.csv"] = base64.b64encode(b"different source").decode()
            key = Fernet.generate_key()
            self.bundle.write_bytes(Fernet(key).encrypt(json.dumps(value).encode()))
            with self.assertRaises(ValueError):
                deployment.restore_sats_snapshot(self.bundle, key, self.root/"destination")
            self.assertFalse((self.root/"destination").exists())
            self.assertFalse((self.root/"outside").exists())

    def test_internal_mismatch_is_rejected_even_with_correct_outer_hashes(self):
        import numpy as np
        invalid = [{"model_id": "0"*16}, {"graph_hash": "0"*64}, {"data_sha256": "0"*64},
                   {"training_data_sha256": "0"*64}, {"simple_coef": np.full(12, np.nan)},
                   {"input_scale": np.zeros(6)}, {"threshold_net_bps": 1.0},
                   {"feature_names": np.asarray(["future_return"]*6)}]
        for changes in invalid:
            with self.subTest(fields=list(changes)):
                np.savez_compressed(self.source/"sats-learning/models.npz", **(self.arrays | changes))
                with self.assertRaises(ValueError):
                    deployment.export_sats_snapshot(self.source, self.bundle, self.key)
                self.assertFalse(self.bundle.exists())
                self.assertFalse(self.key.exists())

    def test_bad_report_seed_or_graph_cannot_overwrite_existing_destination(self):
        for name, raw in (("evaluation.json", json.dumps(self.report | {"paper_ready": True}).encode()),
                          ("seed.csv", b"different source"), ("graph.npz", b"different graph")):
            with self.subTest(file=name):
                files = self.files | {name: raw}
                value = {"schema": 2, "strategy": "sats-learning",
                         "files": {key: base64.b64encode(content).decode() for key, content in files.items()},
                         "sha256": {key: hashlib.sha256(content).hexdigest() for key, content in files.items()}}
                key = Fernet.generate_key()
                self.bundle.write_bytes(Fernet(key).encrypt(json.dumps(value).encode()))
                destination = self.root/"destination"
                destination.mkdir(exist_ok=True)
                (destination/"models.npz").write_bytes(b"existing model")
                with self.assertRaises(ValueError):
                    deployment.restore_sats_snapshot(self.bundle, key, destination)
                self.assertEqual({path.name: path.read_bytes() for path in destination.iterdir()},
                                 {"models.npz": b"existing model"})


class SatsGitHubJobTests(unittest.TestCase):
    def test_default_strategy_restores_isolated_snapshot_and_injects_observer(self):
        predictor = object()
        environment = {"GITHUB_ACTIONS": "true", "BRAIN_MODEL_KEY": "fixture-key",
                       "BRAIN_OWNER_TOKEN": "fixture-owner-token"}
        with patch.dict(os.environ, environment, clear=True), \
                patch.object(github_runner, "restore_sats_snapshot") as restore, \
                patch.object(github_runner, "restore_snapshot") as legacy, \
                patch("joyeb_brain.sats_runner.SatsPredictor", return_value=predictor) as constructor, \
                patch.object(github_runner, "run_loop", return_value={"error": None}) as loop:
            github_runner.run_job()
            restore.assert_called_once_with(deployment.ROOT/"deployment/sats-model.fernet", "fixture-key",
                                            github_runner.RUNTIME/"sats-learning")
            constructor.assert_called_once_with(github_runner.RUNTIME/"sats-learning")
            legacy.assert_not_called()
            self.assertIs(loop.call_args.kwargs["predictor"], predictor)
            self.assertFalse(loop.call_args.kwargs["paper"])
            self.assertTrue(loop.call_args.kwargs["once"])
            self.assertNotIn("BRAIN_OWNER_TOKEN", os.environ)
            self.assertNotIn("BRAIN_MODEL_KEY", os.environ)

    def test_paper_and_unknown_strategy_fail_before_secrets_restore_or_network(self):
        for changes in ({"BRAIN_RUN_MODE": "paper"}, {"BRAIN_STRATEGY": "unknown"}):
            with self.subTest(settings=changes), patch.dict(os.environ, {"GITHUB_ACTIONS": "true", **changes}, clear=True), \
                    patch.object(github_runner, "secret") as secret, \
                    patch.object(github_runner, "restore_sats_snapshot") as restore, \
                    patch.object(github_runner, "run_loop") as loop, redirect_stderr(io.StringIO()):
                self.assertEqual(github_runner.main(), 1)
                secret.assert_not_called()
                restore.assert_not_called()
                loop.assert_not_called()

    def test_failed_sats_predictor_never_runs_loop(self):
        environment = {"GITHUB_ACTIONS": "true", "BRAIN_MODEL_KEY": "fixture-key",
                       "BRAIN_OWNER_TOKEN": "fixture-owner-token"}
        with patch.dict(os.environ, environment, clear=True), \
                patch.object(github_runner, "restore_sats_snapshot"), \
                patch("joyeb_brain.sats_runner.SatsPredictor", side_effect=ValueError("mismatched model")), \
                patch.object(github_runner, "run_loop") as loop, redirect_stderr(io.StringIO()):
            self.assertEqual(github_runner.main(), 1)
            loop.assert_not_called()


if __name__ == "__main__":
    unittest.main()
