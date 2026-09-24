import argparse
import getpass
import json
import re
import threading
from pathlib import Path

from .data import RUNTIME, atomic_json, clean_bars, collect, request


def neuron_count(text):
    value = int(text)
    if not 64 <= value <= 4096:
        raise argparse.ArgumentTypeError("choose between 64 and 4096 neurons")
    return value


def client_id(text):
    if not re.fullmatch(r"joyeb-fly-SPY-\d+", text):
        raise argparse.ArgumentTypeError("expected an order id like joyeb-fly-SPY-1758650400")
    return text


def main():
    parser = argparse.ArgumentParser(description="Joyeb fly-connectome research and paper runner")
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare", help="Extract measured subgraph from the downloaded research repository")
    prep.add_argument("--connectome", type=Path, default=Path.home()/"Documents"/"FlyBrain"/"Drosophila_brain_model")
    prep.add_argument("--neurons", type=neuron_count, default=512, help="64-4096 (default 512)")
    get = sub.add_parser("collect", help="Download actual SPY IEX bars through the existing website")
    get.add_argument("--days", type=int, default=120)
    imp = sub.add_parser("import", help="Import an actual SPY 15-minute OHLCV CSV")
    imp.add_argument("file", type=Path)
    sub.add_parser("train", help="Train and evaluate using purged chronological partitions")
    sub.add_parser("status", help="Print latest local run status")
    run = sub.add_parser("run", help="Run the local service; observation is the default")
    run.add_argument("--once", action="store_true")
    run.add_argument("--publish", action="store_true", help="Prompt privately for the existing owner token and publish status")
    run.add_argument("--paper", action="store_true", help="Allow paper requests ONLY when website control and evaluation also allow them")
    run.add_argument("--port", type=int, default=8767)
    res = sub.add_parser("resolve", help="Owner only: settle one uncertain automated order from the broker's records")
    res.add_argument("client_id", type=client_id)
    args = parser.parse_args()
    if args.command == "prepare":
        from .connectome import prepare
        print(json.dumps(prepare(args.connectome, args.neurons), indent=2))
    elif args.command == "collect":
        if not 1 <= args.days <= 365:
            parser.error("days must be between 1 and 365")
        print(json.dumps(collect(args.days), indent=2))
    elif args.command == "import":
        import pandas as pd
        frame = clean_bars(pd.read_csv(args.file), require_offset=True)
        from .data import EARLY_CLOSES_FROM, EARLY_CLOSES_TO
        days = frame.time.dt.tz_convert("America/New_York").dt.strftime("%Y-%m-%d")
        outside = int(((days < EARLY_CLOSES_FROM) | (days > EARLY_CLOSES_TO)).sum())
        if outside:
            print(f"Warning: {outside} bars fall outside {EARLY_CLOSES_FROM}..{EARLY_CLOSES_TO}, where NYSE early-close "
                  "days are not filtered; after-hours bars on those days would be treated as regular session.")
        RUNTIME.mkdir(parents=True, exist_ok=True)
        frame.to_csv(RUNTIME/"bars.csv", index=False)
        atomic_json(RUNTIME/"data.json", {"source": "User-provided SPY 15-minute CSV", "rows": len(frame),
                                         "first": frame.time.iloc[0].isoformat(), "last": frame.time.iloc[-1].isoformat()})
        print(f"Imported {len(frame)} completed bars")
    elif args.command == "train":
        from .research import train
        train()
    elif args.command == "resolve":
        token = getpass.getpass("Existing website owner trade token (never saved): ")
        if not token:
            parser.error("An owner token is required to resolve an order")
        print(json.dumps(request("/_m/brain/resolve", {"client_id": args.client_id}, token), indent=2))
    elif args.command == "status":
        from .runner import status
        print(json.dumps(status(), indent=2))
    elif args.command == "run":
        from .runner import run_loop, serve
        token = getpass.getpass("Existing website owner trade token (never saved): ") if args.publish or args.paper else None
        if (args.publish or args.paper) and not token:
            parser.error("An owner token is required for publishing or paper mode")
        if args.once:
            run_loop(threading.Event(), token, args.paper, once=True)
        else:
            serve(args.port, token, args.paper)


if __name__ == "__main__":
    main()
