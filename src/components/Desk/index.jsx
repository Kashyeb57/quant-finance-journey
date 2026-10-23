import React, { useRef, useState } from 'react';
import Chart from '../Terminal/Chart';
import PriceHeader from '../Terminal/PriceHeader';
import { SECTIONS } from '../Terminal/tickers';
import { fmtPct } from '../../lib/format';
import useDeskData from './useDeskData';
import useOptionChain from './useOptionChain';
import { RiskCards, SurfacePanel, SatsPanel, ExposurePanel, tickerLabel, dirClass } from './panels';
import { OptionChainPanel, ExpectedMovePanel } from './optionsPanels';
import styles from './styles.module.css';

/*
 * Quant Desk — one-screen workstation laid out like an institutional
 * multi-panel terminal:
 *
 *   ┌ rail ┐┌──── price chart ─────┐┌ IV surface ┐
 *   │cards ││ candles · EMA · VWAP ││            │
 *   │      ││ GEX levels · position│├ SATS model ┤
 *   │      │└──────────────────────┘└────────────┘
 *   │      │┌ option chain ────────┐┌ exp. move ┐
 *   │      │└──────────────────────┘└───────────┘
 *   │      │┌ OI depth / P&L profile (toggle) ───┐
 *   └──────┘└────────────────────────────────────┘
 *
 * The chart and price header are the Terminal's own components, unchanged.
 *
 * Every panel reads the same Worker endpoints the Terminal, Portfolio and
 * Brain pages already use; nothing here needs a new backend route. The
 * panels themselves live in ./panels and are shared with the Terminal.
 */

const sectionOf = (t) => (SECTIONS.find((s) => s.tickers.includes(t)) || SECTIONS[0]).name;

export default function Desk() {
  const [ticker, setTicker] = useState('AMD');
  const [section, setSection] = useState(() => sectionOf('AMD'));
  const [timeframe, setTimeframe] = useState('5Min');
  const [exp, setExp] = useState(''); // '' = the front expiry
  const chartBoxRef = useRef(null);
  const d = useDeskData(ticker);
  const oc = useOptionChain(ticker, exp);
  const { quotes } = d;

  const pickTicker = (t) => {
    setTicker(t);
    setExp(''); // another stock's expiry dates may not exist here
  };

  const active = SECTIONS.find((s) => s.name === section) || SECTIONS[0];

  return (
    <div className={styles.desk}>
      <div className={styles.toolbar}>
        <div className={styles.sections}>
          {SECTIONS.map((s) => (
            <button
              key={s.name}
              className={`${styles.chip} ${s.name === section ? styles.chipActive : ''}`}
              onClick={() => setSection(s.name)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className={styles.tickers}>
          {active.tickers.map((t) => (
            <button
              key={t}
              className={`${styles.tick} ${t === ticker ? styles.tickActive : ''}`}
              onClick={() => pickTicker(t)}
            >
              {tickerLabel(t)}
              {quotes[t] && quotes[t].changePct != null && (
                <span className={dirClass(quotes[t].changePct)}>{fmtPct(quotes[t].changePct, 1)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.rail}>
          <RiskCards d={d} />
        </div>

        <section className={`${styles.panel} ${styles.chartPanel}`} ref={chartBoxRef}>
          <PriceHeader ticker={ticker} />
          <Chart ticker={ticker} timeframe={timeframe} setTimeframe={setTimeframe} fsTargetRef={chartBoxRef} />
        </section>

        <SurfacePanel d={d} className={styles.surfacePanel} />
        <SatsPanel d={d} className={styles.satsPanel} />
        <OptionChainPanel oc={oc} ticker={ticker} exp={exp} setExp={setExp} className={styles.chainPanel} />
        <ExpectedMovePanel oc={oc} ticker={ticker} exp={exp} setExp={setExp} className={styles.movePanel} />
        <ExposurePanel d={d} className={styles.bottomPanel} />
      </div>
    </div>
  );
}
