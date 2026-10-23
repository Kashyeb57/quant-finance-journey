import React from 'react';
import { OptionChainPanel, ExpectedMovePanel } from '../Desk/optionsPanels';
import {
  SurfacePanel, DepthPanel, PnlPanel, SatsPanel,
  VolCard, EquityCard, SharpeCard, PositionsCard, RegimeCard, BreadthCard, tickerLabel,
} from '../Desk/panels';
import desk from '../Desk/styles.module.css';
import styles from './styles.module.css';

/*
 * The analysis tiles on the Terminal board. Each entry: its header, the short
 * label on its collapsed rail, the height its row needs (px), its share of the
 * row's width, the data group it reads (so a closed tile stops polling), and
 * what it shows. `ctx` = { d (useDeskData), oc (useOptionChain), ticker, exp, setExp }.
 */

const Tick = ({ t }) => <span className={styles.deckTicker}>{tickerLabel(t)}</span>;
const inVars = (node) => <div className={desk.vars}>{node}</div>;

export const TILES = {
  chain: {
    title: (c) => <>Option chain <Tick t={c.ticker} /></>,
    rail: 'Option chain', h: 500, w: 1.6, need: 'options',
    render: (c) => inVars(<OptionChainPanel bare oc={c.oc} ticker={c.ticker} setExp={c.setExp} />),
  },
  moves: {
    title: (c) => <>Expected move <Tick t={c.ticker} /></>,
    rail: 'Expected move', h: 500, w: 1, need: 'options',
    render: (c) => inVars(<ExpectedMovePanel bare oc={c.oc} ticker={c.ticker} exp={c.exp} setExp={c.setExp} />),
  },
  surface: {
    title: (c) => <>IV surface <Tick t={c.ticker} /></>,
    rail: 'IV surface', h: 420, w: 1.15, need: 'vol',
    render: (c) => inVars(<SurfacePanel bare d={c.d} />),
  },
  depth: {
    title: (c) => <>OI depth <Tick t={c.ticker} /></>,
    rail: 'OI depth', h: 420, w: 1, need: 'vol',
    render: (c) => inVars(<DepthPanel bare d={c.d} />),
  },
  pnl: {
    title: () => 'P&L profile · VaR',
    rail: 'P&L · VaR', h: 420, w: 1, need: 'risk',
    render: (c) => inVars(<PnlPanel bare d={c.d} />),
  },
  sats: {
    title: () => 'SATS model',
    rail: 'SATS', h: 300, w: 1.4, need: 'market',
    render: (c) => inVars(<SatsPanel bare d={c.d} />),
  },
  regime: {
    title: () => 'Market regime',
    rail: 'Regime', h: 300, w: 1, need: 'market',
    render: (c) => inVars(<RegimeCard bare d={c.d} />),
  },
  breadth: {
    title: () => 'Sector breadth',
    rail: 'Breadth', h: 300, w: 0.8, need: 'market',
    render: (c) => inVars(<BreadthCard bare d={c.d} />),
  },
  equity: {
    title: () => 'Net equity',
    rail: 'Equity', h: 230, w: 1, need: 'risk',
    render: (c) => inVars(<EquityCard bare d={c.d} />),
  },
  sharpe: {
    title: () => 'Sharpe · drawdown',
    rail: 'Sharpe', h: 230, w: 1, need: 'risk',
    render: (c) => inVars(<SharpeCard bare d={c.d} />),
  },
  vol: {
    title: (c) => <>Realized vs implied <Tick t={c.ticker} /></>,
    rail: 'RV vs IV', h: 230, w: 1, need: 'vol',
    render: (c) => inVars(<VolCard bare d={c.d} />),
  },
  positions: {
    title: () => 'Top positions',
    rail: 'Positions', h: 230, w: 1, need: 'risk',
    render: (c) => inVars(<PositionsCard bare d={c.d} />),
  },
};

/** Which data groups any open tile needs: { options, vol, risk, market }. */
export function neededData(isOpen) {
  const need = {};
  for (const [id, t] of Object.entries(TILES)) if (isOpen(id)) need[t.need] = true;
  return need;
}
