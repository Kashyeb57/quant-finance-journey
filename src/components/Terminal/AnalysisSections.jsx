import React from 'react';
import DeckRow from './DeckRow';
import { OptionChainPanel, ExpectedMovePanel } from '../Desk/optionsPanels';
import {
  SurfacePanel, DepthPanel, PnlPanel, SatsPanel,
  VolCard, EquityCard, SharpeCard, PositionsCard, RegimeCard, BreadthCard, tickerLabel,
} from '../Desk/panels';
import desk from '../Desk/styles.module.css';
import styles from './styles.module.css';

/*
 * The Terminal's analysis sections, each a two-panel deck like chart + news.
 * Data comes in from the page: `d` from useDeskData, `oc` from useOptionChain.
 */

const Tick = ({ ticker }) => <span className={styles.deckTicker}>{tickerLabel(ticker)}</span>;
const vars = (node) => <div className={desk.vars}>{node}</div>;

export function OptionsSection({ oc, ticker, exp, setExp }) {
  return (
    <DeckRow
      height={500}
      initialSplit={0.62}
      left={{
        title: <>Option chain <Tick ticker={ticker} /></>,
        rail: 'Option chain',
        body: vars(<OptionChainPanel bare oc={oc} ticker={ticker} setExp={setExp} />),
      }}
      right={{
        title: <>Expected move <Tick ticker={ticker} /></>,
        rail: 'Expected move',
        body: vars(<ExpectedMovePanel bare oc={oc} ticker={ticker} exp={exp} setExp={setExp} />),
      }}
    />
  );
}

export function VolatilitySection({ d }) {
  return (
    <DeckRow
      height={430}
      initialSplit={0.5}
      left={{
        title: <>Implied vol surface <Tick ticker={d.ticker} /></>,
        rail: 'IV surface',
        body: vars(<SurfacePanel bare d={d} />),
      }}
      right={{
        title: <>Realized vs implied · OI depth <Tick ticker={d.ticker} /></>,
        rail: 'OI depth',
        body: vars(
          <div className={desk.stack}>
            <VolCard d={d} />
            <DepthPanel d={d} className={desk.grow} />
          </div>,
        ),
      }}
    />
  );
}

export function RiskSection({ d }) {
  return (
    <DeckRow
      height={420}
      initialSplit={0.6}
      left={{ title: 'P&L profile · VaR', rail: 'P&L profile', body: vars(<PnlPanel bare d={d} />) }}
      right={{
        title: 'Account',
        rail: 'Account',
        body: vars(
          <div className={desk.cardGrid}>
            <EquityCard d={d} />
            <SharpeCard d={d} />
            <PositionsCard d={d} />
          </div>,
        ),
      }}
    />
  );
}

export function MarketSection({ d }) {
  return (
    <DeckRow
      height={380}
      initialSplit={0.45}
      left={{
        title: 'Market regime',
        rail: 'Regime',
        body: vars(
          <div className={desk.cardGrid}>
            <RegimeCard d={d} />
            <BreadthCard d={d} />
          </div>,
        ),
      }}
      right={{ title: 'SATS model', rail: 'SATS model', body: vars(<SatsPanel bare d={d} />) }}
    />
  );
}
