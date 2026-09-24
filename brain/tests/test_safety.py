"""Order gating, credential handling and local-server safety. No network, no real orders."""
import contextlib
import http.client
import io
import json
import socket
import sys
import tempfile
import threading
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from joyeb_brain import __main__ as cli
from joyeb_brain import data, runner
from test_pipeline import fixture

TOKEN = "fixture-token-not-real"
MODEL = "0123456789abcdef"


class FakePredictor:
    def __init__(self, target=1, paper_ready=True, distribution_ok=True):
        self.report = {"paper_ready": paper_ready, "model_id": MODEL, "metrics": {}}
        self.target, self.distribution_ok = target, distribution_ok

    def signal(self, bars, now=None, settle_seconds=0, strict=True):
        latest = data.clean_bars(pd.DataFrame(bars), now=now, settle_seconds=settle_seconds, strict=strict).time.iloc[-1]
        return {"bar_time": latest.isoformat(), "symbol": data.SYMBOL, "target_position": self.target,
                "distribution_ok": self.distribution_ok, "model_id": MODEL, "predicted_return": 0.001}


class RunnerGatingTests(unittest.TestCase):
    """One loop iteration against fake bars and a fake website."""

    def run_once(self, paper, predictor, enabled=True):
        bars = fixture().iloc[:20]  # latest bar 19:15 UTC = 14:15 New York, inside the entry window
        latest = bars.time.iloc[-1]
        clock = lambda: (latest + timedelta(minutes=16)).to_pydatetime()
        calls = []

        def fake_request(path, body=None, token=None):
            calls.append((path, body, token))
            if path == "/_m/brain/control":
                return {"enabled": enabled}
            if path == "/_m/brain/order":
                return {"ok": True, "action": "buy" if body["target_position"] else "sell"}
            return {"ok": True}

        records = bars.assign(time=bars.time.map(lambda t: int(t.timestamp()))).to_dict("records")
        out = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(runner, "RUNTIME", Path(tmp)), \
                patch.object(runner, "fetch_bars", lambda days=7: (records, "fixture")), \
                patch.object(runner, "request", fake_request), \
                contextlib.redirect_stdout(out):
            runner.run_loop(threading.Event(), TOKEN, paper, once=True, predictor=predictor, clock=clock)
            status_text = (Path(tmp) / "status.json").read_text()
        return calls, status_text, out.getvalue()

    def orders(self, calls):
        return [c for c in calls if c[0] == "/_m/brain/order"]

    def test_observe_mode_never_requests_an_order(self):
        calls, _, _ = self.run_once(False, FakePredictor())
        self.assertTrue(any(c[0] == "/_m/brain/report" for c in calls))
        self.assertEqual(self.orders(calls), [])

    def test_paused_website_blocks_orders(self):
        calls, status_text, _ = self.run_once(True, FakePredictor(), enabled=False)
        self.assertEqual(self.orders(calls), [])
        self.assertIn("paused", json.loads(status_text)["event"])

    def test_failed_gate_or_out_of_range_inputs_block_a_buy(self):
        for predictor in (FakePredictor(paper_ready=False), FakePredictor(distribution_ok=False)):
            calls, _, _ = self.run_once(True, predictor)
            self.assertEqual(self.orders(calls), [])

    def test_exit_is_still_requested_when_entries_are_blocked(self):
        calls, _, _ = self.run_once(True, FakePredictor(target=0, paper_ready=False))
        self.assertEqual(len(self.orders(calls)), 1)
        self.assertEqual(self.orders(calls)[0][1]["target_position"], 0)

    def test_token_travels_only_as_the_request_token(self):
        calls, status_text, printed = self.run_once(True, FakePredictor())
        self.assertTrue(calls and all(token == TOKEN for _, _, token in calls))
        for path, body, _ in calls:
            self.assertNotIn(TOKEN, path)
            self.assertNotIn(TOKEN, json.dumps(body))
        self.assertNotIn(TOKEN, status_text)
        self.assertNotIn(TOKEN, printed)


