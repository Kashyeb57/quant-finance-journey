import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

/*
 * Jane Street's $15 billion month — August 2026 post-mortem.
 * The world's most profitable trading firm takes its first losing month in a
 * decade, from its "hedge-fund side" (AI + Asian directional bets, including a
 * stake in the Situational Awareness fund). Same July storm that forced SA to liquidate its public book —
 * opposite outcome, because of scale, diversification and internal capital.
 */

// Magnitude comparison ($B) — the loss set against the numbers that absorbed it.
const SCALE = [
  { label: 'July 2026 loss', note: 'the one down month', val: 15, kind: 'loss' },
  { label: '2025 net trading revenue', note: 'prior Wall Street record', val: 39.6, kind: 'rev' },
  { label: '2026 revenue · Jan–Jul', note: 'already above all of 2025, after the loss', val: 40, kind: 'rev' },
  { label: 'Members’ equity', note: 'internal capital — no outside investors', val: 45, kind: 'cap' },
];

// The biggest single-episode trading losses in history ($B, approximate).
const LOSSES = [
  { name: 'Jane Street', year: '2026', v: 15, note: 'AI + Asian directional book (this event)' },
  { name: 'Morgan Stanley', year: '2007', v: 9.0, note: 'Howie Hubler’s subprime desk' },
  { name: 'Société Générale', year: '2008', v: 7.2, note: 'Kerviel rogue-trade unwind' },
  { name: 'Amaranth', year: '2006', v: 6.6, note: 'natural-gas bet — firm ended' },
  { name: 'JPMorgan', year: '2012', v: 6.2, note: '“London Whale” credit derivatives' },
  { name: 'LTCM', year: '1998', v: 4.6, note: 'levered convergence — firm ended' },
];

const STATS = [
  { v: '~$15B', label: 'July trading loss — its first losing month in ~a decade', dir: 'down' },
  { v: '>$40B', label: 'Net trading revenue, Jan–Jul 2026 — already above all of 2025', dir: 'up' },
  { v: '~$680M', label: 'Average loss per trading day in July (22 sessions)', dir: 'down' },
  { v: '$39.6B', label: '2025 net trading revenue — the prior Wall Street record' },
  { v: '~$45B', label: 'Members’ equity — its own capital, no outside LPs' },
  { v: '$14.6B', label: 'Bonds issued days later (led by JPMorgan)' },
];

const GLOSSARY = [
  ['Market maker', 'A firm that continuously quotes both a buy and a sell price and earns the spread between them, providing liquidity. Done well it is close to market-neutral — it makes money on volume and flow, not on the market going up or down. This is Jane Street’s core business.'],
  ['Proprietary (prop) trading', 'Trading the firm’s own capital for its own profit, rather than executing for clients. Jane Street is a prop firm: the money at risk is its own.'],
  ['Directional bet', 'A position that only profits if the market moves a particular way. Unlike market-making, it takes a view. This is the “hedge-fund side” of Jane Street — and where the July loss came from.'],
  ['Members’ equity', 'The partners’ own capital retained inside the firm (~$45B). Jane Street funds its trading from this instead of outside investors — which means no external LP can pull money and no prime broker can margin-call the firm out of a position.'],
  ['Put option', 'The right to sell an asset at a fixed price — insurance against a fall. It pays off in a sharp crash, but bleeds value (theta) and pays little in a slow, grinding decline. That gap is why Jane Street’s hedges “offered limited protection” in July.'],
  ['Net trading revenue', 'The headline metric for a trading firm: trading gains minus losses and costs. Jane Street’s $39.6B in 2025 was the largest of any firm on Wall Street.'],
  ['Situational Awareness', 'The ~4×-levered AI hedge fund (run by ex-OpenAI researcher Leopold Aschenbrenner) that Jane Street had invested in. It blew up in the same July rout and was force-sold to Citadel — the subject of a separate post-mortem on this site.'],
  ['Margin call', 'A lender’s demand for more collateral against a falling position. It is what destroyed Situational Awareness — and precisely the mechanism Jane Street’s all-internal capital structure is built to never face.'],
];

