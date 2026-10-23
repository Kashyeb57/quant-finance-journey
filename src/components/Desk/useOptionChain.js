import { useState } from 'react';
import { isCrypto } from '../Terminal/marketData';
import { getChain } from '../../lib/market';
import usePolling from '../../lib/usePolling';

/*
 * One expiry of the option chain for `ticker` (exp = 'YYYY-MM-DD', or '' for
 * the front expiry), polled from the Worker's /_m/chain. The source is CBOE's
 * free feed, about 15 minutes delayed, which the Worker caches for 2 minutes,
 * so polling faster than that would only re-read the same numbers.
 *
 * `chain` keeps the last good answer through a failed poll; `stale` is true
 * while it still belongs to a previous ticker or expiry.
 */

const CHAIN_MS = 120000;

export default function useOptionChain(ticker, exp) {
  const [chain, setChain] = useState(null);
  const [error, setError] = useState(false);

  usePolling(async ({ signal, cancelled }) => {
    if (isCrypto(ticker)) {
      setChain(null);
      return;
    }
    try {
      const d = await getChain(ticker, exp, { signal });
      if (cancelled()) return;
      setChain(d && Array.isArray(d.rows) ? d : null);
      setError(false);
    } catch (_) {
      if (!cancelled()) setError(true);
    }
  }, CHAIN_MS, [ticker, exp]);

  const stale = !!chain && (chain.symbol !== ticker || (exp && chain.exp !== exp));
  return { chain, error, stale };
}