class TransportTests(unittest.TestCase):
    def test_request_uses_the_fixed_https_origin_header_and_refuses_redirects(self):
        captured = {}

        class FakeOpener:
            def open(self, req, timeout):
                captured["req"] = req
                return io.BytesIO(b'{"ok": true}')

        def fake_build_opener(*handlers):
            captured["handlers"] = handlers
            return FakeOpener()

        with patch("urllib.request.build_opener", fake_build_opener):
            data.request("/_m/brain/report", {"mode": "observe"}, TOKEN)
        req = captured["req"]
        self.assertTrue(req.full_url.startswith("https://joyebkashyeb.com.np/_m/brain/report"))
        self.assertNotIn(TOKEN, req.full_url)
        self.assertEqual(req.get_header("X-trade-token"), TOKEN)
        handler = captured["handlers"][0]
        handler = handler() if isinstance(handler, type) else handler
        self.assertIsNone(handler.redirect_request(req, None, 302, "Found", {}, "https://evil.example/"))


class LocalServerTests(unittest.TestCase):
    def setUp(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self.port = s.getsockname()[1]
        self.patch = patch.object(runner, "status", lambda: {"mode": "observe", "event": "fixture"})
        self.patch.start()
        self.server = runner.make_server(self.port)
        threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": .05}, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.patch.stop()

    def get(self, method="GET", host=None, origin=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Host": host or f"127.0.0.1:{self.port}"}
        if origin:
            headers["Origin"] = origin
        conn.request(method, "/status", headers=headers)
        res = conn.getresponse()
        body = res.read()
        conn.close()
        return res.status, dict(res.getheaders()), body

    def test_status_is_served_to_loopback(self):
        code, _, body = self.get()
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["event"], "fixture")

    def test_foreign_host_header_is_rejected(self):
        self.assertEqual(self.get(host="evil.example")[0], 403)

    def test_cors_only_for_the_site(self):
        code, headers, _ = self.get(origin="https://evil.example")
        self.assertEqual(code, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        code, headers, _ = self.get(origin=data.ORIGIN)
        self.assertEqual(code, 200)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), data.ORIGIN)

    def test_no_state_changing_methods(self):
        for method in ("POST", "PUT", "DELETE"):
            self.assertNotEqual(self.get(method=method)[0], 200)

    def test_a_second_runner_cannot_share_the_port(self):
        with self.assertRaises(SystemExit):
            runner.make_server(self.port)


