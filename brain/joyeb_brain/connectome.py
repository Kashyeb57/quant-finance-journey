"""Measured FlyWire v630 subgraph; LIF parameters adapted from Shiu/Spiller.

The market input mapping and pooled readout are engineering choices, not a
claim about a biological fly understanding markets. See THIRD_PARTY.md.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .data import RUNTIME, atomic_json

SUGAR_IDS = [720575940624963786, 720575940630233916, 720575940637568838,
             720575940638202345, 720575940617000768, 720575940630797113,
             720575940632889389, 720575940621754367, 720575940621502051,
             720575940640649691, 720575940639332736, 720575940616885538]


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def prepare(folder, size=512):
    folder = Path(folder)
    comp_path = folder / "2023_03_23_completeness_630_final.csv"
    con_path = folder / "2023_03_23_connectivity_630_final.parquet"
    comp = pd.read_csv(comp_path, index_col=0)
    con = pd.read_parquet(con_path, columns=["Presynaptic_Index", "Postsynaptic_Index", "Excitatory x Connectivity"])
    lookup = {int(fid): i for i, fid in enumerate(comp.index)}
    seeds = [lookup[fid] for fid in SUGAR_IDS]
    chosen = set(seeds)
    frontier = set(seeds)
    # Deterministic outgoing breadth-first expansion ranked by measured contact
    # weight. Retain all measured edges between selected neurons, including
    # inhibition; never invent or rewire edges.
    while len(chosen) < size and frontier:
        outgoing = con[con.Presynaptic_Index.isin(frontier)]
        score = outgoing.assign(strength=outgoing["Excitatory x Connectivity"].abs()).groupby("Postsynaptic_Index").strength.sum()
        ranked = sorted(((int(i), float(w)) for i, w in score.items() if int(i) not in chosen), key=lambda x: (-x[1], x[0]))
        frontier = {i for i, _ in ranked[:size - len(chosen)]}
        chosen.update(frontier)
    indices = np.array(seeds + sorted(chosen - set(seeds)), dtype=np.int64)
    mapping = {int(old): new for new, old in enumerate(indices)}
    edges = con[con.Presynaptic_Index.isin(chosen) & con.Postsynaptic_Index.isin(chosen)]
    path = RUNTIME / "graph.npz"
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, ids=comp.index.to_numpy(dtype=np.int64)[indices],
                        pre=edges.Presynaptic_Index.map(mapping).to_numpy(dtype=np.int32),
                        post=edges.Postsynaptic_Index.map(mapping).to_numpy(dtype=np.int32),
                        weight=edges["Excitatory x Connectivity"].to_numpy(dtype=float))
    meta = {"neurons": len(indices), "connection_rows": len(edges), "input_neurons": len(seeds),
            "readout_groups": 32, "graph_sha256": digest(path), "source": "FlyWire v630",
            "source_connectivity_sha256": digest(con_path),
            "source_neurons_sha256": digest(comp_path),
            "selection": "Outgoing breadth-first expansion, absolute-weight ranked; measured edges retained",
            "model": "Reduced LIF circuit, not a whole-brain simulation",
            "input_mapping": "Six normalized market features; positive/negative channels into 12 selected neurons"}
    atomic_json(RUNTIME / "graph.json", meta)
    return meta


class FlyFeatures:
    def __init__(self, path=None):
        import brian2 as b
        b.prefs.codegen.target = "numpy"
        b.start_scope()
        self.b = b
        path = Path(path or RUNTIME / "graph.npz")
        self.graph_hash = digest(path)
        with np.load(path, allow_pickle=False) as stored:
            g = {name: stored[name] for name in stored.files}
        self.size = len(g["ids"])
        if self.size <= 12:
            raise ValueError("Graph has no downstream neurons")
        # Published uniform LIF constants and signed synaptic weights.
        self.neurons = b.NeuronGroup(self.size,
            "dv/dt = (-52*mV - v + g)/(20*ms) : volt (unless refractory)\n"
            "dg/dt = -g/(5*ms) : volt (unless refractory)\n"
            "rfc : second", threshold="v > -45*mV", reset="v = -52*mV; g = 0*mV",
            refractory="rfc", method="linear")
        self.neurons.v = -52 * b.mV
        self.neurons.rfc = 2.2 * b.ms
        self.neurons.rfc[:12] = 0 * b.ms
        syn = b.Synapses(self.neurons, self.neurons, "w : volt", on_pre="g_post += w", delay=1.8*b.ms)
        syn.connect(i=g["pre"], j=g["post"])
        syn.w = g["weight"] * .275 * b.mV
        self.input = b.PoissonGroup(12, rates=0*b.Hz)
        drive = b.Synapses(self.input, self.neurons, on_pre="v_post += 68.75*mV")
        drive.connect(i=np.arange(12), j=np.arange(12))
        self.monitor = b.SpikeMonitor(self.neurons, record=False)
        self.net = b.Network(self.neurons, syn, self.input, drive, self.monitor)
        b.seed(42)
        self.net.store("initial")

    def transform(self, normalized, progress=None):
        output = []
        for k, row in enumerate(normalized):
            self.net.restore("initial", restore_random_state=True)
            channels = np.column_stack((np.maximum(row, 0), np.maximum(-row, 0))).ravel()
            self.input.rates = (20 + 90 * np.clip(channels, 0, 3)) * self.b.Hz
            self.net.run(100 * self.b.ms)
            counts = np.asarray(self.monitor.count[:], dtype=float)[12:]
            groups = np.array_split(counts, 32)
            output.append([float(a.mean()) if len(a) else 0 for a in groups])
            if progress and ((k + 1) % 20 == 0 or k == len(normalized)-1):
                progress(k+1, len(normalized))
        return np.asarray(output)
