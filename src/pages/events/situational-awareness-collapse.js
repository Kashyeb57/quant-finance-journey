import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import TimeSeriesChart from '@site/src/components/Events/TimeSeriesChart';
import LeverageBars from '@site/src/components/Events/LeverageBars';
import RecoveryBars from '@site/src/components/Events/RecoveryBars';
import DeclineBars from '@site/src/components/Events/DeclineBars';
import LeverageLadder from '@site/src/components/Events/LeverageLadder';
import styles from './styles.module.css';

// Assets-under-management trajectory (t = months since the Nov-2024 launch).
// The line runs green up to the July-2026 peak, then red into the fire sale.
const AUM = [
  { t: 0,  value: 0.225, tag: 'Launch', sub: '≈$225M', xLabel: 'Nov 2024', tagSide: 'right' },
  { t: 4,  value: 1.2 },
  { t: 8,  value: 4,  xLabel: 'Jul 2025' },
  { t: 12, value: 9 },
  { t: 16, value: 18, xLabel: 'Mar 2026' },
  { t: 20, value: 45, tag: 'Peak', sub: '≈$20–45B', xLabel: 'early Jul 2026', tagSide: 'left' },
  { t: 21, value: 10, tag: 'Wipe-out', sub: '~$10B left', xLabel: '6 days later', tagSide: 'left' },
];

// Normalized investor returns — base 100 at launch (Nov 2024).
// +439% net through Jun 30, 2026 → NAV = 539.
// July wipe-out: −67% of 539 → NAV ≈ 178.
const NAV = [
  { t: 0,  value: 100, tag: 'Launch', sub: 'NAV = 100',    xLabel: 'Nov 2024', tagSide: 'right' },
  { t: 3,  value: 148, xLabel: 'Feb 2025' },
  { t: 6,  value: 215, xLabel: 'May 2025' },
  { t: 9,  value: 305 },
  { t: 12, value: 385, xLabel: 'Nov 2025' },
  { t: 16, value: 468, xLabel: 'Mar 2026' },
  { t: 20, value: 539, tag: '+439%',  sub: 'Jun 30, 2026', xLabel: 'Jun 2026', tagSide: 'left' },
  { t: 21, value: 178, tag: '−67%',   sub: 'Jul 31, 2026', xLabel: 'Jul 2026', tagSide: 'left' },
];

// Top-5 concentration bars (% of disclosed long book, Q1-2026 13F).
const CONC_BARS = [
  { label: 'Bloom Energy',    note: 'Power generation',          pct: 22.8 },
  { label: 'SanDisk',         note: 'Storage / memory',          pct: 18.8 },
  { label: 'CoreWeave',       note: 'GPU cloud (neocloud)',       pct: 14.4 },
  { label: 'IREN',            note: 'Bitcoin miner → AI/HPC',    pct: 10.4 },
  { label: 'Core Scientific', note: 'Bitcoin miner → AI/HPC',    pct: 10.1 },
  { label: 'Other 21 names',  note: 'remaining disclosed longs', pct: 23.5 },
];

// Approx drawdowns from June 2026 peak to Jul-29 forced-sale lows.
const JULY_DECLINES = [
  { label: 'Nebius',           pct: -54, note: 'fund long',                     kind: 'long'  },
  { label: 'CoreWeave',        pct: -47, note: 'fund long — 14.4% of book',     kind: 'long'  },
  { label: 'IREN',             pct: -45, note: 'fund long — 10.4% of book',     kind: 'long'  },
  { label: 'Core Scientific',  pct: -38, note: 'fund long — 10.1% of book',     kind: 'long'  },
  { label: 'Bloom Energy',     pct: -30, note: 'fund long — 22.8% of book',     kind: 'long'  },
  { label: 'SOX Index',        pct: -29, note: 'Phila. Semiconductor benchmark', kind: 'index' },
  { label: 'SanDisk',          pct: -27, note: 'fund long — 18.8% of book',     kind: 'long'  },
  { label: 'Nvidia',           pct: -16, note: 'hedge name (fund held puts)',    kind: 'hedge' },
];

// A ~30% fall in the longs, at ~4x leverage, is a ~120% hit to the fund's own
// capital before hedges; the short book clawed it back to the −67% investors took.
const LEVERAGE = [
  { label: 'AI-infra longs, July', note: 'many names fell 27–54%', pct: -30 },
  { label: 'Hit to fund capital at ~4×', note: 'before hedges — worse than a full wipe-out', pct: -120 },
  { label: 'Actual loss after hedges', note: 'what investors took', pct: -67 },
];

const STATS = [
  { v: '+439%', label: 'Net return through June 2026', dir: 'up' },
  { v: '~$45B', label: 'Reported peak assets (from ~$225M)' },
  { v: '~4×', label: 'Gross leverage (~400%)' },
  { v: '−67%', label: 'Loss in July 2026 alone', dir: 'down' },
  { v: '6 days', label: 'From margin call to full liquidation', dir: 'down' },
  { v: '~$5B', label: 'Illiquid Anthropic stake left over' },
];

// Top of the Q1-2026 13F long book (26 names; top 5 ≈ 76%).
const POSITIONS = [
  ['Bloom Energy', 'Power generation', '22.8%'],
  ['SanDisk', 'Storage / memory', '18.8%'],
  ['CoreWeave', 'GPU cloud ("neocloud")', '14.4%'],
  ['IREN', 'Bitcoin miner → AI/HPC', '10.4%'],
  ['Core Scientific', 'Bitcoin miner → AI/HPC', '10.1%'],
];

