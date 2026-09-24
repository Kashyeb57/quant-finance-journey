"""Market-data transport and causal, completed-bar features."""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ORIGIN = "https://joyebkashyeb.com.np"
# The one stock this experiment models and may trade (SPY until 2026-09-24).
# Must match SYMBOL in market/src/brain.mjs.
SYMBOL = "MU"
FEATURES = ["return_1", "return_4", "volatility_8", "range", "body", "volume_ratio"]
RUNTIME = Path(__file__).resolve().parents[1] / "runtime"
PIPELINE_VERSION = "fly-v630-market-v1"
# NYSE early closes (13:00 New York), from nyse.com; 2026-2027 match the website's
# terminal. Bars at or after 13:00 on these days are after-hours trading. Data before
# EARLY_CLOSES_FROM is not covered: import warns about it.
EARLY_CLOSES = {"2022-11-25", "2023-07-03", "2023-11-24", "2024-07-03", "2024-11-29", "2024-12-24",
                "2025-07-03", "2025-11-28", "2025-12-24", "2026-11-27", "2026-12-24", "2027-11-26"}
EARLY_CLOSES_FROM, EARLY_CLOSES_TO = "2022-01-01", "2027-12-31"
# A timestamp string must say which zone it is in: Z or an explicit UTC offset.
_EXPLICIT_OFFSET = re.compile(r"(?:Z|[+-]\d{2}:?\d{2})$", re.IGNORECASE)


def request(path, body=None, token=None):
    # Credentials can only be sent to the owner's fixed HTTPS origin.
    headers = {"User-Agent": "JoyebBrain/0.1", "Accept": "application/json"}
    if token:
        headers["X-Trade-Token"] = token
    payload = None if body is None else json.dumps(body, allow_nan=False).encode()
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(ORIGIN + path, data=payload, headers=headers)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Do not echo upstream response bodies or tokens to logs.
        detail = ""
        try:
            code = json.loads(exc.read(4096)).get("error", "")
            if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,100}", code):
                detail = ": " + code
        except (ValueError, AttributeError):
            pass
        raise RuntimeError(f"Website API returned HTTP {exc.code} for {path.split('?')[0]}{detail}") from None


def atomic_json(path, value, attempts=10):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, allow_nan=False), encoding="utf-8")
    # On Windows the replace fails while another thread (the local status
    # server) has the file open; that lasts milliseconds, so retry briefly.
    for attempt in range(attempts):
        try:
            temp.replace(path)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.05)


def fetch_bars(days=120):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    query = {"start": start.isoformat(), "end": end.isoformat()}
    bars, seen = [], set()
    source = "Alpaca IEX via website brain endpoint"
    try:
        while True:
            page = request("/_m/brain/bars?" + urllib.parse.urlencode(query))
            if page.get("symbol") != SYMBOL:
                # The website serves another symbol (e.g. a Worker not yet redeployed):
                # never save its prices under this symbol's name.
                raise ValueError(f"Website served {page.get('symbol')} bars, expected {SYMBOL}; deploy the Worker first")
            bars.extend(page.get("bars", []))
            cursor = page.get("next_page_token")
            if not cursor:
                break
            if cursor in seen or len(seen) >= 100:
                raise RuntimeError("Market-data pagination did not terminate")
            seen.add(cursor)
            query["page_token"] = cursor
    except RuntimeError as exc:
        if "HTTP 404" not in str(exc) or bars:
            raise
        # Bootstrap against the already deployed site. This endpoint has a
        # shorter window and a 1000-row cap; never claim it is a full history.
        page = request(f"/_m/bars?symbol={SYMBOL}&tf=15Min")
        if page.get("symbol") != SYMBOL:
            raise ValueError(f"Website served {page.get('symbol')} bars, expected {SYMBOL}")
        bars = page.get("bars", [])
        source = "Alpaca IEX via legacy endpoint (limited historical window)"
    return bars, source


def collect(days=120):
    bars, source = fetch_bars(days)
    frame = clean_bars(pd.DataFrame(bars))
    RUNTIME.mkdir(parents=True, exist_ok=True)
    frame.to_csv(RUNTIME / "bars.csv", index=False)
    info = {"symbol": SYMBOL, "timeframe": "15Min", "source": source,
            "rows": len(frame), "collected_at": datetime.now(timezone.utc).isoformat(),
            "first": frame.time.iloc[0].isoformat(), "last": frame.time.iloc[-1].isoformat()}
    atomic_json(RUNTIME / "data.json", info)
    return info


