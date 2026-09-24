"""Local inference loop and read-only status server. Observation is the default."""
import copy
import hashlib
import json
import socket
import sqlite3
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .data import ORIGIN, RUNTIME, atomic_json, fetch_bars, request
from .research import Predictor

# A bar is used only 60 s after it ends, so late IEX prints for it have arrived.
# The website refuses orders for younger candles (bar start + 960 s).
SETTLE_SECONDS = 60
MIN_SIGNAL_AGE = 900 + SETTLE_SECONDS
# The website stores at most 100000 characters per report; stay well below it.
MAX_CURVE_POINTS = 240
MAX_REPORT_CHARS = 90000


def fresh(signal, now=None):
    now = now or datetime.now(timezone.utc)
    bar = datetime.fromisoformat(signal["bar_time"])
    age = (now-bar).total_seconds()
    return MIN_SIGNAL_AGE <= age <= (1800 if signal.get("target_position") == 0 else 1200)


def status():
    path = RUNTIME / "status.json"
    try:
        return json.loads(path.read_text()) if path.exists() else {"mode": "observe", "event": "Runner not started"}
    except (OSError, ValueError):
        # Mid-replace on Windows, or a half-written file: report that, never crash.
        return {"mode": "unknown", "event": "Status is being updated; try again in a moment"}


def window_key(completed):
    """Latest complete bar plus a hash of the bars its features read.

    A revised bar (late prints) changes the key, so the signal is recomputed
    instead of reusing a forecast made from the earlier data.
    """
    tail = completed.tail(20)[["time", "open", "high", "low", "close", "volume"]]
    digest = hashlib.sha256(tail.to_json(date_format="iso").encode()).hexdigest()[:16]
    return f"{completed.time.iloc[-1].isoformat()}|{digest}"


def thin(curve, limit=MAX_CURVE_POINTS):
    if len(curve) <= limit:
        return curve
    step = (len(curve) - 1) / (limit - 1)
    return [curve[round(i * step)] for i in range(limit)]


def publishable(state):
    """The report as published: long equity curves are thinned, and dropped if still too big."""
    report = copy.deepcopy(state)
    metrics = (report.get("evaluation") or {}).get("metrics") or {}
    curves = [m for m in metrics.values() if isinstance(m, dict) and isinstance(m.get("curve"), list)]
    if any(len(m["curve"]) > MAX_CURVE_POINTS for m in curves):
        for m in curves:
            m["curve"] = thin(m["curve"])
        report["evaluation"]["curves_thinned"] = True
    if len(json.dumps(report, allow_nan=False)) > MAX_REPORT_CHARS:
        for m in curves:
            m.pop("curve", None)
        report["evaluation"]["curves_omitted"] = True
    return report


