import { useMemo, useState } from 'react';
import { SECTIONS } from '../Terminal/tickers';
import { fetchBars, isCrypto } from '../Terminal/marketData';
import { getGex, getLedger, getQuotes } from '../../lib/market';
import usePolling from '../../lib/usePolling';
import {
  dailyReturns, rollingSharpe, drawdowns, historicalVar, pnlProfile, positionWeights,
  realizedVol, realizedVolSeries, atmIv, ivSurface, oiDepth, sectorBreadth,
} from './quant.mjs';

/*
 * Everything the desk panels read, fetched once per page and shared. Used by
 * the Quant Desk page and the analytics row under the Terminal's chart/news.
 * All sources are existing Worker routes; each poll keeps its last good value
 * on failure so a blip never blanks a panel.
 */

const LEDGER_MS = 30000;
const QUOTES_MS = 30000;
const GEX_MS = 300000;   // the Worker caches the chain for 5 minutes anyway
const DAILY_MS = 300000;
const SATS_MS = 600000;

const ALL_EQUITIES = [...new Set(SECTIONS.flatMap((s) => s.tickers))].filter((t) => !isCrypto(t));

export default function useDeskData(ticker) {
  const [ledger, setLedger] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [chain, setChain] = useState(null);
  const [daily, setDaily] = useState([]);
  const [sats, setSats] = useState(null);

  usePolling(async ({ signal, cancelled }) => {
    try {
      const d = await getLedger({ signal });
      if (!cancelled() && d && d.account) setLedger(d);
    } catch (_) { /* cards show "not connected" */ }
  }, LEDGER_MS);

  usePolling(async ({ signal, cancelled }) => {
    try {
      const q = await getQuotes(ALL_EQUITIES, { signal });
      if (!cancelled()) setQuotes(q);
    } catch (_) { /* keep last */ }
  }, QUOTES_MS);

  usePolling(async ({ signal, cancelled }) => {
    if (isCrypto(ticker)) { setChain(null); return; }
    try {
      const d = await getGex(ticker, '30d', { signal });
      if (!cancelled()) setChain(d && d.rows ? d : null);
    } catch (_) { if (!cancelled()) setChain(null); }
  }, GEX_MS, [ticker]);

  usePolling(async ({ cancelled }) => {
    const { bars } = await fetchBars(ticker, '1Day');
    if (!cancelled()) setDaily(bars || []);
  }, DAILY_MS, [ticker]);

  usePolling(async ({ signal, cancelled }) => {
    try {
      const r = await fetch('/brain-sats-evaluation.json', { signal });
      if (r.ok && !cancelled()) setSats(await r.json());
    } catch (_) { /* panel shows empty state */ }
  }, SATS_MS);

  const history = useMemo(() => (ledger && ledger.history) || [], [ledger]);
  const equityVals = useMemo(() => history.map((p) => p.value), [history]);
  const rets = useMemo(() => dailyReturns(history), [history]);
  const positions = useMemo(() => (ledger && ledger.positions) || [], [ledger]);
  const acct = ledger && ledger.account;
  const varFrac = useMemo(() => historicalVar(rets, 0.95), [rets]);

  return {
    ticker,
    acct,
    quotes,
    chain,
    sats,
    equityVals,
    sharpe: useMemo(() => rollingSharpe(rets, 20), [rets]),
    dd: useMemo(() => drawdowns(equityVals), [equityVals]),
    varDollars: varFrac != null && acct && acct.equity ? varFrac * acct.equity : null,
    weights: useMemo(() => positionWeights(positions), [positions]),
    profile: useMemo(() => (positions.length ? pnlProfile(positions) : null), [positions]),
    breadth: useMemo(() => sectorBreadth(SECTIONS, quotes), [quotes]),
    rv: useMemo(() => realizedVol(daily, 20), [daily]),
    rvSeries: useMemo(() => realizedVolSeries(daily.slice(-80), 20), [daily]),
    iv: useMemo(() => atmIv(chain), [chain]),
    surface: useMemo(() => ivSurface(chain), [chain]),
    depth: useMemo(() => oiDepth(chain), [chain]),
  };
}
