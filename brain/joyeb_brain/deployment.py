"""Authenticated, encrypted model snapshots for the GitHub runner.

Legacy snapshots contain five model files; SATS snapshots add an encrypted
historical seed needed for recursive state. Neither includes credentials,
status or the decision database. The key stays private in runtime/.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

from cryptography.fernet import Fernet, InvalidToken

FILES = ("model.npz", "evaluation.json", "graph.npz", "graph.json", "data.json")
ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 8 * 1024 * 1024
SATS_FILES = ("models.npz", "evaluation.json", "graph.npz", "graph.json", "data.json", "seed.csv")


def _strict_json(raw):
    def invalid(value):
        raise ValueError("Nonfinite JSON value in SATS snapshot")
    return json.loads(raw, parse_constant=invalid)


def _saved_arrays(raw):
    import numpy as np
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = archive.infolist()
        if (len(members) > 64 or sum(item.file_size for item in members) > MAX_BYTES * 4
                or any(not item.filename.endswith(".npy") or "/" in item.filename or "\\" in item.filename
                       for item in members)):
            raise ValueError("Invalid or oversized SATS model archive")
    with np.load(io.BytesIO(raw), allow_pickle=False) as stored:
        return {name: stored[name] for name in stored.files}


def validate_sats_files(files):
    """Validate frozen learned artifacts in memory, before any restore writes.

    The same validation is used by the runtime Predictor. It never reads a key,
    runs a neural circuit, retrains, publishes or authorizes an order.
    """
    from dataclasses import asdict
    import numpy as np
    import pandas as pd
    from .data import FEATURES, clean_bars
    from .sats import SatsConfig
    from .sats_research import ResearchPolicy
    from .sats_learning import (FLY_FEATURES, SIMPLE_FEATURES, PENALTY, THRESHOLD_NET_BPS,
                                MIN_TRAINING_SETUPS, FRESH_START, _hash, _timestamp)

    if not isinstance(files, dict) or set(files) != set(SATS_FILES):
        raise ValueError("SATS snapshot must contain exactly the six model files")
    if any(not isinstance(raw, bytes) for raw in files.values()) or sum(map(len, files.values())) > MAX_BYTES:
        raise ValueError("SATS model snapshot exceeds 8 MB")
    report = _strict_json(files["evaluation.json"])
    data, graph = _strict_json(files["data.json"]), _strict_json(files["graph.json"])
    if not all(isinstance(value, dict) for value in (report, data, graph)):
        raise ValueError("SATS metadata must be objects")
    if not isinstance(report.get("data"), dict):
        raise ValueError("Missing SATS source metadata")
    if (report.get("schema") != 3 or report.get("strategy") != "sats-learning"
            or report.get("symbol") != "MU" or report.get("timeframe") != "15Min"
            or report.get("paper_ready") is not False or data.get("symbol") != "MU"
            or data.get("timeframe") != "15Min"):
        raise ValueError("SATS snapshot must be a paused MU 15-minute research model")
    arrays = _saved_arrays(files["models.npz"])
    fields = {"model_id", "status", "graph_hash", "penalty", "threshold_net_bps", "feature_names",
              "simple_feature_names", "fly_feature_names", "settings_json", "training_start", "training_end",
              "training_boundary", "training_data_sha256", "data_sha256", "training_indices", "input_mean",
              "input_scale", "scaler_sha256", "coefficients_sha256"}
    fields.update(f"{arm}_{name}" for arm in ("simple", "fly") for name in ("mean", "scale", "coef", "intercept"))
    if set(arrays) != fields:
        raise ValueError("SATS saved model fields do not match the frozen schema")

    def scalar(name):
        value = arrays[name]
        if value.shape != ():
            raise ValueError(f"Invalid SATS model scalar: {name}")
        return value.item()

    def vector(name, length, positive=False):
        value = arrays[name]
        if value.shape != (length,) or value.dtype.kind not in "fiu" or not np.isfinite(value).all():
            raise ValueError(f"Invalid SATS model vector: {name}")
        if positive and not (value > 0).all():
            raise ValueError(f"SATS scale must be positive: {name}")
        return value.tolist()

    settings = {"indicator": asdict(SatsConfig()),
                "execution": {**asdict(ResearchPolicy()), "entry_clock_timezone": "America/New_York"},
                "learning": {"penalty": PENALTY, "threshold_net_bps": THRESHOLD_NET_BPS,
                             "min_training_setups": MIN_TRAINING_SETUPS, "distribution_limit_std": 6,
                             "fly_input_clip_std": 3, "target": "net_pnl / filled_entry_price * 10000"}}
    # JSON normalizes dataclass tuples to the stored numeric arrays.
    settings = json.loads(json.dumps(settings, allow_nan=False))
    if report.get("settings") != settings or _strict_json(scalar("settings_json")) != settings:
        raise ValueError("SATS settings changed; evaluate a new frozen model separately")
    expected_features = {"simple": SIMPLE_FEATURES, "fly": FLY_FEATURES, "fly_inputs": FEATURES}
    if (report.get("features") != expected_features or list(arrays["feature_names"]) != FEATURES
            or list(arrays["simple_feature_names"]) != SIMPLE_FEATURES
            or list(arrays["fly_feature_names"]) != FLY_FEATURES):
        raise ValueError("SATS feature schema does not match")
    if scalar("penalty") != PENALTY or scalar("threshold_net_bps") != THRESHOLD_NET_BPS:
        raise ValueError("SATS learned threshold or penalty changed")
    training, evaluation = report.get("training"), report.get("evaluation")
    if not isinstance(training, dict) or not isinstance(evaluation, dict):
        raise ValueError("Missing SATS training/evaluation metadata")
    model = training.get("model")
    if (training.get("status") != "fitted" or scalar("status") != "fitted"
            or not isinstance(model, dict) or model.get("status") != "fitted"
            or type(training.get("setups")) is not int or training["setups"] < MIN_TRAINING_SETUPS
            or model.get("training_setups") != training["setups"] or evaluation.get("kind") != "fresh"):
        raise ValueError("SATS deployment requires a fitted, chronologically tested model")
    boundary = _timestamp(evaluation["start"])
    if (boundary < _timestamp(FRESH_START) or _timestamp(evaluation["fresh_training_cutoff"]) != boundary
            or _timestamp(training["start"]) > _timestamp(training["end"])
            or _timestamp(training["end"]) >= boundary or _timestamp(evaluation["end"]) <= boundary):
        raise ValueError("SATS training/test dates do not preserve the frozen boundary")
    for field in ("start", "end"):
        if scalar("training_" + field) != training[field]:
            raise ValueError("SATS saved training dates do not match")
    if _timestamp(scalar("training_boundary")) != boundary:
        raise ValueError("SATS saved training boundary does not match")
    indices = arrays["training_indices"]
    if (indices.ndim != 1 or indices.dtype.kind not in "iu" or len(indices) != training["setups"]
            or (indices < 0).any() or len(np.unique(indices)) != len(indices)
            or indices.tolist() != model.get("training_indices")):
        raise ValueError("SATS training setup indices do not match")
    for name in ("input_mean", "input_scale"):
        if vector(name, 6, positive=name.endswith("scale")) != model.get(name):
            raise ValueError("SATS input scalers do not match the evaluation")
    for arm, length in (("simple", 12), ("fly", 38)):
        if not isinstance(model.get(arm), dict):
            raise ValueError("Missing SATS fitted readout")
        for name in ("mean", "scale", "coef"):
            if vector(f"{arm}_{name}", length, positive=name == "scale") != model[arm].get(name):
                raise ValueError("SATS fitted readout does not match the evaluation")
        intercept = scalar(f"{arm}_intercept")
        if type(intercept) not in (int, float) or not np.isfinite(intercept) or intercept != model[arm].get("intercept"):
            raise ValueError("Invalid SATS readout intercept")
    if (model["input_mean"] != model["simple"]["mean"][:6]
            or model["input_scale"] != model["simple"]["scale"][:6]):
        raise ValueError("SATS fly-input scalers must come from the same historical setups")
    scaler_hash = _hash([model["input_mean"], model["input_scale"], model["simple"]["mean"], model["simple"]["scale"]])
    coefficient_hash = _hash([model["simple"], model["fly"]])
    if (model.get("scaler_sha256") != scaler_hash or scalar("scaler_sha256") != scaler_hash
            or model.get("coefficients_sha256") != coefficient_hash
            or scalar("coefficients_sha256") != coefficient_hash):
        raise ValueError("SATS fitted coefficient/scaler hash does not match")
    graph_hash = hashlib.sha256(files["graph.npz"]).hexdigest()
    if (graph.get("graph_sha256") != graph_hash or scalar("graph_hash") != graph_hash
            or model.get("graph_hash") != graph_hash):
        raise ValueError("SATS graph and frozen model do not match")
    circuit = _saved_arrays(files["graph.npz"])
    if set(circuit) != {"ids", "pre", "post", "weight"}:
        raise ValueError("SATS graph arrays do not match the circuit schema")
    ids, pre, post, weights = (circuit[name] for name in ("ids", "pre", "post", "weight"))
    if (ids.ndim != 1 or ids.dtype.kind not in "iu" or len(ids) <= 12
            or len(np.unique(ids)) != len(ids) or pre.ndim != 1 or post.ndim != 1 or weights.ndim != 1
            or pre.dtype.kind not in "iu" or post.dtype.kind not in "iu" or weights.dtype.kind not in "fiu"
            or len(pre) != len(post) or len(pre) != len(weights) or not np.isfinite(weights).all()
            or (pre < 0).any() or (post < 0).any() or (pre >= len(ids)).any() or (post >= len(ids)).any()
            or graph.get("neurons") != len(ids) or graph.get("connection_rows") != len(pre)
            or graph.get("readout_groups") != 32 or graph.get("input_neurons") != 12):
        raise ValueError("SATS graph shape, metadata or weights are invalid")
    seed_hash = hashlib.sha256(files["seed.csv"]).hexdigest()
    if (data.get("sha256", data.get("csv_sha256")) != seed_hash
            or ("csv_sha256" in data and data["csv_sha256"] != seed_hash)
            or scalar("data_sha256") != seed_hash
            or report.get("data", {}).get("sha256") != seed_hash):
        raise ValueError("SATS seed and source data hashes do not match")
    frame = clean_bars(pd.read_csv(io.BytesIO(files["seed.csv"])), require_offset=True,
                       now=_timestamp(evaluation["end"]))
    if (len(frame) != data.get("rows") or len(frame) != report["data"].get("rows")
            or frame.time.iloc[0].isoformat() != report["data"].get("first")
            or frame.time.iloc[-1].isoformat() != report["data"].get("last")
            or frame.time.iloc[0].isoformat() != data.get("first")
            or frame.time.iloc[-1].isoformat() != data.get("last") or (indices >= len(frame)).any()):
        raise ValueError("SATS seed rows/dates do not match the evaluation")
    if (frame.time.iloc[indices].ge(boundary).any()
            or frame.time.iloc[indices[0]].isoformat() != training["start"]):
        raise ValueError("SATS training setups cross the frozen evaluation boundary")
    # Historical clean_bars chose CSV columns through a set. Its frozen hash
    # depends on that process's column order, so keep the recorded identity;
    # source provenance is independently checked against the exact seed bytes.
    train_hash = training.get("data_sha256", "")
    if not re.fullmatch(r"[a-f0-9]{64}", train_hash) or scalar("training_data_sha256") != train_hash:
        raise ValueError("SATS historical training data hash does not match")
    model_id = _hash({"settings": settings, "model": model, "training_data_sha256": train_hash,
                      "training_boundary": boundary.isoformat(), "simple_features": SIMPLE_FEATURES,
                      "fly_features": FLY_FEATURES})[:16]
    if (not re.fullmatch(r"[a-f0-9]{16}", report.get("model_id", ""))
            or report["model_id"] != model_id or scalar("model_id") != model_id):
        raise ValueError("SATS frozen model identity does not match")
    return files


def encode_sats_snapshot(runtime):
    runtime = Path(runtime)
    paths = {name: runtime / "sats-learning" / name for name in SATS_FILES}
    paths.update({"graph.npz": runtime / "graph.npz", "graph.json": runtime / "graph.json",
                  "seed.csv": runtime / "sats-learning" / "data.csv"})
    files, total = {}, 0
    for name, path in paths.items():
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BYTES:
            raise ValueError("SATS model files must be regular files smaller than 8 MB")
        files[name] = path.read_bytes()
        total += len(files[name])
        if total > MAX_BYTES:
            raise ValueError("SATS model snapshot exceeds 8 MB")
    validate_sats_files(files)
    return json.dumps({"schema": 2, "strategy": "sats-learning",
                       "sha256": {name: hashlib.sha256(raw).hexdigest() for name, raw in files.items()},
                       "files": {name: base64.b64encode(raw).decode("ascii") for name, raw in files.items()}},
                      separators=(",", ":"), allow_nan=False).encode()


def validate_sats_snapshot(payload):
    if len(payload) > MAX_BYTES * 2:
        raise ValueError("SATS model snapshot is too large")
    value = _strict_json(payload)
    if (not isinstance(value, dict) or set(value) != {"schema", "strategy", "sha256", "files"}
            or value["schema"] != 2 or value["strategy"] != "sats-learning"
            or not isinstance(value["files"], dict) or not isinstance(value["sha256"], dict)
            or set(value["files"]) != set(SATS_FILES) or set(value["sha256"]) != set(SATS_FILES)):
        raise ValueError("SATS snapshot must contain exactly the six model files")
    files = {name: base64.b64decode(raw, validate=True) for name, raw in value["files"].items()}
    if any(hashlib.sha256(raw).hexdigest() != value["sha256"][name] for name, raw in files.items()):
        raise ValueError("SATS snapshot file hash does not match")
    return validate_sats_files(files)


def export_sats_snapshot(runtime, destination, key_file):
    payload = encode_sats_snapshot(runtime)
    key_file, destination = Path(key_file), Path(destination)
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if key_file.exists():
        key = key_file.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        with key_file.open("xb") as stream:
            stream.write(key + b"\n")
        key_file.chmod(0o600)
    encrypted = Fernet(key).encrypt(payload)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(encrypted)
    temporary.replace(destination)
    return 2


def restore_sats_snapshot(bundle, key, runtime):
    bundle = Path(bundle)
    if bundle.stat().st_size > MAX_BYTES * 3:
        raise ValueError("Encrypted SATS snapshot is too large")
    try:
        payload = Fernet(key.encode() if isinstance(key, str) else key).decrypt(bundle.read_bytes())
    except (InvalidToken, ValueError):
        raise ValueError("SATS model bundle could not be unlocked; check BRAIN_MODEL_KEY") from None
    files = validate_sats_snapshot(payload)
    runtime = Path(runtime)
    for name in SATS_FILES:
        if (runtime / name).is_symlink():
            raise ValueError("Refusing a symbolic link in the SATS model destination")
    runtime.mkdir(parents=True, exist_ok=True)
    for name, raw in files.items():
        (runtime / name).write_bytes(raw)
    return _strict_json(files["evaluation.json"])["model_id"]


def encode_snapshot(runtime):
    files = {}
    total = 0
    for name in FILES:
        path = Path(runtime) / name
        if path.is_symlink() or path.stat().st_size > MAX_BYTES:
            raise ValueError("Model files must be regular files smaller than 8 MB")
        raw = path.read_bytes()
        total += len(raw)
        if total > MAX_BYTES:
            raise ValueError("Model snapshot exceeds 8 MB")
        files[name] = base64.b64encode(raw).decode("ascii")
    payload = json.dumps({"schema": 1, "files": files}, separators=(",", ":")).encode()
    validate_snapshot(payload)
    return payload


def validate_snapshot(payload):
    if len(payload) > MAX_BYTES * 2:
        raise ValueError("Model snapshot is too large")
    value = json.loads(payload)
    if not isinstance(value, dict) or value.get("schema") != 1 or not isinstance(value.get("files"), dict):
        raise ValueError("Unsupported model snapshot")
    if set(value["files"]) != set(FILES):
        raise ValueError("Snapshot must contain exactly the five model files")
    files = {name: base64.b64decode(value["files"][name], validate=True) for name in FILES}
    if sum(map(len, files.values())) > MAX_BYTES:
        raise ValueError("Model snapshot exceeds 8 MB")
    report = json.loads(files["evaluation.json"])
    graph = json.loads(files["graph.json"])
    data = json.loads(files["data.json"])
    model_hash = hashlib.sha256(files["model.npz"]).hexdigest()[:16]
    graph_hash = hashlib.sha256(files["graph.npz"]).hexdigest()
    if report.get("model_id") != model_hash:
        raise ValueError("Model and evaluation do not match")
    if graph.get("graph_sha256") != graph_hash or report.get("graph", {}).get("graph_sha256") != graph_hash:
        raise ValueError("Graph and evaluation do not match")
    if report.get("symbol") != data.get("symbol") or report.get("symbol") != "MU":
        raise ValueError("Snapshot must be for MU")
    return files


def export_snapshot(runtime, destination, key_file):
    payload = encode_snapshot(runtime)
    key_file, destination = Path(key_file), Path(destination)
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if key_file.exists():
        key = key_file.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        # Exclusive creation avoids replacing a key another export just wrote.
        with key_file.open("xb") as stream:
            stream.write(key + b"\n")
        key_file.chmod(0o600)
    encrypted = Fernet(key).encrypt(payload)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(encrypted)
    temporary.replace(destination)
    return json.loads(payload)["schema"]


def restore_snapshot(bundle, key, runtime):
    bundle = Path(bundle)
    if bundle.stat().st_size > MAX_BYTES * 3:
        raise ValueError("Encrypted snapshot is too large")
    try:
        payload = Fernet(key.encode() if isinstance(key, str) else key).decrypt(bundle.read_bytes())
    except (InvalidToken, ValueError):
        raise ValueError("Model bundle could not be unlocked; check BRAIN_MODEL_KEY") from None
    files = validate_snapshot(payload)  # Validate everything before writing anything.
    runtime = Path(runtime)
    runtime.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        target = runtime / name
        if target.is_symlink():
            raise ValueError("Refusing a symbolic link in the model destination")
    for name, raw in files.items():
        (runtime / name).write_bytes(raw)
    return json.loads(files["evaluation.json"])["model_id"]


def main():
    parser = argparse.ArgumentParser(description="Package the current model for GitHub; never prints the key")
    parser.add_argument("--strategy", choices=("legacy", "sats-learning"), default="legacy")
    args = parser.parse_args()
    key_file = ROOT / "runtime/github-model.key"
    destination = ROOT / "deployment" / ("sats-model.fernet" if args.strategy == "sats-learning" else "model.fernet")
    exporter = export_sats_snapshot if args.strategy == "sats-learning" else export_snapshot
    exporter(ROOT / "runtime", destination, key_file)
    print(f"Encrypted snapshot saved: deployment/{destination.name}")
    print("Private key saved: runtime/github-model.key (Git-ignored; never commit it)")
    print("Add its value as the BRAIN_MODEL_KEY Actions secret. The key is not printed.")


if __name__ == "__main__":
    main()