class RuleTests(unittest.TestCase):
    def test_a_bar_counts_only_60_seconds_after_it_ends(self):
        bars = fixture().iloc[:6]
        end = bars.time.iloc[-1] + pd.Timedelta(minutes=15)
        early = data.clean_bars(bars, now=end + pd.Timedelta(seconds=30), settle_seconds=60)
        late = data.clean_bars(bars, now=end + pd.Timedelta(seconds=61), settle_seconds=60)
        self.assertEqual(len(early), 5)
        self.assertEqual(len(late), 6)

    def test_live_download_drops_an_invalid_bar_but_training_rejects_it(self):
        bars = fixture()
        bars.loc[3, "close"] = -1
        with self.assertRaises(ValueError):
            data.clean_bars(bars)
        cleaned = data.clean_bars(bars, strict=False)
        self.assertEqual(cleaned.attrs["dropped_invalid"], 1)
        self.assertEqual(len(cleaned), len(bars) - 1)

    def test_after_hours_bars_on_early_close_days_are_dropped(self):
        def day(date):
            times = pd.date_range(f"{date} 17:45", periods=4, freq="15min", tz="UTC")  # 12:45-13:30 New York
            return pd.DataFrame({"time": times, "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.5, "volume": 10})
        normal = data.clean_bars(day("2026-11-25"), now="2027-01-01T00:00:00Z")
        early = data.clean_bars(day("2026-11-27"), now="2027-01-01T00:00:00Z")
        self.assertEqual(len(normal), 4)
        self.assertEqual(len(early), 1)  # only the 12:45 bar is regular session

    def test_imported_times_need_an_explicit_offset(self):
        frame = fixture().assign(time=lambda f: f.time.dt.strftime("%Y-%m-%d %H:%M:%S"))
        with self.assertRaises(ValueError):
            data.clean_bars(frame, require_offset=True)
        zulu = frame.assign(time=frame.time + "Z")
        self.assertEqual(len(data.clean_bars(zulu, require_offset=True)), len(frame))

    def test_published_report_is_thinned_below_the_website_limit(self):
        curve = [{"time": f"2026-01-01T00:{i % 60:02d}:00+00:00", "equity": 1 + i / 1e5} for i in range(2000)]
        state = {"mode": "observe", "evaluation": {"model_id": MODEL, "metrics": {
            name: {"return_pct": 0.1, "curve": list(curve)} for name in ("fly", "market_only", "always_long")}}}
        report = runner.publishable(state)
        fly = report["evaluation"]["metrics"]["fly"]["curve"]
        self.assertLessEqual(len(fly), runner.MAX_CURVE_POINTS)
        self.assertEqual(fly[0], curve[0])
        self.assertEqual(fly[-1], curve[-1])
        self.assertTrue(report["evaluation"]["curves_thinned"])
        self.assertLess(len(json.dumps(report)), runner.MAX_REPORT_CHARS)
        self.assertEqual(len(state["evaluation"]["metrics"]["fly"]["curve"]), 2000)  # the saved evaluation is untouched


class ResolveCommandTests(unittest.TestCase):
    def test_resolve_posts_the_id_with_the_token_header_only(self):
        calls = []
        out = io.StringIO()
        with patch.object(cli, "request", lambda path, body=None, token=None: calls.append((path, body, token)) or {"ok": True}), \
                patch("getpass.getpass", lambda prompt="": TOKEN), \
                patch.object(sys, "argv", ["joyeb_brain", "resolve", f"joyeb-fly-{data.SYMBOL}-1758650400"]), \
                contextlib.redirect_stdout(out):
            cli.main()
        self.assertEqual(calls, [("/_m/brain/resolve", {"client_id": f"joyeb-fly-{data.SYMBOL}-1758650400"}, TOKEN)])
        self.assertNotIn(TOKEN, out.getvalue())

    def test_resolve_rejects_a_malformed_id_before_asking_for_the_token(self):
        with patch("getpass.getpass", side_effect=AssertionError("must not prompt")), \
                patch.object(sys, "argv", ["joyeb_brain", "resolve", "x; drop"]), \
                contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                cli.main()


if __name__ == "__main__":
    unittest.main()


class SymbolTests(unittest.TestCase):
    def test_the_worker_and_the_runner_agree_on_the_symbol(self):
        worker = (Path(__file__).resolve().parents[2] / "market" / "src" / "brain.mjs").read_text(encoding="utf-8")
        self.assertIn(f"const SYMBOL = '{data.SYMBOL}';", worker)

    def test_a_model_trained_on_another_symbol_refuses_to_run(self):
        from joyeb_brain import research
        with tempfile.TemporaryDirectory() as tmp:
            runtime = Path(tmp)
            (runtime / "evaluation.json").write_text(json.dumps({"symbol": "SPY", "pipeline_version": data.PIPELINE_VERSION}))
            import numpy as np
            np.savez(runtime / "model.npz", pipeline_version=np.array(data.PIPELINE_VERSION))
            with patch.object(research, "RUNTIME", runtime):
                with self.assertRaisesRegex(ValueError, "trained on SPY"):
                    research.Predictor()


class CollectSymbolTests(unittest.TestCase):
    def test_bars_for_another_symbol_are_refused(self):
        with patch.object(data, "request", lambda path, body=None, token=None: {"symbol": "SPY", "bars": [], "next_page_token": None}):
            with self.assertRaisesRegex(ValueError, "expected MU"):
                data.fetch_bars(days=5)