const TIMELINE = [
  { d: '2000', b: 'Jane Street is founded in New York. Over 25 years it grows into a secretive, ~3,500-person quant powerhouse making markets across equities, bonds, options and ETFs on 200+ exchanges in ~45 countries — the dominant force in ETF liquidity.' },
  { d: 'July 2025', b: 'India’s regulator SEBI bars Jane Street from Indian markets and orders it to disgorge ~₹4,844 crore (~$565M) — its largest-ever impounding — over alleged index-options manipulation across 18 expiry days. The firm disputes it, deposits the sum, and access is later restored. It is big enough to shrug even this off.' },
  { d: '2025 (full year)', b: 'A record year: ~$39.6B in net trading revenue — more than Citadel Securities (~$12.2B), Hudson River Trading (~$12.3B), or JPMorgan’s entire trading division (~$35.8B). Members’ equity has grown ~2,000% since 2016 to ~$45B.' },
  { d: 'Early July 2026', b: 'The AI-infrastructure trade cracks. SK Hynix’s U.S. listing (Jul 10) and Meta’s “Meta Compute” reveal (Jul 17) touch off a rout in memory, power and the small “neocloud” names — the same storm engulfing the Situational Awareness fund.' },
  { d: 'Jul 24–30, 2026', b: 'Situational Awareness — which Jane Street had invested in — is margin-called and force-sells its entire public book to Citadel. Through the month Jane Street’s own AI-adjacent longs and its directional bets in Asian equities bleed, while its put-option hedges give back only a fraction against the slow grind down.', crash: true },
  { d: 'End of July 2026', b: 'Jane Street closes the month with a ~$15B loss — its first unprofitable month in roughly a decade, and one of the largest single-firm trading losses in history. Yet its net trading revenue for January–July 2026 still exceeds $40B — already more than all of 2025.', crash: true },
  { d: 'Aug 14–15, 2026', b: 'Bloomberg and the FT report the loss. Partner Turner Batty says “July was a bad month,” adding the firm has “closed a significant portion of our risk in the specific areas we lost on in July” and cut risk elsewhere.' },
  { d: 'Week of Aug 17, 2026', b: 'Jane Street issues $14.6B in bonds — led by JPMorgan, with PIMCO, Capital Group and Fidelity buying — to refinance floating-rate debt and reorganize its ~$11B capital stack. A firm that just lost $15B is met with strong demand for its paper.' },
];