const GLOSSARY = [
  ['Gross leverage', 'The size of your total positions divided by your own capital. At ~4× (≈400%), $1 of investor money controls ~$4 of market exposure — so every move is felt four times over.'],
  ['Margin call', 'When a prime broker demands more collateral because a leveraged position is losing. The fund can’t refuse and doesn’t control the timing or the exit price.'],
  ['Prime broker', 'The bank that lends a hedge fund money and custodies its assets. Situational Awareness used three: Goldman Sachs, JPMorgan and Bank of America.'],
  ['Neocloud', 'A new breed of GPU-rental company (CoreWeave, IREN, Nebius) that buys Nvidia chips and rents out AI compute. Small, richly valued, and highly sensitive to the AI-capex narrative.'],
  ['Beta hedge', 'A hedge built from a related-but-different instrument (e.g. shorting large-cap semis to protect small-cap “neocloud” longs). It only works if the two move together — which, in a panic, they often don’t.'],
  ['13F', 'A quarterly SEC filing that discloses a fund’s U.S. long stock positions — the window through which outsiders reconstructed this book.'],
  ['Block trade', 'A single, privately negotiated sale of an entire position or portfolio to one buyer, done off-exchange to avoid crashing the price on the open market.'],
  ['Illiquid', 'An asset you can’t sell quickly for a fair price — like a private stake in Anthropic. Worth a lot on paper; useless for meeting a margin call today.'],
];

// Jul 30 same-day intraday bounce (from block-trade low, by ~3 p.m.).
// Nvidia is included as a control — it barely moved, showing the bounce
// was not a broad market rally but specific to the forced-seller names.
const BOUNCE_INTRADAY = [
  { label: 'Cipher Mining', pct: 28 },
  { label: 'Nebius', pct: 27 },
  { label: 'Bloom Energy', pct: 26 },
  { label: 'IREN', pct: 26 },
  { label: 'SanDisk', pct: 25 },
  { label: 'CoreWeave', pct: 22 },
  { label: 'Hut 8', pct: 22 },
  { label: 'Nvidia (control)', pct: 1.9 },
];

// Multi-day recovery: by Aug 3, from the Jul-29 closing lows.
const BOUNCE_MULTIDAY = [
  { label: 'CoreWeave', pct: 41 },
  { label: 'IREN', pct: 36 },
  { label: 'SanDisk', pct: 27 },
];

// Historical leverage blow-ups for comparison table.
const BLOWUPS = [
  {
    name: 'LTCM',
    year: '1998',
    strategy: 'Convergence trades (bonds, FX, equities)',
    leverage: '~25×',
    loss: '~−90%',
    trigger: 'Russian default + correlated positions unwound simultaneously',
    rescue: 'Fed-brokered $3.6 B bank consortium bail-out',
  },
  {
    name: 'Archegos',
    year: '2021',
    strategy: 'Concentrated total-return swaps (tech & media stocks)',
    leverage: '~5–8×',
    loss: '~$20 B in days; banks lost $10 B+',
    trigger: 'ViacomCBS share sale triggered margin calls',
    rescue: 'Multi-bank fire sale — chaotic, no co-ordination',
  },
  {
    name: 'Situational Awareness',
    year: '2026',
    strategy: 'Concentrated AI-infra longs (neoclouds, memory, power)',
    leverage: '~4×',
    loss: '−67% in July',
    trigger: 'SK Hynix listing + Meta Compute news; simultaneous margin calls',
    rescue: 'Single Citadel block trade — cleanest exit of the three',
  },
];

const TIMELINE = [
  { d: '2023', b: 'Aschenbrenner joins OpenAI’s “Superalignment” team, focused on controlling smarter-than-human AI.' },
  { d: 'April 2024', b: 'OpenAI fires him, citing an alleged leak; he says the real trigger was a security memo he wrote about foreign espionage. The team is dissolved soon after.' },
  { d: 'June 2024', b: 'He publishes “Situational Awareness: The Decade Ahead” (~165 pages), predicting AGI around 2027. It becomes one of the most-discussed documents in tech.' },
  { d: 'Late 2024', b: 'He launches Situational Awareness LP with a reported ~$225M, backed by Stripe’s Collison brothers, Daniel Gross and Nat Friedman.' },
  { d: 'Through June 30, 2026', b: 'Riding the AI-infrastructure boom at ~4× leverage, the fund reportedly returns +439% net and swells to a reported $20–45B — one of the great runs in hedge-fund history.' },
  { d: 'July 10, 2026', b: 'SK Hynix — one of the fund’s largest longs — lists in the U.S. The event kicks off an unwind of leveraged Korean equity positions; Korea’s Kospi ultimately sheds roughly a third.' },
  { d: 'July 17, 2026', b: 'Meta unveils “Meta Compute,” stoking fears that the hyperscalers will crush the small “neocloud” GPU-rental names. CoreWeave, IREN and peers — core holdings — begin sliding hard.' },
  { d: 'July 24, 2026', b: 'With the book already bleeding, Aschenbrenner writes to investors calling the selloff “one of the best buying opportunities in over a year,” and asks for fresh capital starting August 1. It never arrives.' },
  { d: 'July 29, 2026', b: 'Core holdings print yearly lows. All three prime brokers — Goldman, JPMorgan, Bank of America — issue margin calls the same day. The Fed holds rates with hawkish dissents, adding pressure.', crash: true },
  { d: 'July 30, 2026', b: 'Before the open, Citadel buys the entire public book — longs and shorts together — in a single block trade (per the WSJ). The dumped names instantly rip 20–30% higher, exposing how far below fair value the forced sale had pushed them. The fund ends July down ~67%.', crash: true },
  { d: 'August 3, 2026', b: 'The rebound continues — CoreWeave +41%, IREN +36%, SanDisk +27% off their July-29 lows — underlining that this was a leverage-and-liquidity blow-up, not the market rejecting the AI thesis.' },
];

