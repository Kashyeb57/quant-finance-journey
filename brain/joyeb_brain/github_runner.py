"""One non-interactive GitHub Actions cycle; no local terminal or server."""
import os
import sys
import threading

from .data import RUNTIME
from .deployment import ROOT, restore_snapshot, restore_sats_snapshot
from .runner import run_loop


def secret(name):
    value = os.environ.pop(name, "").strip()
    if not value or "\n" in value or "\r" in value:
        raise ValueError(f"Set the {name} GitHub Actions secret")
    return value


def run_job():
    # This entry point restores into the ephemeral runner directory. Refuse to
    # overwrite a local research folder when invoked by mistake on a laptop.
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise ValueError("This command is for GitHub Actions; use the normal run command locally")
    mode = os.environ.get("BRAIN_RUN_MODE", "observe")
    if mode not in {"observe", "paper"}:
        raise ValueError("BRAIN_RUN_MODE must be observe or paper")
    strategy = os.environ.get("BRAIN_STRATEGY", "sats-learning")
    if strategy not in {"legacy", "sats-learning"}:
        raise ValueError("BRAIN_STRATEGY must be legacy or sats-learning")
    if strategy == "sats-learning" and mode != "observe":
        raise ValueError("SATS learning is observation only; BRAIN_RUN_MODE must be observe")
    key = secret("BRAIN_MODEL_KEY")
    token = secret("BRAIN_OWNER_TOKEN")
    if strategy == "sats-learning":
        restore_sats_snapshot(ROOT / "deployment/sats-model.fernet", key, RUNTIME / "sats-learning")
    else:
        restore_snapshot(ROOT / "deployment/model.fernet", key, RUNTIME)
    del key
    # Predictor validates model schema, hashes, feature names and symbol before
    # any report/order. The existing Worker owns durable order deduplication.
    arguments = {"paper": mode == "paper", "once": True, "runner_kind": "github-actions"}
    if strategy == "sats-learning":
        from .sats_runner import SatsPredictor
        arguments["predictor"] = SatsPredictor(RUNTIME / "sats-learning")
    result = run_loop(threading.Event(), token, **arguments)
    if not result or result.get("error"):
        # The existing loop already emitted a sanitized error. Make CI red,
        # instead of reporting a successful job when publication failed.
        raise RuntimeError("Brain cycle failed; inspect the sanitized cycle log")
    print("GitHub Brain cycle completed; report published to the website.")


def main():
    try:
        run_job()
    except Exception as exc:
        # Do not dump environment variables or a traceback carrying arguments.
        print(f"GitHub Brain stopped: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
