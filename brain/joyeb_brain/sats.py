"""Causal research port of SATS v1.12.0 (WillyAlgoTrader, owner-supplied Pine).

Signals and diagnostics only: this module cannot publish or submit orders.
Default auto-calibration is OFF, as in the supplied indicator. Pine parity is
not certified until compared against TradingView exports on identical OHLCV.
"""
from dataclasses import asdict, dataclass, replace
import math

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class SatsConfig:
    atr_length: int = 14
    band_width: float = 2.0
    er_length: int = 20
    atr_baseline: int = 100
    rsi_length: int = 14
    rsi_memory: int = 20
    volume_length: int = 20
    pivot_length: int = 3
    structure_length: int = 20
    momentum_length: int = 10
    source: str = "close"
    adaptive: bool = True
    adaptation_strength: float = 0.5
    quality: bool = True
    quality_strength: float = 0.4
    quality_power: float = 1.5
    smooth: bool = True
    asymmetric: bool = True
    asymmetry_strength: float = 0.5
    efficiency_atr: bool = True
    character_flip: bool = True
    character_age: int = 5
    character_high: float = 0.55
    character_low: float = 0.25
    weights: tuple = (0.35, 0.20, 0.25, 0.20)
    score_structure: bool = True
    score_rsi: bool = True
    score_volume: bool = True
    rsi_overbought: float = 70.0
    rsi_oversold: float = 30.0
    stop_buffer: float = 1.5
    stop_cap: float = 4.0
    targets: tuple = (1.0, 2.0, 3.0)
    target_mode: str = "Fixed"
    target_weights: tuple = (0.6, 0.4)
    target_scale_min: float = 0.5
    target_scale_max: float = 2.0
    target_floor: float = 0.5
    target_ceiling: float = 8.0
    timeout_bars: int = 100

    def __post_init__(self):
        for name, value in asdict(self).items():
            if isinstance(value, (float, int)) and not math.isfinite(value):
                raise ValueError(f"{name} must be finite")
        for name in ("atr_length", "er_length", "atr_baseline", "rsi_length", "rsi_memory",
                     "volume_length", "pivot_length", "structure_length", "momentum_length",
                     "character_age", "timeout_bars"):
            value = getattr(self, name)
            if type(value) is not int or not 1 <= value <= 500:
                raise ValueError(f"{name} must be an integer in 1..500")
        for name in ("adaptive", "quality", "smooth", "asymmetric", "efficiency_atr",
                     "character_flip", "score_structure", "score_rsi", "score_volume"):
            if type(getattr(self, name)) is not bool:
                raise ValueError(f"{name} must be boolean")
        for name in ("adaptation_strength", "quality_strength", "asymmetry_strength",
                     "character_high", "character_low"):
            if not 0 <= getattr(self, name) <= 1:
                raise ValueError(f"{name} must be in 0..1")
        if self.character_low >= self.character_high:
            raise ValueError("Character-flip low threshold must be below high")
        if not 1 <= self.quality_power <= 3 or min(self.band_width, self.stop_buffer, self.stop_cap) <= 0:
            raise ValueError("Band/stop settings must be positive; quality power must be 1..3")
        for values, length in ((self.weights, 4), (self.target_weights, 2), (self.targets, 3)):
            if len(values) != length or any(not math.isfinite(x) or x < 0 for x in values):
                raise ValueError("Invalid factor weights or targets")
        if min(self.targets) <= 0 or self.target_floor <= 0 or self.target_ceiling <= 0:
            raise ValueError("Targets must be positive")
        if not 0 < self.target_scale_min <= self.target_scale_max:
            raise ValueError("Target scale limits are out of order")
        if self.source not in {"close", "open", "hl2", "ohlc4"} or self.target_mode not in {"Fixed", "Dynamic"}:
            raise ValueError("Unsupported source or target mode")

    @classmethod
    def for_preset(cls, name="Auto", timeframe_minutes=15, **overrides):
        if name == "Auto":
            name = "Scalping" if timeframe_minutes <= 5 else "Default" if timeframe_minutes <= 240 else "Swing"
        presets = {"Scalping": (10, 1.5, 14, 9, 1.0), "Default": (14, 2.0, 20, 14, 1.5),
                   "Swing": (21, 2.5, 30, 21, 2.0), "Crypto 24/7": (14, 2.8, 20, 14, 2.5),
                   "Custom": (13, 2.0, 20, 14, 1.5)}
        if name not in presets:
            raise ValueError("Unknown SATS preset")
        atr, band, er, rsi, stop = presets[name]
        return replace(cls(atr_length=atr, band_width=band, er_length=er,
                           rsi_length=rsi, stop_buffer=stop), **overrides)

    @property
    def warmup(self):
        return max(50, max(self.atr_length, self.atr_baseline, self.er_length, self.rsi_length,
                           self.rsi_memory, self.volume_length, 2*self.pivot_length+1,
                           self.momentum_length, self.structure_length) + 10)


