import React, { useEffect, useRef, useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { SECTIONS } from './tickers';
import { ChartSkeleton, NewsSkeleton, PortfolioSkeletonBody, PriceSkeleton } from './Skeletons';
import Section from './Section';
import useTerminalLayout from './useTerminalLayout';
import { OptionsSection, VolatilitySection, RiskSection, MarketSection } from './AnalysisSections';
import useDeskData from '../Desk/useDeskData';
import useOptionChain from '../Desk/useOptionChain';
import styles from './styles.module.css';

/*
 * Market Terminal.
 * One "deck" panel holds two sections side by side — the live price chart and
 * the live RSS news feed — joined by a divider. Each section can be collapsed
 * to a slim rail (the chart stays mounted, so collapsing doesn't reload it) and
 * the other section expands to fill; at least one stays open.
 *
 * Below it sit more decks built the same way: options (chain + expected move),
 * volatility, risk and market, then the paper portfolio. Every block can be
 * collapsed and moved up or down; the layout is remembered in this browser.
 *
 * Tickers are grouped into sectors (mirrors the Robinhood watchlists +
 * the space / neocloud themes). Pick a sector tab → its symbols appear;
 * pick a symbol → every section follows it. Every symbol supports every
 * timeframe offered by the chart (1m · 3m · 5m · 15m · 1H · 1D).
 */

const tickerLabel = (t) => (t === 'BTC-USD' ? '₿ BTC' : t);
const sectionOf = (t) => (SECTIONS.find((s) => s.tickers.includes(t)) || SECTIONS[0]).name;

const BLOCKS = ['chart', 'options', 'volatility', 'risk', 'market', 'portfolio'];
const BLOCK_TITLES = {
  chart: 'Chart & news',
  options: 'Options',
  volatility: 'Volatility',
  risk: 'Risk',
  market: 'Market & model',
  portfolio: 'Paper portfolio',
};

export default function Terminal() {
  const [ticker, setTickerState] = useState('AMD');
  const [exp, setExp] = useState(''); // option expiry, '' = the front one
  const setTicker = (t) => {
    setTickerState(t);
    setExp(''); // another stock's expiry dates may not exist
  };
  const [section, setSection] = useState(() => sectionOf('AMD'));
  const [timeframe, setTimeframe] = useState('5Min');
  const [source, setSource] = useState(null);
  const [chartOpen, setChartOpen] = useState(true);
  const [newsOpen, setNewsOpen] = useState(true);
  const deckRef = useRef(null); // fullscreen target — the whole deck (chart + news)
  const [split, setSplit] = useState(0.62); // chart's share of the width (0–1)
  const draggingRef = useRef(false);

  // Section order + collapsed state, and the data behind the analysis
  // sections; each feed only polls while a section that shows it is open.
  const layout = useTerminalLayout(BLOCKS);
  const d = useDeskData(ticker, {
    risk: layout.isOpen('risk'),
    vol: layout.isOpen('volatility'),
    market: layout.isOpen('market'),
  });
  const oc = useOptionChain(ticker, exp, layout.isOpen('options'));

  // Keep at least one section open — you can't collapse the last one.
  const toggleChart = () => { if (chartOpen && !newsOpen) return; setChartOpen(!chartOpen); };
  const toggleNews = () => { if (newsOpen && !chartOpen) return; setNewsOpen(!newsOpen); };

  // Drag the divider to resize chart vs news. Works in fullscreen too, since the
  // deck is the same element. Listeners live on window so the drag keeps
  // tracking even when the cursor moves over the chart or news.
  const startResize = (e) => {
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    if (e.cancelable) e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current || !deckRef.current) return;
      if (e.cancelable) e.preventDefault();
      const rect = deckRef.current.getBoundingClientRect();
      const cx = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
      setSplit(Math.max(0.2, Math.min(0.82, (cx - rect.left) / rect.width)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const active = SECTIONS.find((s) => s.name === section) || SECTIONS[0];

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionBar}>
        {SECTIONS.map((s) => (
          <button
            key={s.name}
            className={`${styles.sectionBtn} ${s.name === section ? styles.sectionBtnActive : ''}`}
            onClick={() => setSection(s.name)}
          >
            {s.name}
            <span className={styles.sectionCount}>{s.tickers.length}</span>
          </button>
        ))}
      </div>

      <div className={styles.tickerBar}>
        <span className={styles.tickerLabel}>{active.name}:</span>
        {active.tickers.map((t) => (
          <button
            key={t}
            className={`${styles.tickerBtn} ${t === ticker ? styles.tickerBtnActive : ''}`}
            onClick={() => setTicker(t)}
          >
            {tickerLabel(t)}
          </button>
        ))}
      </div>

      {layout.order.map((id, i) => (
        <Section
          key={id}
          id={id}
          title={BLOCK_TITLES[id]}
          index={i}
          count={layout.order.length}
          open={layout.isOpen(id)}
          onToggle={() => layout.toggle(id)}
          onMove={(step) => layout.move(id, step)}
        >
          {id === 'chart' && (
              <div className={styles.deck} ref={deckRef} style={chartOpen && newsOpen ? {'--chart-flex': split, '--news-flex': 1 - split} : undefined}>
                <section className={`${styles.deckSection} ${styles.chartSection} ${chartOpen ? '' : styles.collapsed}`}>
                  <button type="button" className={styles.deckHead} onClick={toggleChart} aria-expanded={chartOpen} title={chartOpen ? 'Collapse chart' : 'Expand chart'}>
                    <span className={styles.deckTitle}>Chart</span>
                    <span className={styles.collapseIcon} aria-hidden="true">{chartOpen ? '−' : '+'}</span>
                  </button>
                  <div className={styles.deckBody}>
                    <BrowserOnly fallback={<PriceSkeleton />}>
                      {() => {
                        const PriceHeader = require('./PriceHeader').default;
                        return <PriceHeader ticker={ticker} />;
                      }}
                    </BrowserOnly>
                    <BrowserOnly fallback={<div className={styles.chartArea}><ChartSkeleton /></div>}>
                      {() => {
                        const Chart = require('./Chart').default;
                        return <Chart ticker={ticker} timeframe={timeframe} setTimeframe={setTimeframe} onStatus={(s) => setSource(s.source)} fsTargetRef={deckRef} />;
                      }}
                    </BrowserOnly>
                  </div>
                  <button type="button" className={styles.rail} onClick={toggleChart} aria-label="Expand chart">
                    <span className={styles.railChevron} aria-hidden="true">›</span>
                    <span className={styles.railTitle}>Chart</span>
                  </button>
                </section>

                {chartOpen && newsOpen && (
                  <div
                    className={styles.resizer}
                    onMouseDown={startResize}
                    onTouchStart={startResize}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Drag to resize chart and news"
                  />
                )}

                <section className={`${styles.deckSection} ${styles.newsSection} ${newsOpen ? '' : styles.collapsed}`}>
                  <button type="button" className={styles.deckHead} onClick={toggleNews} aria-expanded={newsOpen} title={newsOpen ? 'Collapse news' : 'Expand news'}>
                    <span className={styles.deckTitle}>Market News <span className={styles.liveTag}>LIVE</span></span>
                    <span className={styles.collapseIcon} aria-hidden="true">{newsOpen ? '−' : '+'}</span>
                  </button>
                  <div className={styles.deckBody}>
                    <BrowserOnly fallback={<NewsSkeleton />}>
                      {() => {
                        const News = require('./News').default;
                        return <News ticker={ticker} />;
                      }}
                    </BrowserOnly>
                  </div>
                  <button type="button" className={styles.rail} onClick={toggleNews} aria-label="Expand news">
                    <span className={styles.railChevron} aria-hidden="true">‹</span>
                    <span className={styles.railTitle}>News</span>
                  </button>
                </section>
              </div>
          )}
          {id === 'options' && <OptionsSection oc={oc} ticker={ticker} exp={exp} setExp={setExp} />}
          {id === 'volatility' && <VolatilitySection d={d} />}
          {id === 'risk' && <RiskSection d={d} />}
          {id === 'market' && <MarketSection d={d} />}
          {id === 'portfolio' && (
              <BrowserOnly fallback={<div className={styles.portfolio}><PortfolioSkeletonBody /></div>}>
                {() => {
                  const Portfolio = require('./Portfolio').default;
                  return <Portfolio />;
                }}
              </BrowserOnly>
          )}
        </Section>
      ))}

      <p className={styles.note}>
        Symbols are grouped by sector — pick a sector, then a symbol; every
        symbol supports all timeframes. Live candles refresh automatically while
        this tab is open; the news feed merges fresh headlines from ~22 RSS
        sources. Chart times are shown in Central Time (CT). Options data is
        CBOE&apos;s free feed, about 15 minutes delayed. Collapse any section or move
        it with the arrows; this browser remembers your layout
        (<button type="button" className={styles.resetLayout} onClick={layout.reset}>reset layout</button>).
        {source === 'fallback' && ' Prices are currently coming from the public fallback source.'}
      </p>
    </div>
  );
}