const SOURCES = [
  { t: 'Bloomberg — “Jane Street Lost $15 Billion in Its First Down Month in a Decade” (Aug 14, 2026)', u: 'https://www.bloomberg.com/news/articles/2026-08-14/jane-street-took-15-billion-loss-in-july-as-ai-stocks-slumped' },
  { t: 'Bloomberg — “Jane Street’s $15 Billion Loss Lays Bare Its Hedge Fund Side” (Aug 17, 2026)', u: 'https://www.bloomberg.com/news/articles/2026-08-17/jane-street-s-15-billion-loss-lays-bare-its-hedge-fund-side' },
  { t: 'Fortune — “Jane Street lost $15 billion in its first down month in a decade” (Aug 15, 2026)', u: 'https://fortune.com/2026/08/15/jane-street-loss-15-billion-situational-awareness-stake-ai-bets/' },
  { t: 'Reuters via Yahoo Finance — “Jane Street takes $15 billion hit following tech sell-off, FT reports”', u: 'https://finance.yahoo.com/markets/stocks/articles/jane-street-takes-15-billion-222108224.html' },
  { t: 'Briefs.co — “Jane Street’s July Setback: A Rare Loss for the Trading Giant”', u: 'https://www.briefs.co/news/jane-street-s-july-setback-a-rare-loss-for-the-trading-giant/' },
  { t: 'BigGo Finance — “Jane Street Posts Rare $15 Billion Monthly Loss in July as AI Bets Suffer Extreme Drawdown”', u: 'https://finance.biggo.com/news/58e6113d-8c1a-4edc-a2fb-f9ac1192b0ce' },
  { t: 'Young & Calculated — “Jane Street: The Full Story of Wall Street’s Most Profitable Black Box” (firm profile, revenue, headcount, equity)', u: 'https://youngandcalculated.substack.com/p/jane-street-the-full-story-of-wall' },
  { t: 'CNBC — “Indian regulator bars Jane Street… freezes $566 million over Nifty 50 manipulation claims” (Jul 4, 2025)', u: 'https://www.cnbc.com/2025/07/04/indian-regulator-bars-us-trading-firm-jane-street-from-accessing-securities-market.html' },
  { t: 'Business Standard — “Sebi bars Jane Street, orders ₹4,844 cr disgorgement over market manipulation” (Jul 4, 2025)', u: 'https://www.business-standard.com/markets/news/sebi-bars-jane-street-orders-rs-4844-cr-disgorgement-market-manipulation-125070400081_1.html' },
  { t: 'Wikipedia — Jane Street Capital', u: 'https://en.wikipedia.org/wiki/Jane_Street_Capital' },
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

// Inline horizontal-bar chart (same visual language as the other event pages).
function BarChart({ rows, max, valueFmt, fillFor, labelW = 210, ariaLabel, rowH = 38 }) {
  const height = rows.length * rowH + 20;
  const innerW = 780 - labelW - 90;
  return (
    <svg
      viewBox={`0 0 780 ${height}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: 'auto', fontFamily: 'var(--ifm-font-family-base)' }}
    >
      {rows.map((r, i) => {
        const cy = 14 + i * rowH + 17;
        const barW = (r._val / max) * innerW;
        const fill = fillFor(r);
        return (
          <g key={r._label}>
            <text x={labelW - 12} y={cy - 3} textAnchor="end" style={{ fill: 'var(--viz-ink)', fontSize: '13px', fontWeight: 600 }}>{r._label}</text>
            <text x={labelW - 12} y={cy + 12} textAnchor="end" style={{ fill: 'var(--viz-muted)', fontSize: '10.5px' }}>{r._note}</text>
            <rect x={labelW} y={cy - 13} width={innerW} height={24} rx={4} fill="var(--viz-panel-bg)" />
            <rect x={labelW} y={cy - 13} width={barW} height={24} rx={4} fill={fill} opacity={0.9} />
            <text x={labelW + barW + 8} y={cy + 5} style={{ fill, fontSize: '14px', fontWeight: 800 }}>{valueFmt(r._val)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function JaneStreet15bLoss() {
  const scaleRows = SCALE.map((r) => ({ ...r, _label: r.label, _note: r.note, _val: r.val }));
  const lossRows = LOSSES.map((r) => ({ ...r, _label: `${r.name} · ${r.year}`, _note: r.note, _val: r.v }));
  return (
    <Layout
      title="Jane Street’s $15 billion month"
      description="A post-mortem of how Jane Street — the most profitable trading firm on Wall Street — took a ~$15B loss in July 2026, its first down month in a decade, from its 'hedge-fund side': AI-infrastructure bets, Asian equities, and a stake in the Situational Awareness fund. Why the same July storm cost one fund about two-thirds of its value and barely dented the other.">
      <header className="hero hero--primary" style={{ padding: '2.2rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title" style={{ fontSize: '2rem' }}>
            Jane Street&rsquo;s $15 billion month
          </Heading>
          <p className="hero__subtitle">July 2026 · the most profitable firm on Wall Street has its first losing month in a decade</p>
        </div>
      </header>

      <main className="container" style={{ padding: '2rem 1rem 4rem' }}>
        <article className={styles.article}>
          <Link className={styles.backLink} to="/events">← All Big Events</Link>
          <div className={styles.articleMeta}>
            <span className={styles.developing}>Post-mortem</span>
            <span>Compiled August 2026 · ~12 min read · by Joyeb Kashyeb</span>
          </div>

          <p className={styles.dek}>
            <strong>Jane Street</strong> is the quiet colossus of modern markets &mdash; a secretive
            quant firm that out-earns every bank trading desk on Earth. In July 2026 it did something
            it hadn&rsquo;t done in roughly a decade: it lost money. About <strong>$15 billion</strong> of it.
            The loss didn&rsquo;t come from the market-making machine that made it famous. It came from
            its <em>other</em> side &mdash; the hedge-fund-style directional bets it has quietly grown,
            including a stake in the same <Link to="/events/situational-awareness-collapse">Situational
            Awareness</Link> fund that lost about two-thirds of its value in the very same storm.
          </p>

          <div className={styles.plainBox}>
            <Heading as="h2">The short version</Heading>
            <p>
              Jane Street makes markets &mdash; it quotes buy and sell prices across thousands of
              instruments and earns the spread, mostly market-neutral. But it has increasingly added
              longer-term <em>directional</em> bets &ldquo;in line with a hedge fund&rdquo; (its own
              words). In July 2026 that hedge-fund side got caught in the AI-infrastructure rout: its
              AI-adjacent longs fell, its bets in <strong>Asian equities</strong> went the wrong way,
              its stake in the leveraged <strong>Situational Awareness</strong> fund was marked down as
              that fund was force-sold to Citadel, and its <strong>put-option hedges paid little</strong>{' '}
              against a slow, month-long grind rather than one clean crash.
            </p>
            <p>
              The result was a ~$15B loss &mdash; among the largest single-firm trading losses ever.
              And yet: Jane Street barely flinched. It runs on <strong>~$45B of its own
              capital</strong> (no outside investors to redeem), its borrowing is term debt rather than
              margin loans a lender can call overnight, its net trading revenue for{' '}
              <em>January&ndash;July 2026 alone</em> &mdash; <strong>$40B+</strong> &mdash; already tops all
              of 2025, and within days it sold <strong>$14.6B of bonds</strong> to eager buyers. Same
              July storm as Situational Awareness &mdash; opposite ending. The difference wasn&rsquo;t
              the thesis. It was the <strong>structure</strong>: scale, diversification, and capital
              that can&rsquo;t be yanked away.
            </p>
          </div>

          <div className={styles.stats}>
            {STATS.map((s) => <Stat key={s.label} s={s} />)}
          </div>

          <nav className={styles.toc} aria-label="Table of contents">
            <div className={styles.tocTitle}>In this post-mortem</div>
            <ol className={styles.tocList}>
              <li><a href="#s-firm"><span className={styles.tocNum}>1</span>The black box</a></li>
              <li><a href="#s-two"><span className={styles.tocNum}>2</span>The two Jane Streets</a></li>
              <li><a href="#s-july"><span className={styles.tocNum}>3</span>What happened in July</a></li>
              <li><a href="#s-sa"><span className={styles.tocNum}>4</span>The Situational Awareness link</a></li>
              <li><a href="#s-hedge"><span className={styles.tocNum}>5</span>The hedge that didn&rsquo;t</a></li>
              <li><a href="#s-survive"><span className={styles.tocNum}>6</span>Why $15B didn&rsquo;t kill them</a></li>
              <li><a href="#s-history"><span className={styles.tocNum}>7</span>Among the biggest losses ever</a></li>
              <li><a href="#s-response"><span className={styles.tocNum}>8</span>The response &amp; the bonds</a></li>
              <li><a href="#s-fates"><span className={styles.tocNum}>9</span>Same storm, two fates</a></li>
              <li><a href="#s-lessons"><span className={styles.tocNum}>★</span>The lessons</a></li>
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
            <h2 id="s-firm">1. The black box that out-earns every bank</h2>
            <p>
              Founded in 2000, Jane Street is the most profitable trading firm almost nobody outside
              finance has heard of. With only ~3,500 employees, it makes markets across equities,
              bonds, options and ETFs on more than 200 exchanges in ~45 countries, and it dominates
              ETF liquidity in particular. It is famously secretive, notoriously quantitative, and
              staffed by people who talk about probability the way other firms talk about quarterly
              targets.
            </p>
            <p>
              The numbers are almost hard to believe. In 2025 it booked <strong>$39.6 billion</strong>{' '}
              in net trading revenue &mdash; more than Citadel Securities (~$12.2B) and Hudson River
              Trading (~$12.3B) <em>combined</em>, and more than JPMorgan&rsquo;s entire trading
              division (~$35.8B). That works out to roughly <strong>$11M of revenue per employee</strong>.
              Since 2016 its members&rsquo; equity &mdash; the partners&rsquo; own capital, which funds
              the trading &mdash; has grown nearly <strong>2,000%</strong>, to about <strong>$45 billion</strong>.
              It takes no outside investors.
            </p>
            <p>
              It is also no stranger to controversy. In July 2025 India&rsquo;s regulator SEBI barred
              the firm from Indian markets and ordered it to disgorge ~₹4,844 crore (~$565M) &mdash;
              its largest impounding ever &mdash; over alleged index-options manipulation. Jane Street
              disputed the finding, parked the money, and had access restored. The episode is a useful
              backdrop for July 2026: this is a firm large and sophisticated enough to absorb blows
              that would end almost anyone else.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-two">2. The two Jane Streets</h2>
            <p>
              To understand the loss you have to separate two businesses living under one roof. The
              first is <strong>market-making</strong>: quoting a bid and an ask on thousands of
              instruments and pocketing the spread. Done at Jane Street&rsquo;s scale and speed, it is
              close to market-neutral &mdash; a money machine that runs on volume and volatility, not
              on calling the market&rsquo;s direction.
            </p>
            <p>
              The second is newer and quieter: <strong>directional bets</strong>. In its own bond-offering
              language, Jane Street described its strategy as &ldquo;evolving to also include
              longer-term bets, in line with a hedge fund.&rdquo; That is the part of the firm that
              actually takes a <em>view</em> &mdash; that AI infrastructure will keep compounding, that
              a basket of Asian equities will move a certain way. For years, that hedge-fund side
              printed money alongside the market-making. In July 2026 it was the source of the entire
              loss.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-july">3. What happened in July</h2>
            <p>
              July 2026 was the month the AI-infrastructure trade cracked. SK Hynix&rsquo;s U.S.
              listing and Meta&rsquo;s &ldquo;Meta Compute&rdquo; reveal set off a rout across memory,
              power and the small &ldquo;neocloud&rdquo; GPU-rental names. Jane Street&rsquo;s
              directional book was exposed to it on multiple fronts at once:
            </p>
            <div className={styles.lessons}>
              <ul>
                <li><strong>AI-adjacent longs</strong> fell with the broad AI-infrastructure complex.</li>
                <li><strong>Asian equities</strong> &mdash; a set of non-AI directional positions &mdash; moved against the firm at the same time.</li>
                <li>Its stake in the leveraged <strong>Situational Awareness</strong> fund was marked down hard as that fund was force-sold (more below).</li>
                <li>The <strong>put-option hedges</strong> meant to cover the longs paid only a fraction, because the decline came as a slow grind rather than a single sharp crash the options were priced for.</li>
              </ul>
            </div>
            <p>
              Add it up and the firm lost about <strong>$15 billion</strong> over the month &mdash;
              roughly <strong>$650 million per trading day</strong>. For a firm that had gone ~10 years
              without a single losing month, that is a genuine shock. It is also, in the same breath,
              a number the firm could afford.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-sa">4. The Situational Awareness link</h2>
            <p>
              This event doesn&rsquo;t stand alone. Jane Street was an investor in{' '}
              <Link to="/events/situational-awareness-collapse"><strong>Situational Awareness LP</strong></Link>{' '}
              &mdash; the ~4×-levered AI hedge fund run by former OpenAI researcher Leopold Aschenbrenner
              that, in this very same July, was margin-called by three prime brokers and forced to sell
              its entire public book to Citadel in a single block trade, ending the month down ~67%.
            </p>
            <p>
              So the two stories are the same storm seen from two altitudes. For Situational Awareness,
              the rout was <em>terminal</em>: concentrated, leveraged, and unable to meet the margin
              calls. For Jane Street, the same rout was a <em>line item</em> &mdash; painful, but its
              stake was reportedly still roughly <strong>flat</strong> for the year so far and remained profitable
              over its life. One fund lost two-thirds of its value; its backer took a bruise. That contrast is the entire
              lesson, and it&rsquo;s worth reading the two pages side by side.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-hedge">5. The hedge that didn&rsquo;t &mdash; a familiar flaw</h2>
            <p>
              One detail rhymes exactly with the Situational Awareness blow-up. Jane Street was hedged
              &mdash; it held <strong>put options</strong> against its exposures. But puts are built for
              a <em>crash</em>: they pay off spectacularly when the market gaps down in a hurry. July
              wasn&rsquo;t a gap; it was a <strong>slow, grinding, month-long decline</strong>. Against
              that, options bleed their time value while the underlying drips lower, so the insurance
              &ldquo;offered limited protection&rdquo; exactly when it was supposed to work.
            </p>
            <p>
              It is the same family of error that turned a bad month into a catastrophe for Situational
              Awareness: a hedge that looks like insurance on paper but pays pennies against the
              specific way the loss actually arrives. The difference is that Jane Street&rsquo;s hedge
              underperforming cost it a slice of a record year, not its existence.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-survive">6. Why a $15B loss didn&rsquo;t kill them</h2>
            <p>
              The whole point of this post-mortem is the part that <em>didn&rsquo;t</em> happen: no
              collapse, no fire sale, no margin call. Set the loss against the numbers that absorbed
              it and the reason is obvious.
            </p>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>The loss in proportion — what a ~$15B month sits against</p>
              <BarChart
                rows={scaleRows}
                max={45}
                valueFmt={(v) => `$${v}B`}
                fillFor={(r) => (r.kind === 'loss' ? 'var(--viz-crit)' : r.kind === 'cap' ? 'var(--viz-muted)' : 'var(--viz-s1)')}
                ariaLabel="Jane Street's roughly 15 billion dollar July loss compared with its 39.6 billion 2025 revenue, 40 billion January-to-July 2026 revenue, and 45 billion members' equity"
              />
              <figcaption className={styles.figCaption}>
                The <span style={{ color: 'var(--viz-crit)', fontWeight: 700 }}>red</span> loss is
                <strong>more than a third</strong> of 2025&rsquo;s revenue and roughly
                <strong> a third</strong> of the firm&rsquo;s own equity. Because Jane Street runs on
                its own ~$45B of capital, there is no outside investor to redeem, and its debt is term
                financing rather than margin loans a lender can recall. Figures are as reported; the 2026 revenue figure is through July.
              </figcaption>
            </figure>

            <p>
              This is the quiet superpower of funding yourself with permanent capital. Situational Awareness
              was forced to sell because other people&rsquo;s money &mdash; prime-broker loans &mdash; could
              be recalled at the worst possible moment. Jane Street does borrow &mdash; it refinanced with
              $14.6B of bonds in August &mdash; but as term debt, so no lender can margin-call it out of a
              position overnight. When you can choose <em>whether</em>{' '}
              and <em>when</em> to sell, a $15B loss is a bad month. When you can&rsquo;t, a far smaller
              loss is the end.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-history">7. Among the biggest trading losses in history</h2>
            <p>
              Stripped of context, ~$15 billion in one month from one firm is staggering &mdash; it
              dwarfs the trading disasters that have their own Wikipedia pages and Hollywood
              treatments. What sets it apart isn&rsquo;t just the size; it&rsquo;s that the firm
              <em> survived it comfortably</em>.
            </p>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>Largest single-episode trading losses ($ billions, approximate)</p>
              <BarChart
                rows={lossRows}
                max={15}
                rowH={35}
                valueFmt={(v) => `$${v}B`}
                fillFor={(r) => (r.name === 'Jane Street' ? 'var(--viz-crit)' : 'var(--viz-s3)')}
                ariaLabel="Jane Street's 15 billion dollar loss compared with historical trading losses: Morgan Stanley 9 billion, Societe Generale 7.2 billion, Amaranth 6.6 billion, JPMorgan London Whale 6.2 billion, LTCM 4.6 billion"
              />
              <figcaption className={styles.figCaption}>
                <span style={{ color: 'var(--viz-crit)', fontWeight: 700 }}>Jane Street (red)</span> vs
                famous historical losses{' '}
                <span style={{ color: 'var(--viz-s3)', fontWeight: 700 }}>(amber)</span>. Amaranth and
                LTCM were <em>firm-ending</em>; the Morgan Stanley, SocGen and JPMorgan losses gutted
                divisions and careers. Jane Street&rsquo;s was <em>larger than any of them</em> and it
                still finished the year at a record. Figures are approximate and vary by source and
                measurement.
              </figcaption>
            </figure>
          </section>

          <section className={styles.section}>
            <h2 id="s-response">8. The response &mdash; and a $14.6B vote of confidence</h2>
            <p>
              The firm&rsquo;s public tone was matter-of-fact. Partner <strong>Turner Batty</strong> put
              it plainly:
            </p>

            <div className={styles.letterWrap}>
              <div className={`${styles.letter} ${styles.letterBear}`}>
                <div className={styles.letterHeader}>
                  <span>🗣️ Partner statement</span>
                  <span className={styles.letterDate}>Turner Batty, Jane Street · mid-August 2026</span>
                </div>
                <div className={styles.letterBody}>
                  <blockquote className={styles.letterQuote}>
                    &ldquo;July was a bad month.&rdquo;
                  </blockquote>
                  <blockquote className={styles.letterQuote}>
                    &ldquo;We&rsquo;ve closed a significant portion of our risk in the specific areas we
                    lost on in July, and have also reduced risk-taking in other strategies.&rdquo;
                  </blockquote>
                  <p className={styles.letterNote}>
                    As reported by Bloomberg and others citing the firm in August 2026.
                  </p>
                </div>
              </div>
            </div>

            <p>
              The market&rsquo;s verdict was even more telling. In the very week the loss was reported,
              Jane Street sold <strong>$14.6 billion of bonds</strong> &mdash; led by JPMorgan, with
              PIMCO, Capital Group and Fidelity among the buyers &mdash; to refinance floating-rate debt
              and reorganize its ~$11B capital stack. A firm that just posted the largest trading loss
              in memory was met not with a run, but with <em>demand</em> for its paper. Nothing
              signals &ldquo;this was a dent, not a wound&rdquo; more clearly than that.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-fates">9. Same storm, two fates</h2>
            <p>
              The cleanest way to see the lesson is to put the two July casualties next to each other.
              They were hit by the identical event &mdash; the AI-infrastructure sell-off &mdash; and
              even shared a position (Jane Street was in Situational Awareness). Their outcomes could
              not have been more different, and the reason is entirely structural.
            </p>

            <table className={styles.posTable}>
              <thead>
                <tr>
                  <th>&nbsp;</th>
                  <th>Situational Awareness</th>
                  <th>Jane Street</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><strong>What it is</strong></td><td>AI hedge fund</td><td>Quant market-maker + prop firm</td></tr>
                <tr><td><strong>Capital</strong></td><td>Prime-broker leverage (recallable)</td><td>~$45B of its own equity</td></tr>
                <tr><td><strong>Leverage</strong></td><td>~4×</td><td>Modest; internally funded</td></tr>
                <tr><td><strong>Concentration</strong></td><td>Top 5 ≈ 76% of the book</td><td>Spread across thousands of markets</td></tr>
                <tr><td><strong>July hit</strong></td><td style={{ color: 'var(--viz-crit)', fontWeight: 700 }}>−67% of the fund</td><td style={{ color: 'var(--viz-crit)', fontWeight: 700 }}>−$15B (~⅓ of one year)</td></tr>
                <tr><td><strong>Could it be margin-called?</strong></td><td>Yes — and was</td><td>No — no external lender</td></tr>
                <tr><td><strong>Outcome</strong></td><td>Wiped out; forced sale to Citadel</td><td>Absorbed; still a record year</td></tr>
              </tbody>
            </table>
            <p className={styles.posCaption} style={{ marginBottom: 0 }}>
              Same trigger, opposite ending. The variable that decided it wasn&rsquo;t who was
              &ldquo;right&rdquo; about AI &mdash; it was leverage, concentration, and whether the
              capital could be taken away.
            </p>
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
            <h2 id="s-lessons">Why it matters &mdash; the lessons</h2>
            <div className={styles.lessons}>
              <ul>
                <li>
                  <strong>Market-making isn&rsquo;t risk-free once you bolt a hedge fund onto it.</strong>{' '}
                  Jane Street&rsquo;s loss came entirely from its directional &ldquo;hedge-fund side,&rdquo;
                  not the neutral market-making that built it. The moment you take a <em>view</em>, you
                  inherit the view&rsquo;s tail risk.
                </li>
                <li>
                  <strong>Structure decides survival, not conviction.</strong> Situational Awareness and
                  Jane Street held the same kind of trade in the same month. One is gone and one shrugged.
                  The difference was leverage, diversification, and internal capital &mdash; not who was
                  smarter about AI.
                </li>
                <li>
                  <strong>Be your own bank if you can.</strong> Funding trading from ~$45B of your own
                  equity means no redemptions and no margin calls. Nobody can force you to sell at the
                  bottom, which converts &ldquo;terminal&rdquo; into &ldquo;temporary.&rdquo;
                </li>
                <li>
                  <strong>Puts hedge crashes, not grinds.</strong> Option insurance pays for a sudden
                  drop and bleeds against a slow one. Both firms learned in July that a hedge only
                  works against the specific <em>shape</em> of loss it&rsquo;s built for.
                </li>
                <li>
                  <strong>Absolute size is meaningless without context.</strong> $15B is one of the
                  largest trading losses in history <em>and</em> a rounding item against a record year.
                  A loss only matters relative to the capital and income that stand behind it.
                </li>
              </ul>
            </div>
            <div className={styles.learnBox}>
              <strong>Learn the concepts behind this story →</strong>
              <ul>
                <li><Link to="/events/situational-awareness-collapse">The Situational Awareness collapse</Link> — the leveraged fund Jane Street was invested in, and the other half of this story.</li>
                <li><Link to="/docs/Finance/valuation-and-risk">Valuation &amp; risk</Link> — position limits, VaR and why capital structure is a risk control.</li>
                <li><Link to="/docs/Finance/derivatives">Derivatives</Link> — how put-option hedges pay off (and don&rsquo;t).</li>
                <li><Link to="/terminal">Market terminal</Link> — watch the AI-infrastructure tickers move in real time.</li>
              </ul>
            </div>
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
              Figures are as reported by news outlets in August 2026 and vary between sources &mdash;
              treat the specific numbers (especially the exact loss composition and revenue figures) as
              approximate and the sequence of events as the reliable part. Jane Street is privately held
              and does not disclose detailed results; this page is an educational post-mortem, not
              investment advice.
            </p>
          </div>
        </article>
      </main>
    </Layout>
  );
}