def wilder(values, length):
    """Pine-style RMA: SMA seed after length non-NA values, then alpha=1/length."""
    result = np.full(len(values), np.nan)
    seed, previous = [], None
    for i, value in enumerate(values):
        if not np.isfinite(value):
            if previous is not None:
                result[i] = previous
            continue
        if previous is None:
            seed.append(float(value))
            if len(seed) == length:
                previous = sum(seed)/length
        else:
            previous = (previous*(length-1) + float(value))/length
        if previous is not None:
            result[i] = previous
    return result


def validated_bars(frame):
    required = ["time", "open", "high", "low", "close", "volume"]
    if not set(required).issubset(frame.columns) or frame.empty:
        raise ValueError("Need nonempty, timestamped OHLCV bars")
    data = frame[required].copy()
    data["time"] = pd.to_datetime(data.time, utc=True, errors="raise")
    if data.time.isna().any() or not data.time.is_monotonic_increasing or data.time.duplicated().any():
        raise ValueError("Bars must have unique, increasing timestamps")
    numbers = data[required[1:]].to_numpy(dtype=float)
    if not np.isfinite(numbers).all() or (numbers[:, :4] <= 0).any() or (numbers[:, 4] < 0).any():
        raise ValueError("Prices must be positive and all OHLCV values finite")
    data[required[1:]] = numbers
    if ((data.high < data[["open", "close", "low"]].max(axis=1)) |
            (data.low > data[["open", "close", "high"]].min(axis=1))).any():
        raise ValueError("Inconsistent OHLC bounds")
    return data.reset_index(drop=True)