def clean_bars(frame, now=None, settle_seconds=0, strict=True, require_offset=False):
    """Completed, aligned regular-session bars.

    settle_seconds: a bar counts as complete only this long after it ends (live
    signalling uses 60 s so late prints have arrived). strict=False drops
    individual invalid bars instead of rejecting the whole download; training and
    import stay strict. require_offset: text timestamps must carry Z or an offset.
    """
    required = {"time", "open", "high", "low", "close", "volume"}
    if not required.issubset(frame.columns):
        raise ValueError("Bars need time, open, high, low, close, volume columns")
    frame = frame[list(required)].copy()
    if pd.api.types.is_numeric_dtype(frame.time):
        frame["time"] = pd.to_datetime(frame.time, unit="s", utc=True)
    else:
        if require_offset:
            text = frame.time.astype(str).str.strip()
            if not text.str.contains(_EXPLICIT_OFFSET).all():
                raise ValueError("CSV times need an explicit UTC offset (for example 2026-09-23T13:30:00Z "
                                 "or 2026-09-23T09:30:00-04:00); times without one are ambiguous")
        frame["time"] = pd.to_datetime(frame.time, utc=True)
    frame = frame.sort_values("time").drop_duplicates("time", keep="last")
    prices = frame[["open", "high", "low", "close", "volume"]].apply(pd.to_numeric, errors="coerce")
    bad = (~np.isfinite(prices.to_numpy()).all(axis=1) | (prices.iloc[:, :4] <= 0).any(axis=1).to_numpy() |
           (prices.volume < 0).to_numpy())
    inconsistent = ((prices.high < prices[["open", "close", "low"]].max(axis=1)) |
                    (prices.low > prices[["open", "close", "high"]].min(axis=1))).to_numpy()
    if strict and bad.any():
        raise ValueError("Invalid market prices or volume")
    if strict and inconsistent.any():
        raise ValueError("Inconsistent OHLC bar")
    dropped = int((bad | inconsistent).sum())
    frame[prices.columns] = prices
    frame = frame.loc[~(bad | inconsistent)]
    now = pd.Timestamp.now(tz="UTC") if now is None else pd.Timestamp(now)
    eastern = frame.time.dt.tz_convert("America/New_York")
    minutes = eastern.dt.hour * 60 + eastern.dt.minute
    early_close = eastern.dt.strftime("%Y-%m-%d").isin(EARLY_CLOSES)
    session_end = np.where(early_close, 780, 960)
    # Completed, aligned regular-session bars only, including the closing bar.
    keep = ((frame.time + pd.Timedelta(minutes=15) + pd.Timedelta(seconds=settle_seconds) <= now) &
            (eastern.dt.dayofweek < 5) & (minutes >= 570) & (minutes < session_end) &
            (minutes % 15 == 0) & (frame.time.dt.second == 0))
    frame = frame.loc[keep].reset_index(drop=True)
    frame.attrs["dropped_invalid"] = dropped
    if frame.empty:
        raise ValueError(f"No completed regular-session {SYMBOL} bars available")
    return frame


def features(frame, training=True):
    """At bar t, use only information available when bar t closes.

    The research label is the next bar's OPEN to the following bar's OPEN,
    so a decision never receives a fill at the close it just observed.
    """
    f = frame.copy()
    f["return_1"] = f.close.pct_change()
    f["return_4"] = f.close.pct_change(4)
    f["volatility_8"] = f.return_1.rolling(8).std()
    f["range"] = (f.high - f.low) / f.close
    f["body"] = (f.close - f.open) / f.open
    f["volume_ratio"] = f.volume / f.volume.rolling(16).mean().replace(0, np.nan) - 1
    f["target"] = f.open.shift(-2) / f.open.shift(-1) - 1
    f["target_end"] = f.time.shift(-2)
    # Feature windows and labels cannot jump across missing bars or overnight.
    contiguous = f.time.diff().eq(pd.Timedelta(minutes=15))
    past_ok = contiguous.rolling(15).sum().eq(15)
    future_ok = (f.time.shift(-1).sub(f.time).eq(pd.Timedelta(minutes=15)) &
                 f.time.shift(-2).sub(f.time).eq(pd.Timedelta(minutes=30)))
    mask = past_ok & np.isfinite(f[FEATURES]).all(axis=1)
    if training:
        mask &= future_ok & f.target.notna()
    return f.loc[mask].reset_index(drop=True)