def run_loop(stop, token=None, paper=False, once=False, predictor=None, clock=None):
    clock = clock or (lambda: datetime.now(timezone.utc))
    if paper and not token:
        raise ValueError("Paper mode needs the existing owner token, entered privately at the prompt")
    predictor = predictor or Predictor()
    db = sqlite3.connect(RUNTIME / "runner.sqlite")
    db.execute("CREATE TABLE IF NOT EXISTS decisions (bar_time TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL)")
    db.commit()
    cached, cached_key = None, None
    while not stop.is_set():
        state = {"mode": "paper" if paper else "observe", "evaluation": predictor.report,
                 "signal": cached, "event": "Waiting for completed market data", "error": None}
        try:
            # Settling is judged at the moment the data was requested; a slow
            # download must not make a bar look older than its data is.
            fetched_at = clock()
            bars, _ = fetch_bars(days=7)
            # Both legacy and new historical sources can return an in-progress
            # bar. Predictor filters it before computing any feature.
            from .data import clean_bars
            import pandas as pd
            now = clock()
            completed = clean_bars(pd.DataFrame(bars), now=fetched_at, settle_seconds=SETTLE_SECONDS, strict=False)
            if completed.attrs.get("dropped_invalid"):
                print(f"Ignored {completed.attrs['dropped_invalid']} invalid bar(s) in the download", flush=True)
            key = window_key(completed)
            if cached is None or key != cached_key:
                cached = predictor.signal(bars, now=fetched_at, settle_seconds=SETTLE_SECONDS, strict=False)
                cached_key = key
            state["signal"] = cached
            if not fresh(cached, now):
                state["event"] = "Waiting for a fresh completed bar (market may be closed)"
            elif not cached["distribution_ok"]:
                state["event"] = cached.get("reason", "Entry blocked; target flat")
            else:
                payload = json.dumps(cached, allow_nan=False)
                result = db.execute("INSERT OR IGNORE INTO decisions VALUES (?,?,?)",
                                    (cached["bar_time"], payload, datetime.now(timezone.utc).isoformat()))
                db.commit()
                state["event"] = "Signal recorded" if result.rowcount else "Already processed this bar"
            if token:
                request("/_m/brain/report", publishable(state), token)
                entry_ok = predictor.report["paper_ready"] and cached["distribution_ok"]
                if paper and fresh(cached, now) and (cached["target_position"] == 0 or entry_ok):
                    control = request("/_m/brain/control", token=token)
                    if control.get("enabled"):
                        # Server-side candle claims remain authoritative across
                        # restarts, concurrent runners, timeouts, and retries.
                        reply = request("/_m/brain/order", cached, token)
                        state["event"] = f"Paper execution: {reply.get('action', 'hold')}"
                    else:
                        state["event"] = "Paper automation is paused on the website"
                elif paper:
                    state["event"] = "Orders blocked: evaluation, freshness, or input-range check"
        except Exception as exc:
            state["error"] = f"{type(exc).__name__}: {exc}"
            state["event"] = ("Error this cycle; retrying in 30 s. A fresh candle may be requested again; "
                              "the website refuses duplicates.")
        if token:
            try:
                request("/_m/brain/report", publishable(state), token)
            except Exception as exc:
                state["error"] = f"Status publish failed: {exc}"
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            atomic_json(RUNTIME / "status.json", state)
        except OSError as exc:
            print(f"Could not write status.json this cycle: {exc}", flush=True)
        print(state["event"], state.get("error") or "", flush=True)
        if once:
            break
        stop.wait(30)
    db.close()


class StatusServer(ThreadingHTTPServer):
    # Never share the port: on Windows SO_REUSEADDR lets a second runner bind the
    # same port silently, and requests would go to either one.
    allow_reuse_address = False

    def server_bind(self):
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def make_handler(port, allowed=None):
    allowed = allowed or {ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"}

    class Handler(BaseHTTPRequestHandler):
        def respond(self, code, payload):
            self.send_response(code)
            origin = self.headers.get("Origin")
            if origin in allowed:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(payload, allow_nan=False).encode())

        def do_OPTIONS(self):
            self.respond(200, {})

        def do_GET(self):
            # Fixed loopback binding + Host check prevents DNS-rebinding reads.
            if self.headers.get("Host") not in {f"127.0.0.1:{port}", f"localhost:{port}"}:
                return self.respond(403, {"error": "invalid_host"})
            if self.headers.get("Origin") and self.headers["Origin"] not in allowed:
                return self.respond(403, {"error": "invalid_origin"})
            if self.path != "/status":
                return self.respond(404, {"error": "not_found"})
            self.respond(200, status())

        def log_message(self, *args):
            pass

    return Handler


def make_server(port):
    try:
        return StatusServer(("127.0.0.1", port), make_handler(port))
    except OSError as exc:
        raise SystemExit(f"Port {port} is already in use; another runner may be running. "
                         f"Stop it first or choose --port. ({exc})") from None


def serve(port=8767, token=None, paper=False):
    stop = threading.Event()
    # Validate before presenting a listening service to the user.
    for name in ["model.npz", "evaluation.json", "graph.npz"]:
        if not (RUNTIME / name).exists():
            raise ValueError("Train a model before starting the runner")
    predictor = Predictor()  # Fail synchronously on model/graph/schema mismatch.
    server = make_server(port)
    thread = threading.Thread(target=run_loop, args=(stop, token, paper), kwargs={"predictor": predictor}, daemon=True)
    thread.start()
    print(f"Local status: http://127.0.0.1:{port}/status — mode: {'paper' if paper else 'observe'}", flush=True)
    try:
        server.serve_forever(poll_interval=.5)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()
        thread.join(timeout=35)