const SOURCES = [
  { t: 'Reuters (via U.S. News) — “Situational Awareness’ portfolio sinks 67% in July on AI stock rout, letter shows” (Jul 31, 2026)', u: 'https://money.usnews.com/investing/news/articles/2026-07-31/situational-awareness-portfolio-sinks-67-in-july-on-ai-stock-rout-letter-shows' },
  { t: 'CNBC — “AI investor Leopold Aschenbrenner forced to unwind all public stock positions after steep losses” (Jul 30, 2026)', u: 'https://www.cnbc.com/2026/07/30/leopold-aschenbrenners-hedge-fund-is-facing-steep-ai-losses.html' },
  { t: 'Bloomberg — “Situational Awareness Assets Fall to $10 Billion After Losses” (Jul 30, 2026)', u: 'https://www.bloomberg.com/news/articles/2026-07-30/situational-awareness-assets-fall-to-10-billion-after-losses' },
  { t: 'SpotGamma — “Anatomy of a Margin Call: How Situational Awareness LP Unwound a $20 Billion AI Book in One Trade”', u: 'https://spotgamma.com/situational-awareness-unwind-margin-call-ai/' },
  { t: 'FinanceFeeds — “Leopold Aschenbrenner: $225M to $20B to a 6-day margin call, then Citadel”', u: 'https://financefeeds.com/leopold-aschenbrenner-225m-to-20-billion-6-day-margin-call-citadel/' },
  { t: 'Blockspace — “Citadel buys bulk of Situational Awareness portfolio after AI stock losses: WSJ”', u: 'https://blockspace.media/insight/citadel-buys-situational-awareness-portfolio-2026/' },
  { t: 'TechCrunch — “Situational Awareness may have sold its public portfolio, but it still has its Anthropic shares” (Jul 30, 2026)', u: 'https://techcrunch.com/2026/07/30/ai-hedge-fund-situational-awareness-may-have-sold-its-public-portfolio-but-it-still-has-its-anthropic-shares/' },
  { t: 'Wikipedia — Leopold Aschenbrenner', u: 'https://en.wikipedia.org/wiki/Leopold_Aschenbrenner' },
  { t: 'Roman Paolucci — “Situational Awareness LP Blowup” (the YouTube video that prompted this write-up)', u: 'https://youtu.be/-h8hPIlMgvs' },
];

function Stat({ s }) {
  const cls = s.dir === 'up' ? styles.statValUp : s.dir === 'down' ? styles.statValDown : '';
  return (
    <div className={styles.stat}>
      <div className={`${styles.statVal} ${cls}`}>{s.v}</div>
      <div className={styles.statLabel}>{s.label}</div>
    </div>
  );
}