def calculate_sats(frame, config=None):
    """One observation per completed input bar. No future prices or grade filters.

    Pivots become available only after pivot_length right-hand bars. Source
    score/RSI/volume options are diagnostics, not extra entry requirements.
    """
    cfg = config or SatsConfig()
    out = validated_bars(frame)
    close, high, low = out.close, out.high, out.low
    source = {"close": close, "open": out.open, "hl2": (high+low)/2,
              "ohlc4": (out.open+high+low+close)/4}[cfg.source]
    previous_close = close.shift(1)
    tr = pd.concat([high-low, (high-previous_close).abs(), (low-previous_close).abs()], axis=1).max(axis=1)
    raw_atr = pd.Series(wilder(tr.to_numpy(), cfg.atr_length)).fillna(0)
    baseline = raw_atr.rolling(cfg.atr_baseline).mean().fillna(raw_atr)
    ratio = (raw_atr/baseline.replace(0, np.nan)).fillna(1)
    er = ((source-source.shift(cfg.er_length)).abs()/source.diff().abs().rolling(cfg.er_length).sum().replace(0, np.nan)).fillna(0)
    atr = raw_atr*(0.5+0.5*er) if cfg.efficiency_atr else raw_atr
    volume_z = ((out.volume-out.volume.rolling(cfg.volume_length).mean()) /
                out.volume.rolling(cfg.volume_length).std(ddof=0).replace(0, np.nan)).fillna(0)
    has_volume = out.volume.gt(0).cummax()
    struct_hi = high.rolling(cfg.structure_length, min_periods=1).max()
    struct_lo = low.rolling(cfg.structure_length, min_periods=1).min()
    price_pos = ((close-struct_lo)/(struct_hi-struct_lo).replace(0, np.nan)).fillna(0.5)
    change = close.diff()
    up = change.gt(0).astype(float).rolling(cfg.momentum_length).sum().fillna(0)
    down = change.lt(0).astype(float).rolling(cfg.momentum_length).sum().fillna(0)
    window_change = close-close.shift(cfg.momentum_length)
    momentum = pd.Series(np.where(window_change > 0, up, np.where(window_change < 0, down, 0)))/cfg.momentum_length
    factors = pd.DataFrame({"efficiency": er.clip(0, 1),
                            "volume": pd.Series(np.where(has_volume, ((volume_z+1)/3).clip(0, 1), ((ratio-0.6)/1.2).clip(0, 1))),
                            "structure": (price_pos-0.5).abs().mul(2).clip(0, 1), "momentum": momentum})
    tqi = (factors.mul(cfg.weights).sum(axis=1)/(sum(cfg.weights) or 1)).clip(0, 1) if cfg.quality else pd.Series(0.5, index=out.index)
    gains = wilder(change.clip(lower=0).to_numpy(), cfg.rsi_length)
    losses = wilder((-change).clip(lower=0).to_numpy(), cfg.rsi_length)
    with np.errstate(divide="ignore", invalid="ignore"):
        rsi = pd.Series(100-100/(1+gains/losses)).fillna(50)
    rsi_low = rsi.rolling(cfg.rsi_memory, min_periods=1).min()
    rsi_high = rsi.rolling(cfg.rsi_memory, min_periods=1).max()
    observations = []
    lower = upper = active = passive = pivot_low = pivot_high = None
    trend, trend_start = 1, 0
    map_value = lambda value, a, b, c, d: c + max(0.0, min(1.0, (value-a)/(b-a)))*(d-c)
    for i in out.index:
        c, a, q, e = float(close[i]), float(atr[i]), float(tqi[i]), float(er[i])
        prev_trend, prev_lower, prev_upper = trend, lower, upper
        legacy = 1+cfg.adaptation_strength*(0.5-e) if cfg.adaptive else 1
        deviation = (1-q)**cfg.quality_power if cfg.quality else 0.5
        symmetric = cfg.band_width*legacy*(1-cfg.quality_strength+cfg.quality_strength*(0.6+0.8*deviation))
        ar = symmetric*(1-cfg.asymmetry_strength*q*0.3) if cfg.quality and cfg.asymmetric else symmetric
        pr = symmetric*(1+cfg.asymmetry_strength*q*0.4) if cfg.quality and cfg.asymmetric else symmetric
        active = ar if active is None or not cfg.smooth else active*0.85+ar*0.15
        passive = pr if passive is None or not cfg.smooth else passive*0.85+pr*0.15
        lower_raw = float(source[i])-(active if prev_trend == 1 else passive)*a
        upper_raw = float(source[i])+(passive if prev_trend == 1 else active)*a
        lower = max(lower_raw, prev_lower) if i and float(close[i-1]) > prev_lower else lower_raw
        upper = min(upper_raw, prev_upper) if i and float(close[i-1]) < prev_upper else upper_raw
        price_up = bool(i and prev_trend == -1 and c > prev_upper)
        price_down = bool(i and prev_trend == 1 and c < prev_lower)
        window = max(cfg.character_age, 3)
        collapse = (cfg.character_flip and cfg.quality and i >= window and i-trend_start >= cfg.character_age
                    and float(tqi.iloc[max(0, i-window+1):i+1].max()) > cfg.character_high and q < cfg.character_low)
        char_up = collapse and prev_trend == -1 and c > float(close[i-window])
        char_down = collapse and prev_trend == 1 and c < float(close[i-window])
        if i:
            trend = 1 if price_up or char_up else -1 if price_down or char_down else prev_trend
        flipped = trend != prev_trend
        if flipped:
            trend_start = i
        p = cfg.pivot_length
        if i >= 2*p:
            # Select the last equal extremum; unique pivots have no tie ambiguity.
            center = i-p
            if low[center] <= low.iloc[center-p:center].min() and low[center] < low.iloc[center+1:i+1].min():
                pivot_low = float(low[center])
            if high[center] >= high.iloc[center-p:center].max() and high[center] > high.iloc[center+1:i+1].max():
                pivot_high = float(high[center])
        buy = trend == 1
        movement = (float(close[i-3])-c if buy else c-float(close[i-3])) if i >= 3 else 0
        distance = abs(c-(pivot_low if buy else pivot_high)) if (pivot_low if buy else pivot_high) is not None else 0
        rsi_depth = max(0, cfg.rsi_oversold-float(rsi_low[i])) if buy else max(0, float(rsi_high[i])-cfg.rsi_overbought)
        break_depth = max(0, prev_upper-float(close[i-1])) if buy and i else max(0, float(close[i-1])-prev_lower) if i else 0
        divide = lambda value: value/a if a else 0
        score = (map_value(divide(movement), 0.3, 2, 0, 17)+map_value(e, 0.15, 0.7, 0, 17)
                 +(map_value(float(volume_z[i]), 0, 3, 0, 17) if cfg.score_volume and has_volume[i] else 12)
                 +(map_value(rsi_depth, 0, 15, 0, 17) if cfg.score_rsi else 12)
                 +(map_value(divide(distance), 0, 1.5, 16, 6) if cfg.score_structure else 12)
                 +map_value(divide(break_depth), 0, 1, 0, 16))
        scale = 1.0
        targets = sorted(cfg.targets)
        if cfg.target_mode == "Dynamic":
            normalized = (q*cfg.target_weights[0]+map_value(float(ratio[i]), 0.5, 2, 0, 1)*cfg.target_weights[1])/(sum(cfg.target_weights) or 1)
            scale = cfg.target_scale_min+normalized*(cfg.target_scale_max-cfg.target_scale_min)
            targets = sorted(max(min(cfg.target_floor*r/targets[0], cfg.target_ceiling),
                                 min(r*scale, cfg.target_ceiling)) for r in targets)
        direction = 1 if buy else -1
        pivot = pivot_low if buy else pivot_high
        sl_base = pivot if pivot is not None else float(low[i] if buy else high[i])
        risk = min(max(direction*(c-sl_base)+cfg.stop_buffer*a, cfg.stop_buffer*a), max(cfg.stop_cap, cfg.stop_buffer)*a)
        stop = c-direction*risk
        action = "buy" if flipped and buy and i >= cfg.warmup else "sell" if flipped and i >= cfg.warmup else "hold"
        cause = "quality_collapse" if flipped and ((char_up and not price_up) or (char_down and not price_down)) else "price_break" if flipped else None
        observations.append({"signal": action, "trend": trend, "line": lower if buy else upper,
                             "lower_band": lower, "upper_band": upper, "tqi": q,
                             "er": e, "vol_ratio": float(ratio[i]), "atr": a, "raw_atr": float(raw_atr[i]),
                             "rsi": float(rsi[i]), "score": score, "warmed_up": i >= cfg.warmup,
                             "flip_cause": cause, "last_pivot_low": pivot_low, "last_pivot_high": pivot_high,
                             "stop": stop, "tp1": c+direction*risk*targets[0],
                             "tp2": c+direction*risk*targets[1], "tp3": c+direction*risk*targets[2],
                             "target_scale": scale, **{f"tqi_{k}": float(v[i]) for k, v in factors.items()}})
    return pd.concat([out, pd.DataFrame(observations)], axis=1)