export default function SituationalAwarenessCollapse() {
  return (
    <Layout
      title="The Situational Awareness fund collapse"
      description="A deep post-mortem of how Leopold Aschenbrenner's ~4x-levered, hyper-concentrated AI-infrastructure fund went from +439% to a 67% loss in July 2026, ending in the forced sale of its entire public book — the trigger, the positions, the failed hedges, the margin calls, and the block trade to Citadel.">
      <header className="hero hero--primary" style={{ padding: '2.2rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title" style={{ fontSize: '2rem' }}>
            The Situational Awareness fund collapse
          </Heading>
          <p className="hero__subtitle">July 2026 · Anatomy of a six-day, ~4×-levered blow-up</p>
        </div>
      </header>

      <main className="container" style={{ padding: '2rem 1rem 4rem' }}>
        <article className={styles.article}>
          <Link className={styles.backLink} to="/events">← All Big Events</Link>
          <div className={styles.articleMeta}>
            <span className={styles.developing}>Post-mortem</span>
            <span>Compiled August 2026 · ~15 min read · by Joyeb Kashyeb</span>
          </div>

          <p className={styles.dek}>
            The person who wrote the most influential essay on AI&rsquo;s trajectory built a hedge
            fund on exactly that thesis, compounded it at <strong>+439%</strong>, and then lost
            roughly two-thirds of it in <strong>six trading days</strong>. The thesis wasn&rsquo;t
            what failed. The structure was: extreme concentration, ~4× leverage, and hedges that
            weren&rsquo;t really hedges.
          </p>

          <div className={styles.plainBox}>
            <Heading as="h2">The short version</Heading>
            <p>
              Leopold Aschenbrenner &mdash; the 24-year-old ex-OpenAI researcher behind the viral
              &ldquo;Situational Awareness&rdquo; essay &mdash; ran a hedge fund that made a
              concentrated, heavily leveraged bet on the <em>picks-and-shovels</em> of the AI boom:
              memory, power, and the small &ldquo;neocloud&rdquo; GPU-rental companies. It worked
              spectacularly, returning a reported +439% and ballooning from ~$225M to a reported
              $20&ndash;45B.
            </p>
            <p>
              In July 2026 the AI-infrastructure trade cracked. Because the book was ~4× leveraged
              and packed into a handful of correlated names &mdash; while its &ldquo;hedges&rdquo;
              were built on <em>different</em> stocks that didn&rsquo;t fall in step &mdash; a ~30%
              drop in the longs became a fund-ending loss. Three prime brokers called for collateral
              on the same day, and when a rescue raise failed, the whole public book was sold to
              Citadel in a single block. The stocks bounced 20&ndash;30% the moment the forced seller
              was gone &mdash; proof it was a liquidity blow-up, not a verdict on AI.
            </p>
          </div>

          <div className={styles.stats}>
            {STATS.map((s) => <Stat key={s.label} s={s} />)}
          </div>

          <nav className={styles.toc} aria-label="Table of contents">
            <div className={styles.tocTitle}>In this post-mortem</div>
            <ol className={styles.tocList}>
              <li><a href="#s-man"><span className={styles.tocNum}>1</span>The man &amp; the manifesto</a></li>
              <li><a href="#s-fund"><span className={styles.tocNum}>2</span>The fund &amp; the run</a></li>
              <li><a href="#s-book"><span className={styles.tocNum}>3</span>The concentrated book</a></li>
              <li><a href="#s-hedge"><span className={styles.tocNum}>4</span>The hedges that weren&rsquo;t</a></li>
              <li><a href="#s-lev"><span className={styles.tocNum}>5</span>Leverage, both ways</a></li>
              <li><a href="#s-trigger"><span className={styles.tocNum}>6</span>The trigger</a></li>
              <li><a href="#s-sixdays"><span className={styles.tocNum}>7</span>Six days of margin calls</a></li>
              <li><a href="#s-letters"><span className={styles.tocNum}>7½</span>The two letters</a></li>
              <li><a href="#s-exit"><span className={styles.tocNum}>8</span>The exit to Citadel</a></li>
              <li><a href="#s-bounce"><span className={styles.tocNum}>9</span>The tell: the bounce</a></li>
              <li><a href="#s-after"><span className={styles.tocNum}>10</span>The aftermath</a></li>
              <li><a href="#s-risk"><span className={styles.tocNum}>11</span>How to survive it</a></li>
              <li><a href="#s-lessons"><span className={styles.tocNum}>★</span>The lessons &amp; history</a></li>
            </ol>
          </nav>

          <div className={styles.glossary}>
            <strong>Terms used on this page</strong>
            <dl>
              {GLOSSARY.map(([term, def]) => (
                <React.Fragment key={term}>
                  <dt>{term}</dt>
                  <dd>{def}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>

          <section className={styles.section}>
            <h2 id="s-man">1. The man and the manifesto</h2>
            <p>
              Aschenbrenner is a German-born prodigy (born ~2001) who graduated top of his class at
              Columbia at 19. He joined OpenAI in 2023 on the &ldquo;Superalignment&rdquo; team
              &mdash; the group tasked with keeping smarter-than-human AI under control. OpenAI fired
              him in April 2024, citing an alleged information leak; he maintains the real reason was
              a memo warning that OpenAI wasn&rsquo;t secure against foreign espionage.
            </p>
            <p>
              In June 2024 he published{' '}
              <a href="https://situational-awareness.ai/" target="_blank" rel="noreferrer">
                &ldquo;Situational Awareness: The Decade Ahead&rdquo;
              </a>{' '}
              &mdash; a ~165-page argument that AI would hit human level around 2027, trigger an
              intelligence explosion, and become the central national-security issue of the decade.
              It was everywhere. Then he did the rare thing an essayist almost never does: he put
              billions of (mostly borrowed) dollars behind the thesis.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-fund">2. The fund and the run</h2>
            <p>
              Situational Awareness LP launched in late 2024 with a reported <strong>~$225 million</strong>,
              backed by Stripe&rsquo;s Patrick and John Collison, Daniel Gross and Nat Friedman. Its
              strategy was a concentrated wager on the AI supply chain, and for eighteen months it was
              one of the best-performing funds on the planet: a reported <strong>+439% net return</strong>{' '}
              through June 30, 2026, with assets swelling to a reported <strong>$20&ndash;45 billion</strong>.
            </p>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>Assets under management: ≈$225M → $20–45B → ~$10B</p>
              <TimeSeriesChart
                data={AUM}
                peakT={20}
                unit={{ prefix: '$', suffix: 'B' }}
                ariaLabel="The fund's assets rising from about $225M to a reported $20 to 45 billion, then collapsing in July 2026"
              />
              <figcaption className={styles.figCaption}>
                Green is the climb, red is the collapse. The near-vertical drop is the signature of a
                forced, leveraged unwind. Peak figures vary by source — roughly $20B net equity to a
                ~$45B headline that includes leveraged gross exposure; every account agrees on the shape.
              </figcaption>
            </figure>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>The investor journey — NAV normalized to 100 at launch</p>
              <TimeSeriesChart
                data={NAV}
                peakT={20}
                unit={{ prefix: '', suffix: '' }}
                yTicks={5}
                ariaLabel="Fund NAV rising from 100 at launch to 539 (plus 439 percent) then falling to 178 (minus 67 percent) in July 2026"
              />
              <figcaption className={styles.figCaption}>
                If you invested $1 at launch you watched it become <strong>$5.39</strong> by
                June 30, 2026. By July 31 it was <strong>$1.78</strong>. The same leverage
                that built the mountain excavated the valley in six days. Monthly steps
                between launch and peak are illustrative; the three labelled endpoints
                (NAV 100, +439%, −67%) are as reported.
              </figcaption>
            </figure>
          </section>

          <section className={styles.section}>
            <h2 id="s-book">3. The book: concentration as a feature — then a bug</h2>
            <p>
              The fund&rsquo;s edge was conviction, and its Q1-2026 13F showed just how much: a{' '}
              <strong>$1.86 billion disclosed long book across only 26 names</strong>, with the{' '}
              <strong>top five making up ~76%</strong>. This wasn&rsquo;t a diversified AI fund; it
              was a handful of very large, very correlated bets on memory, power, and the small
              GPU-rental &ldquo;neoclouds.&rdquo;
            </p>

            <table className={styles.posTable}>
              <thead>
                <tr><th>Top holding</th><th>What it is</th><th>% of book</th></tr>
              </thead>
              <tbody>
                {POSITIONS.map(([name, what, pct]) => (
                  <tr key={name}><td>{name}</td><td>{what}</td><td>{pct}</td></tr>
                ))}
              </tbody>
            </table>
            <figure className={styles.figure} style={{ marginTop: '1.2rem' }}>
              <p className={styles.figTitle}>Portfolio concentration — % of disclosed long book (Q1-2026 13F)</p>
              <svg
                viewBox="0 0 780 230"
                role="img"
                aria-label="Portfolio concentration bar chart showing top 5 holdings"
                preserveAspectRatio="xMidYMid meet"
                style={{ display: 'block', width: '100%', height: 'auto', fontFamily: 'var(--ifm-font-family-base)' }}
              >
                {CONC_BARS.map((r, i) => {
                  const cy     = 16 + i * 35 + 17;
                  const innerW = 780 - 200 - 90;
                  const barW   = (r.pct / 100) * innerW;
                  const isOther = r.label === 'Other 21 names';
                  const fill   = isOther ? 'var(--viz-muted)' : 'var(--viz-s1)';
                  return (
                    <g key={r.label}>
                      <text x={188} y={cy - 3}  textAnchor="end" style={{ fill: 'var(--viz-ink)',   fontSize: '13px', fontWeight: 600 }}>{r.label}</text>
                      <text x={188} y={cy + 12} textAnchor="end" style={{ fill: 'var(--viz-muted)', fontSize: '10.5px' }}>{r.note}</text>
                      <rect x={200} y={cy - 13} width={innerW} height={24} rx={4} fill="var(--viz-panel-bg)" />
                      <rect x={200} y={cy - 13} width={barW}   height={24} rx={4} fill={fill} opacity={isOther ? 0.45 : 0.88} />
                      <text x={200 + barW + 8} y={cy + 5} style={{ fill, fontSize: '14px', fontWeight: 800 }}>{r.pct}%</text>
                    </g>
                  );
                })}
              </svg>
              <figcaption className={styles.figCaption}>
                The top 5 names account for <strong>76.5%</strong> of the book.
                The remaining 21 positions share only 23.5%. At that concentration,
                a single-name move is fund-defining — and an exit without moving
                the market against yourself is nearly impossible.
              </figcaption>
            </figure>

            <p className={styles.posCaption}>
              Source: Q1-2026 13F. The fund also held ~8.2% of Core Scientific&rsquo;s entire float,
              4&ndash;5% stakes in Applied Digital, CleanSpark and WhiteFiber, plus Riot, Bitdeer,
              HIVE and several power names — and a large overseas long in Korea&rsquo;s SK Hynix.
            </p>
            <p>
              Owning 8% of a company&rsquo;s float is easy to buy and brutal to sell: there simply
              isn&rsquo;t anyone on the other side when you need to exit in a hurry. Concentration is
              what produced the +439%. It&rsquo;s also what made an orderly exit impossible.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-hedge">4. The hedges that weren&rsquo;t</h2>
            <p>
              Aschenbrenner wasn&rsquo;t naked-long &mdash; he thought he was protected. Against the
              longs he ran a large short/optioned book: roughly <strong>$8.5 billion in put options</strong>{' '}
              across Nvidia, AMD, ASML, TSMC, Broadcom, Oracle and Micron, about <strong>$3.0B notional
              in puts on the SMH semiconductor ETF</strong>, ~$1.6B against Nvidia, and software shorts
              like Adobe.
            </p>
            <p>
              The flaw was subtle but fatal. His <em>longs</em> were small, high-volatility neoclouds
              and miners; his <em>hedges</em> were on large-cap semis and software. That&rsquo;s a{' '}
              <strong>beta hedge across two different volatility regimes</strong>. When the AI complex
              sold off, the small, fragile longs fell <em>far</em> more than the big, liquid names he
              was short &mdash; so the hedge recovered only a fraction of the loss, while the software
              shorts moved against him at the same time. A &ldquo;long/short double whammy.&rdquo;
              The insurance paid pennies on the dollar exactly when it was needed most.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-lev">5. Leverage: the multiplier in both directions</h2>
            <p>
              The same ~4× gross leverage that manufactured the +439% is what made a rough month
              lethal. At 4×, a <strong>25% fall in the underlying positions mathematically wipes out
              the entire equity</strong>. In July the longs fell closer to 30%:
            </p>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>How ~4× leverage turned a 30% dip into a 67% loss</p>
              <LeverageBars rows={LEVERAGE} />
              <figcaption className={styles.figCaption}>
                A ~30% decline in the longs, levered ~4×, is a ~120% hit to the fund&rsquo;s own
                capital <em>before</em> hedges — i.e. worse than a total wipe-out. The short book
                clawed part of it back, leaving the ~67% loss investors actually took. Leverage is
                symmetric: it giveth the 439%, and it taketh the 67%.
              </figcaption>
            </figure>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>The leverage ladder — equity impact at every level</p>
              <LeverageLadder actualDrop={-30} actualLev={4} />
              <figcaption className={styles.figCaption}>
                Each cell = underlying drop × leverage multiple = equity impact,{' '}
                <em>before</em> any hedges. At <strong>4× leverage</strong>, a 25% underlying
                drop already wipes out 100% of investor capital. The fund&rsquo;s longs fell
                closer to 30%. The outlined cell is the Situational Awareness scenario.
              </figcaption>
            </figure>
          </section>

          <section className={styles.section}>
            <h2 id="s-trigger">6. The trigger: July&rsquo;s AI-infrastructure crack</h2>
            <p>
              The unwind had two fuses. On <strong>July 10</strong>, SK Hynix &mdash; one of the
              largest longs &mdash; listed in the U.S., which set off an unwind of crowded, leveraged
              Korean equity positions; Korea&rsquo;s Kospi eventually shed about a third. Then on{' '}
              <strong>July 17</strong>, Meta unveiled &ldquo;Meta Compute,&rdquo; and the market
              panicked that hyperscalers would steamroll the small neocloud renters at the heart of
              the fund&rsquo;s book.
            </p>
            <p>
              The damage compounded fast. The Philadelphia Semiconductor Index fell ~28.6% from its
              June peak; a momentum-tech basket dropped over 50%; the Nasdaq-100 lost 10%+. The
              fund&rsquo;s own names cratered — the core longs each fell 27–54% from their June
              peaks to the July 29 forced-sale lows. Underneath it all was a genuine question
              investors had started asking out loud:{' '}
              <em>will the hundreds of billions being poured into AI infrastructure actually
              turn into near-term profits?</em>
            </p>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>July 2026 drawdowns — June peak to Jul-29 lows, by name</p>
              <DeclineBars rows={JULY_DECLINES} />
              <figcaption className={styles.figCaption}>
                <span style={{ color: 'var(--viz-crit)', fontWeight: 700 }}>Red bars</span> = fund
                long positions.{' '}
                <span style={{ color: 'var(--viz-s3)', fontWeight: 700 }}>Amber bar</span> = Nvidia,
                a hedge instrument (the fund held put options). Nvidia fell <em>far less</em> than
                the small-cap longs — that gap is exactly why the beta hedge failed to offset
                the losses.{' '}
                <span style={{ color: 'var(--viz-muted)', fontWeight: 700 }}>Grey bar</span> = SOX
                semiconductor index for benchmark context. Decline percentages are approximate;
                reported figures vary by source and exact measurement dates.
              </figcaption>
            </figure>
          </section>

          <section className={styles.section}>
            <h2 id="s-sixdays">7. Six days: the letter and the margin calls</h2>
            <p>
              What makes this a classic isn&rsquo;t just the loss &mdash; it&rsquo;s the timing. On{' '}
              <strong>July 24</strong>, already deep in the red, Aschenbrenner sent investors a letter
              framing the crash as <em>&ldquo;one of the best buying opportunities in over a year&rdquo;</em>{' '}
              and invited fresh capital starting August 1. He was doubling down, not de-risking. The
              new money never came.
            </p>
            <p>
              On <strong>July 29</strong>, the core holdings printed fresh yearly lows, and all three
              prime brokers &mdash; Goldman Sachs, JPMorgan and Bank of America &mdash; issued margin
              calls on the same day. That&rsquo;s the moment control leaves the building: once the
              banks want collateral, the fund no longer decides <em>when</em> or <em>at what price</em>{' '}
              it sells. A scramble for rescue capital and lenders (described as ad-hoc, not
              coordinated) failed, and even an offer of the prized Anthropic stake to investors
              couldn&rsquo;t plug the hole in time.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-letters">7½. The letters: five days, two completely different realities</h2>
            <p>
              There were two letters to investors. Reading them back to back is the most concise
              possible education in what leverage does to time horizons. The first was written five
              days before the margin calls. The second was written the day after the forced sale.
            </p>

            <div className={styles.letterWrap}>
              {/* ── Letter 1: July 24 ── */}
              <div className={`${styles.letter} ${styles.letterBullish}`}>
                <div className={styles.letterHeader}>
                  <span>📩 Investor letter</span>
                  <span className={styles.letterDate}>July 24, 2026 — five days before the margin calls</span>
                </div>
                <div className={styles.letterBody}>
                  <p>
                    With the fund already deep in the red, Aschenbrenner wrote to his investors
                    framing the sell-off not as a crisis but as an opportunity. He called it:
                  </p>
                  <blockquote className={styles.letterQuote}>
                    &ldquo;One of the best buying opportunities in over a year&rdquo; — specifically,
                    the best since <strong>April 2025</strong>.
                  </blockquote>
                  <p>
                    He was not reducing risk. He was doubling down, asking investors to contribute
                    fresh capital starting <strong>August 1</strong>. The margin calls arrived first,
                    on July 29 &mdash; five days after the letter, and three days before the new
                    money could come in.
                  </p>
                  <p>
                    This is not evidence that Aschenbrenner was incompetent. His AI thesis may
                    well prove correct over years. The letter is evidence of something more
                    dangerous: at extreme leverage, <em>even a correct thesis can be forced out of its
                    positions before it pays off</em>. You can be right and still not survive to collect.
                  </p>
                  <p className={styles.letterNote}>
                    Source: reported by Reuters, CNBC, Inc. and others citing the investor
                    communication dated July 24, 2026.
                  </p>
                </div>
              </div>

              {/* ── Letter 2: July 31 ── */}
              <div className={`${styles.letter} ${styles.letterBear}`}>
                <div className={styles.letterHeader}>
                  <span>📩 Investor letter</span>
                  <span className={styles.letterDate}>July 31, 2026 — one day after the forced sale to Citadel</span>
                </div>
                <div className={styles.letterBody}>
                  <p>
                    After the entire public book had been sold to Citadel and the fund had finished
                    July down 67%, Aschenbrenner sent a second letter. The tone could not have been
                    more different:
                  </p>
                  <blockquote className={styles.letterQuote}>
                    &ldquo;We let you down this month. We came closer to permanent capital
                    impairment than is acceptable to us.&rdquo;
                  </blockquote>
                  <blockquote className={styles.letterQuote}>
                    &ldquo;While we ultimately found a solution that protected the fund and you as
                    investors, our intention in running the fund is to never find ourselves in such
                    a position in the first place.&rdquo;
                  </blockquote>
                  <blockquote className={styles.letterQuote}>
                    &ldquo;Volatility is the price of long-term investment returns. Over the past
                    two years, we have delivered outstanding results, despite occasional sharp
                    pullbacks. But our fund must always be structured such that we can take a loss
                    and fight another day. I will make it my mission to ensure that we learn the
                    necessary lessons from this experience.&rdquo;
                  </blockquote>
                  <p>
                    He took full responsibility, pledged to <strong>stop borrowing from banks to
                    amplify public-market bets</strong>, and committed to restructuring the fund&rsquo;s
                    risk management. He noted the fund remained up roughly{' '}
                    <strong>+80% for 2026</strong> due to the first half&rsquo;s gains — a number that
                    gives some context to the damage but does not undo the six-day experience for
                    anyone who joined closer to the peak.
                  </p>
                  <p className={styles.letterNote}>
                    Direct quotes as reported by Business Insider, Financial Express and others
                    citing the investor communication dated July 31, 2026. The full letter has not
                    been publicly released; these are excerpts reported by news outlets.
                  </p>
                </div>
              </div>
            </div>

            <p>
              The five-day gap between those two letters is the whole story in miniature. Conviction,
              leverage, and a wrong estimate of how much time you have left are a combination that
              even the most accurate thesis cannot survive.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-exit">8. The exit: one block, one buyer</h2>
            <p>
              Before the open on <strong>July 30</strong>, the fund sold its <strong>entire public
              book &mdash; longs and shorts together</strong> &mdash; in a single negotiated block to
              Ken Griffin&rsquo;s <strong>Citadel</strong> (per the Wall Street Journal). Selling it
              piecemeal on the open market would have flooded the tape with 8% of Core Scientific&rsquo;s
              float and other outsized positions, overwhelming buyers and triggering sympathetic
              selling across the whole AI-infra complex. One block to one deep-pocketed buyer
              contained the damage &mdash; a notably cleaner unwind than the chaotic, multi-bank fire
              sale that defined Archegos in 2021.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-bounce">9. The tell: the bounce</h2>
            <p>
              Here is the most revealing part. The instant the forced seller was gone, the exact same
              stocks ripped higher — by 3 p.m. that day Nebius was +27%, IREN +26%, Bloom Energy +26%,
              SanDisk +25%, CoreWeave +22%. Even names the fund <em>never owned</em>{' '}
              (Cipher Mining +28%, Hut 8 +22%) jumped in sympathy. Meanwhile large-caps like
              Nvidia — which the fund was <em>short</em> as a hedge — barely twitched (+1.9%).
              The rebound kept going: by August 3, CoreWeave was +41% and IREN +36% off their
              July-29 lows.
            </p>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>The bounce: stocks ripped the moment the forced seller was gone</p>
              <RecoveryBars rowsA={BOUNCE_INTRADAY} rowsB={BOUNCE_MULTIDAY} />
              <figcaption className={styles.figCaption}>
                <strong>Same-day:</strong> Jul 30 intraday bounce from the block-trade low, by ~3 p.m.
                Cipher Mining and Hut 8 were <em>not</em> fund holdings — they bounced purely in
                sympathy. Nvidia (+1.9%) is included as a control; it barely moved, confirming this
                was a liquidity event, not a broad AI sell-off.{' '}
                <strong>Multi-day:</strong> CoreWeave, IREN and SanDisk recovery by Aug 3 from
                their Jul-29 lows (+41%, +36%, +27% respectively).
              </figcaption>
            </figure>

            <p>
              That gap between the forced-seller price and where willing owners valued the same shares
              a day later is the whole lesson in one number. The market didn&rsquo;t decide AI
              infrastructure was worthless. A single over-levered holder <em>had</em> to sell into a
              vacuum, and price briefly detached from value. The fund didn&rsquo;t lose its public book
              because it was wrong; it lost it because it couldn&rsquo;t carry its leverage long enough
              to be early.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-after">10. The aftermath</h2>
            <p>
              July closed with the fund down about <strong>67%</strong>. Bloomberg reported on July 30 that its
              assets had fallen to about <strong>$10 billion</strong>, and TechCrunch that it still held its
              Anthropic shares. What remained was largely{' '}
              <strong>illiquid</strong>: a private stake in Anthropic reported around <strong>$5 billion</strong>,
              acquired earlier in 2026 &mdash; valuable, but impossible to sell into a margin call. The
              fund&rsquo;s July 24 letter had asked investors for fresh capital from August 1. The cruel irony wrote itself: the
              man who literally authored &ldquo;Situational Awareness&rdquo; was undone by a blind spot
              in his own &mdash; the tail risk hiding inside his leverage and his hedges.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-risk">11. The version that survives: how a risk desk would have caught it</h2>
            <p>
              None of this required hindsight. Every guardrail that would have saved the fund is
              standard practice on any institutional risk desk. The <em>thesis</em> didn&rsquo;t have
              to change &mdash; only the <em>sizing</em>.
            </p>
            <div className={styles.lessons}>
              <ul>
                <li>
                  <strong>Concentration limits.</strong> A hard cap of ~10% gross per name and ~35%
                  across the top five forces real diversification. SA ran its top five at ~76% and
                  held 8% of one company&rsquo;s float — a position you cannot exit without moving the
                  price against yourself.
                </li>
                <li>
                  <strong>Liquidity-adjusted leverage.</strong> Leverage should scale to how fast you
                  can get out. 4× on small, thinly-traded neoclouds is a different animal from 4× on
                  mega-caps. A liquidity-weighted limit would have pinned this book closer to ~2×.
                </li>
                <li>
                  <strong>Correlation-aware hedging.</strong> Hedge with the thing you actually own.
                  Shorting low-beta mega-cap semis to cover high-beta small-caps is a hedge ratio well
                  under 1 — it was always going to pay pennies in a panic.
                </li>
                <li>
                  <strong>Stress tests, not just averages.</strong> One scenario — &ldquo;AI complex
                  −30%, correlations → 1&rdquo; — run at 4× prints a <em>&gt;100% equity loss</em>.
                  That is a number a risk committee vetoes before the trade is ever put on.
                </li>
              </ul>
            </div>
            <p className={styles.analogy}>
              <strong>The counterfactual:</strong> at <strong>2× instead of 4×</strong>, that same
              ~30% drop is roughly a 60% gross hit — brutal, but with the hedges clawing part of it
              back, survivable. No margin call forces the door; you live to see the very next day,
              when the same names bounced 20&ndash;30%. Halving the leverage doesn&rsquo;t just halve
              the loss — it changes the outcome from <em>terminal</em> to <em>temporary</em>. That is
              the whole game: size so that being early is survivable.
            </p>
            <div className={styles.learnBox}>
              <strong>Learn the concepts behind this story →</strong>
              <ul>
                <li><Link to="/docs/Finance/valuation-and-risk">Valuation &amp; risk</Link> — VaR, stress testing and position limits.</li>
                <li><Link to="/docs/Finance/derivatives">Derivatives</Link> — how the put-option hedges here actually work.</li>
                <li><Link to="/docs/Probability/stochastic-processes">Stochastic processes</Link> — why correlations drift toward 1 in a crisis.</li>
                <li><Link to="/terminal">Market terminal</Link> — watch some of these very tickers move in real time.</li>
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Timeline</h2>
            <ul className={styles.timeline}>
              {TIMELINE.map((e, i) => (
                <li key={i} className={`${styles.tItem} ${e.crash ? styles.tItemCrash : ''}`}>
                  <div className={styles.tDate}>{e.d}</div>
                  <p className={styles.tBody}>{e.b}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.section}>
            <h2 id="s-lessons">Why it matters — the lessons</h2>
            <div className={styles.lessons}>
              <ul>
                <li>
                  <strong>Being right isn&rsquo;t enough; you have to survive to collect.</strong> The
                  AI thesis may be entirely correct over a decade and still wipe you out over a week,
                  because leverage sets a clock the market doesn&rsquo;t care about. Solvency, not
                  accuracy, decides who&rsquo;s still standing.
                </li>
                <li>
                  <strong>Leverage is perfectly symmetric.</strong> The +439% and the −67% came off the
                  same ~4× dial. There is no version of the strategy that keeps the upside and skips
                  the downside.
                </li>
                <li>
                  <strong>A hedge is only a hedge if it&rsquo;s truly correlated.</strong> Shorting
                  large-cap semis to protect small-cap neoclouds looked like insurance and behaved like
                  a second losing bet when the panic hit. Different volatility regimes don&rsquo;t offset.
                </li>
                <li>
                  <strong>Concentration and liquidity are the same risk wearing two hats.</strong>{' '}
                  Owning 8% of a company&rsquo;s float is wonderful until you must exit — then there&rsquo;s
                  no one to sell to except at a crushing discount.
                </li>
                <li>
                  <strong>Margin calls, not managers, choose the exit.</strong> Once three prime brokers
                  call on the same morning, timing and price are out of your hands.
                </li>
                <li>
                  <strong>Forced-seller prices aren&rsquo;t fair value.</strong> The 20&ndash;30%
                  same-day bounce proved the crash was a plumbing failure, not a fundamental verdict.
                </li>
              </ul>
            </div>
            <p>
              It rhymes with history. <strong>Long-Term Capital Management</strong> (1998) &mdash; run
              by Nobel laureates &mdash; blew up on enormous leverage and correlated bets that all went
              wrong together. <strong>Archegos</strong> (2021) vaporized $20 B in days on concentrated,
              levered swaps. Different decade, same physics: brilliance + leverage + concentration,
              detonated by a move the model assumed couldn&rsquo;t happen.
            </p>

            <table className={styles.posTable} style={{ marginTop: '1.4rem' }}>
              <thead>
                <tr>
                  <th>Fund</th>
                  <th>Year</th>
                  <th>Gross leverage</th>
                  <th>Loss</th>
                  <th>Trigger</th>
                  <th>Resolution</th>
                </tr>
              </thead>
              <tbody>
                {BLOWUPS.map((b) => (
                  <tr key={b.name}>
                    <td><strong>{b.name}</strong></td>
                    <td>{b.year}</td>
                    <td>{b.leverage}</td>
                    <td style={{ color: 'var(--viz-crit)', fontWeight: 700 }}>{b.loss}</td>
                    <td>{b.trigger}</td>
                    <td>{b.rescue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.posCaption} style={{ marginBottom: 0 }}>
              Each blow-up had a different thesis and a different decade. The common thread was
              structural: leverage amplified a correlated move that the risk model said was unlikely.
            </p>
          </section>

          <div className={styles.sources}>
            <strong>Sources &amp; further reading</strong>
            <ol>
              {SOURCES.map((s) => (
                <li key={s.u}>
                  <a href={s.u} target="_blank" rel="noreferrer">{s.t}</a>
                </li>
              ))}
            </ol>
            <p className={styles.disclaimer}>
              Figures are as reported by news outlets and analysts in late July and early August 2026
              and vary between sources (notably peak AUM and the exact size of the book) — treat the
              specific numbers as approximate and the sequence of events as the reliable part. This
              page is an educational post-mortem, not investment advice.
            </p>
          </div>
        </article>
      </main>
    </Layout>
  );
}
