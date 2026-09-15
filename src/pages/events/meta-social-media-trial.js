import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

/*
 * Meta's social-media child-safety trial (California, August 2026). A coalition
 * of state AGs led by California's Rob Bonta put Meta on trial in Oakland federal
 * court, arguing Facebook/Instagram were designed to addict kids and that Meta
 * knew and hid the harm — the "Big Tobacco moment" for social media. On Aug 26,
 * 2026 a proposed settlement of up to $17B was announced, subject to court
 * approval (no jury verdict). Source of record: California DOJ release.
 * The allegations were never adjudicated; the page is framed accordingly.
 */

// The stakes, in financial context ($B). What a Big-Tobacco-scale outcome
// would mean against Meta's own scale.
const SCALE = [
  { label: 'Big Tobacco settlement', note: '1998 Master Settlement, over 25 yrs', val: 206, kind: 'ref' },
  { label: 'Meta 2025 revenue', note: 'what the engagement engine produced', val: 201, kind: 'rev' },
  { label: 'Meta 2025 net income', note: 'annual profit', val: 60, kind: 'rev' },
];

const STATS = [
  { v: '$17B', label: 'Up to this much, paid over 10 years, in a proposed settlement still subject to court approval (Aug 26, 2026)', dir: 'down' },
  { v: '51 AGs', label: 'Attorneys general in the settlement coalition, per California DOJ; 29 sued in the 2023 federal action, 4 — CA, CO, KY, NJ — argued the trial' },
  { v: 'Week 2', label: 'Trial opened Aug 18; proposed settlement announced Aug 26 — before Zuckerberg was due to testify. No jury verdict' },
  { v: '~2,000+', label: 'Related child-harm suits still waiting behind this one — the settlement doesn’t resolve them' },
  { v: '$201B', label: 'Meta 2025 revenue — the business the case targeted' },
  { v: '$206B', label: 'Big Tobacco’s 1998 settlement — the precedent that loomed over it' },
];

// Reverse-chronological log of what actually happens in the courtroom, updated
// as the trial runs. Newest first.
const UPDATES = [
  {
    d: 'Aug 26, 2026 · Proposed settlement',
    b: 'Midway through the second week — and before Mark Zuckerberg was due to take the stand — Meta and a coalition of 51 attorneys general announced a proposed settlement of up to $17 billion, paid over ten years and still subject to court approval; California’s share (~$1.5–2.1 billion) is earmarked for youth mental-health prevention and treatment. Meta did not admit wrongdoing, but agreed to an injunction barring further “false, misleading, or deceptive” statements about its safety features, an independent auditor with expansive access and a direct line to the attorneys general, and a slate of product changes for minors: default 2-hour daily time limits, parent-set nightly blocks, no “like” counts for under-18s, a non-algorithmic feed option, no push notifications during school hours, a ban on cosmetic-surgery filters, and age-assurance measures. AG Bonta said Meta “has agreed to make massive transformations that will reduce the risk of harm” within months.',
  },
  {
    d: 'Aug 24–25, 2026 · Week 2',
    b: 'Whistleblower Arturo Béjar returned to the stand — “if Mark makes something a priority, mountains move in months,” he testified, describing a top-down structure in which product-safety changes happened only when Zuckerberg ordered them. A former Meta engineering director testified that Zuckerberg had built a culture where child safety was consistently subordinated to engagement and growth. Instagram head Adam Mosseri then took the stand and defended Meta’s record and its progress on child safety and privacy — the last major witness before the case settled.',
  },
  {
    d: 'Aug 19, 2026 · Day 2',
    b: 'Former Meta safety engineer and whistleblower Arturo Béjar — whom Meta had tried to bar the week before — took the stand as the states’ first witness. He testified that Meta ran on a "don’t ask, don’t tell" approach to child safety: leadership was warned repeatedly about harm to young users and largely ignored it. He said "move fast and break things" was a genuine mantra, that products like Reels were shipped "and safety was not a consideration in how it was initially deployed," and that he had briefed Mark Zuckerberg on product problems at least 100 times. His internal studies, he said, found children encountering harmful content — from predatory contact to graphic violence — at rates far above Meta’s narrow public "prevalence" figures.',
  },
  {
    d: 'Aug 18, 2026 · Day 1',
    b: 'Opening statements before an eight-person jury. Deputy AG Megan O’Neill said Meta’s playbook was to "hook the users, hold them for as long as they can, harvest their data, and then hide the truth from the public." On the stakes, a per-violation calculation puts the theoretical maximum penalty near $1.4 trillion — but Bonta said the states are not seeking a set number and accused Meta of citing $1.4T to make the case look absurd: "They generated revenue of $200 billion last year, so … maybe that amount would be appropriate. Maybe more. Maybe less." Meta countered that its apps are not defective and that it has built teen-safety tools.',
  },
];

const GLOSSARY = [
  ['Section 230', 'The 1996 law that shields online platforms from liability for content their users post. For years it deflected suits like this. The new theory sidesteps it: the states aren’t suing over what users posted — they’re suing over how the product itself was designed.'],
  ['Design-defect / product liability', 'The claim that a product is dangerous because of how it was built — here, that infinite scroll, autoplay and constant notifications were engineered to be compulsive. Treating an app like a defective product is what gets a case past Section 230.'],
  ['COPPA', 'The Children’s Online Privacy Protection Act — federal law barring the collection of data on under-13s without verifiable parental consent. The judge found Meta failed to obtain consent meeting COPPA’s standard.'],
  ['Engagement design', 'The features that maximize time-on-app: infinite scroll, autoplay, pull-to-refresh, push notifications, streaks and “likes.” The states argued these were tuned to “ensnare” young users — the core of the product-defect claim.'],
  ['MDL & bellwether', 'A Multi-District Litigation pools thousands of similar suits before one judge (here, ~2,000+ social-media harm cases before Judge Gonzalez Rogers). Early “bellwether” trials test the arguments and set the tone for the rest.'],
  ['Attorney-client privilege / crime-fraud', 'Companies can normally keep legal advice secret. But a court ruled Meta couldn’t hide internal teen-harm research behind privilege — finding its lawyers had advised staff to “remove,” “block” or “button up” damaging studies. That opened the documents to the jury.'],
  ['UCL / False Advertising Law', 'California’s Unfair Competition Law and False Advertising Law — the consumer-protection statutes the state is using to allege Meta misled the public about known risks.'],
];

const TIMELINE = [
  { d: 'Oct 2023', b: 'A bipartisan coalition of state attorneys general — reported as 29 in the federal action (some counts run to ~33) — sues Meta in the Northern District of California, alleging Facebook and Instagram were designed to addict minors; more states file in their own courts. The suits are consolidated before Chief Judge Yvonne Gonzalez Rogers.' },
  { d: '2024–2025', b: 'Discovery surfaces internal Meta documents and research. Courts rule the design-defect claims can proceed past Section 230, narrowing the shield that had defeated earlier suits.' },
  { d: 'Early 2026', b: 'A federal court rules Meta cannot use attorney-client privilege to bury internal teen-harm research, finding its lawyers had advised employees to “remove,” “block,” “button up” or “limit” damaging studies — a major evidentiary setback.' },
  { d: 'Mar 25–26, 2026', b: 'In a separate bellwether (K.G.M. v. Meta et al.), a California jury finds Meta and YouTube liable for addictive design that harmed a minor — the first verdict of its kind, cracking the door for the ~2,000 cases behind it.', crash: true },
  { d: 'Summer 2026', b: 'The court “fully” denies Meta’s motion for summary judgment and finds Meta failed to obtain COPPA-compliant parental consent — AG Bonta’s “critical win” heading into trial.' },
  { d: 'Aug 12, 2026', b: 'Jury selection begins in Oakland for the states’ enforcement trial — the first time a coalition of AGs takes Meta to a jury over child safety.' },
  { d: 'Aug 18, 2026', b: 'Opening statements before an eight-person jury. Deputy AG Megan O’Neill says Meta’s model was to “hook the users, hold them … harvest their data, and then hide the truth.” Meta counters that its products aren’t defective and that it has built extensive teen-safety tools. The trial was expected to run ~6–7 weeks; it settled eight days later.', crash: true },
  { d: 'Aug 19, 2026', b: 'Whistleblower Arturo Béjar, a former Meta safety engineer, becomes the states’ first witness — describing a “don’t ask, don’t tell” culture, the “move fast and break things” mantra, Reels shipped without safety review, and having briefed Zuckerberg on product harms ~100 times.', crash: true },
  { d: 'Aug 24–25, 2026', b: 'Week two: Béjar returns (“if Mark makes something a priority, mountains move in months”); a former Meta engineering director testifies Zuckerberg subordinated child safety to engagement and growth; Instagram head Adam Mosseri takes the stand to defend Meta’s record.' },
  { d: 'Aug 26, 2026', b: 'A proposed settlement of up to $17 billion (paid over 10 years, subject to court approval) is announced — before Zuckerberg testifies. No admission of wrongdoing, but an injunction against deceptive safety claims, an independent auditor, and product changes for minors: default 2-hour limits, no under-18 “like” counts, a non-algorithmic feed option, school-hours notification blocks, and more.', crash: true },
];

const WAVES = [
  {
    name: 'Big Tobacco',
    year: '1998',
    plaintiffs: '46 state AGs',
    knew: 'Internal docs: nicotine is addictive; youth deliberately targeted',
    theory: 'Consumer protection / public-nuisance; deception about known harm',
    outcome: '$206B+ Master Settlement over 25 years; sweeping marketing limits',
  },
  {
    name: 'Opioids',
    year: '~2019–2022',
    plaintiffs: 'States, counties, cities',
    knew: 'Internal docs on addiction risk and oversupply',
    theory: 'Public nuisance; deceptive marketing',
    outcome: '~$50B+ in settlements (distributors, J&J, Purdue)',
  },
  {
    name: 'Social media',
    year: '2026 (proposed settlement)',
    plaintiffs: '51 attorneys general, led by California',
    knew: 'Internal docs: “bring them in as tweens”; 11-yos 4× more likely to return',
    theory: 'Product design-defect + COPPA + false advertising',
    outcome: 'Proposed: up to $17B over 10 yrs + app changes for minors, pending court approval',
  },
];

const SOURCES = [
  { t: 'California DOJ — “Attorney General Bonta Secures Transformative $17 Billion Settlement with Meta” (Aug 26, 2026) — the primary source for the settlement terms', u: 'https://www.oag.ca.gov/news/press-releases/attorney-general-bonta-secures-transformative-17-billion-settlement-meta' },
  { t: 'NPR — “Meta, states agree to $17 billion settlement in child safety trial” (Aug 26, 2026)', u: 'https://www.npr.org/2026/08/26/nx-s1-5944781/meta-settlement-child-safety-lawsuit' },
  { t: 'Oaklandside — “Meta reaches $17 billion settlement in landmark trial over teen social media addiction” (Aug 26, 2026)', u: 'https://oaklandside.org/2026/08/26/meta-reaches-17-billion-settlement-trial-oakland-teen-social-media-addiction/' },
  { t: 'Texas Public Radio — “Meta, states agree to $17 billion settlement in child safety trial” (Aug 26, 2026)', u: 'https://www.tpr.org/2026-08-26/meta-states-agree-to-17-billion-settlement-in-child-safety-trial' },
  { t: 'NPR — “Whistleblower Arturo Béjar leads testimony in landmark trial against Meta” (Aug 19, 2026)', u: 'https://www.npr.org/2026/08/19/nx-s1-5936648/meta-trial-arturo-bejar-whistleblower-testimony' },
  { t: 'Quartz — “Meta whistleblower Arturo Béjar testifies at child safety trial” (Aug 19, 2026)', u: 'https://qz.com/meta-whistleblower-arturo-bejar-child-safety-trial-081926' },
  { t: 'ABC — “Pivotal Meta trial over social media addiction in children gets underway” (Aug 19, 2026)', u: 'https://www.abc.net.au/news/2026-08-19/meta-trial-that-could-reshape-facebook-and-instagram-begins/107052672' },
  { t: 'Yahoo News — “Trials begin in cases questioning child safety of Meta, YouTube” (29 states; penalty math)', u: 'https://www.yahoo.com/news/articles/trials-begin-cases-questioning-child-175011292.html' },
  { t: 'CNN Business — “Meta is back in the courtroom to face its biggest social media addiction trial yet” (Aug 18, 2026)', u: 'https://www.cnn.com/2026/08/18/tech/meta-attorneys-general-addiction-trial-opening-arguments' },
  { t: 'CNBC — “Meta faces state AG trial over child safety claims” (Aug 17, 2026)', u: 'https://www.cnbc.com/2026/08/17/meta-attorneys-general-california-federal-trial-astronomical-consequences.html' },
  { t: 'NPR — “‘Profits won.’ The child safety trial against Meta kicks off in federal court” (Aug 18, 2026)', u: 'https://www.npr.org/2026/08/18/nx-s1-5935458/meta-child-safety-social-media-addiction-trial-opening' },
  { t: 'NPR — “Meta heads to court in a landmark trial about kids and social media addiction” (Aug 17, 2026)', u: 'https://www.npr.org/2026/08/17/nx-s1-5930701/meta-trial-kids-social-media-addiction' },
  { t: 'Oaklandside — “Meta trial claiming platforms addicted children begins in Oakland” (Aug 18, 2026)', u: 'https://oaklandside.org/2026/08/18/meta-trial-claiming-platforms-addicted-children-begins-oakland/' },
  { t: 'NBC News — “Meta trial that could reshape Facebook and Instagram gets underway”', u: 'https://www.nbcnews.com/business/corporations/meta-trial-facebook-instagram-begins-rcna593146' },
  { t: 'California DOJ — “Ahead of Meta Trial, Attorney General Bonta Secures Critical Win”', u: 'https://oag.ca.gov/news/press-releases/ahead-meta-trial-attorney-general-bonta-secures-critical-win' },
  { t: 'Yahoo News — “Meta lawyers tried to block internal research showing teen harm, judge rules”', u: 'https://www.yahoo.com/news/article/meta-lawyers-tried-block-internal-120015069.html' },
  { t: 'Al Jazeera — “Jury finds Meta, YouTube liable for social media addiction: What we know” (K.G.M., Mar 26, 2026)', u: 'https://www.aljazeera.com/news/2026/3/26/jury-finds-meta-youtube-liable-for-social-media-addiction-what-we-know' },
  { t: 'Crowell & Moring — “Landmark Verdicts Against Meta and YouTube Signal New Era of Social Media Platform Liability”', u: 'https://www.crowell.com/en/insights/client-alerts/landmark-verdicts-against-meta-and-youtube-signal-new-era-of-social-media-platform-liability' },
  { t: 'Meta — “Meta Reports Fourth Quarter and Full Year 2025 Results” (revenue $200.97B, net income $60.46B)', u: 'https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/default.aspx' },
  { t: 'Wikipedia — Tobacco Master Settlement Agreement (the $206B precedent)', u: 'https://en.wikipedia.org/wiki/Tobacco_Master_Settlement_Agreement' },
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

function BarChart({ rows, max, valueFmt, fillFor, labelW = 220, ariaLabel, rowH = 40 }) {
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
        const barW = (r.val / max) * innerW;
        const fill = fillFor(r);
        return (
          <g key={r.label}>
            <text x={labelW - 12} y={cy - 3} textAnchor="end" style={{ fill: 'var(--viz-ink)', fontSize: '13px', fontWeight: 600 }}>{r.label}</text>
            <text x={labelW - 12} y={cy + 12} textAnchor="end" style={{ fill: 'var(--viz-muted)', fontSize: '10.5px' }}>{r.note}</text>
            <rect x={labelW} y={cy - 13} width={innerW} height={24} rx={4} fill="var(--viz-panel-bg)" />
            <rect x={labelW} y={cy - 13} width={barW} height={24} rx={4} fill={fill} opacity={0.9} />
            <text x={labelW + barW + 8} y={cy + 5} style={{ fill, fontSize: '14px', fontWeight: 800 }}>{valueFmt(r.val)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function MetaSocialMediaTrial() {
  return (
    <Layout
      title="Meta on trial: the social-media reckoning"
      description="A Big Event: a coalition of state attorneys general, led by California's Rob Bonta, put Meta on trial in Oakland federal court in August 2026 — arguing Facebook and Instagram were deliberately designed to addict children, and that Meta knew and hid the harm. The 'Big Tobacco moment' for social media — the allegations, the internal documents, why Section 230 didn't save Meta this time, and the proposed settlement of up to $17 billion announced mid-trial.">
      <header className="hero hero--primary" style={{ padding: '2.2rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title" style={{ fontSize: '2rem' }}>
            Meta on trial: the social-media reckoning
          </Heading>
          <p className="hero__subtitle">August 2026 · states argued the feed was built to addict kids — a proposed settlement of up to $17 billion</p>
        </div>
      </header>

      <main className="container" style={{ padding: '2rem 1rem 4rem' }}>
        <article className={styles.article}>
          <Link className={styles.backLink} to="/events">← All Big Events</Link>
          <div className={styles.articleMeta}>
            <span className={styles.developing}>Proposed settlement · up to $17B · pending court approval</span>
            <span>Opened Aug 18 · settlement announced Aug 26, 2026 · updated Sep 13 · ~12 min read · by Joyeb Kashyeb</span>
          </div>

          <p className={styles.dek}>
            On <strong>August 18, 2026</strong>, in a federal courtroom in Oakland, a coalition of{' '}
            <strong>state attorneys general</strong> (29 in the federal case) &mdash; led by California&rsquo;s Rob Bonta
            &mdash; began making a case that would have been unthinkable a decade ago: that{' '}
            <strong>Facebook and Instagram are defective products</strong>, engineered to addict
            children, and that Meta <em>knew</em> the harm and hid it. It was billed as the closest thing yet to a{' '}
            <strong>&ldquo;Big Tobacco moment&rdquo; for social media</strong> &mdash; and even though it
            ended without a verdict, it put the entire attention-economy business model on trial.
          </p>

          <div className={styles.plainBox} style={{ borderLeftColor: 'var(--viz-s3)' }}>
            <Heading as="h2">A note before we start</Heading>
            <p>
              This case ended in a <strong>settlement, not a verdict</strong>. On{' '}
              <strong>August 26, 2026</strong>, a <strong>proposed settlement</strong> was announced: up to{' '}
              <strong>$17 billion</strong> over ten years and changes to Meta&rsquo;s apps. It{' '}
              <strong>remains subject to court approval</strong>, and Meta did not admit wrongdoing. So the
              states&rsquo; allegations were never carried to a jury conclusion: a settlement is a
              negotiated resolution, not a finding of guilt, and Meta continues to deny it designed its
              products to harm children. This page explains what the case was, what Meta agreed to, and
              why it matters &mdash; not who was right.
            </p>
          </div>

          <div className={styles.plainBox} style={{ borderLeftColor: 'var(--viz-crit)' }}>
            <Heading as="h2">What happened in court, Aug 18&ndash;26, 2026</Heading>
            <ul className={styles.timeline} style={{ marginBottom: 0 }}>
              {UPDATES.map((u, i) => (
                <li key={i} className={`${styles.tItem} ${styles.tItemCrash}`}>
                  <div className={styles.tDate}>{u.d}</div>
                  <p className={styles.tBody}>{u.b}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.plainBox}>
            <Heading as="h2">The short version</Heading>
            <p>
              For years, lawsuits against social-media companies died on <strong>Section 230</strong>,
              the law that shields platforms from liability for what users post. The states found a way
              around it: they weren&rsquo;t suing over <em>content</em> &mdash; they were suing over{' '}
              <em>design</em>. The claim was that features like <strong>infinite scroll, autoplay and
              relentless notifications</strong> were tuned to make kids compulsive users, that this
              damaged their mental health, and that Meta hid its own research showing it. Courts let the{' '}
              <strong>product-defect</strong> theory proceed &mdash; and a jury heard the first week and a
              half of it before the case settled.
            </p>
            <p>
              The evidence the states put forward is the part that made this a genuine event: internal
              Meta documents like <em>&ldquo;if we wanna win big with teens, we must bring them in as
              tweens,&rdquo;</em> research that <strong>11-year-olds were four times more likely to keep
              returning to Instagram</strong> (which requires users to be 13), and a court finding that
              Meta&rsquo;s lawyers advised staff to <em>&ldquo;remove,&rdquo; &ldquo;block&rdquo;</em> or{' '}
              <em>&ldquo;button up&rdquo;</em> damaging studies. The per-violation math topped out at a
              theoretical <strong>~$1.4 trillion</strong>, but the states pointedly didn&rsquo;t name a
              number &mdash; Bonta noted Meta made ~$200B last year and left it at
              <em> &ldquo;maybe that amount &hellip; maybe more, maybe less&rdquo;</em> &mdash; plus
              court-ordered changes to the apps themselves. For a company that made <strong>$201B</strong>{' '}
              in 2025 off exactly that engagement, the money was survivable &mdash; the <em>precedent</em>,
              and the threat to the design, were the real stakes.
            </p>
          </div>

          <div className={styles.stats}>
            {STATS.map((s) => <Stat key={s.label} s={s} />)}
          </div>

          <nav className={styles.toc} aria-label="Table of contents">
            <div className={styles.tocTitle}>In this breakdown</div>
            <ol className={styles.tocList}>
              <li><a href="#s-trial"><span className={styles.tocNum}>1</span>What was on trial</a></li>
              <li><a href="#s-design"><span className={styles.tocNum}>2</span>Addiction by design</a></li>
              <li><a href="#s-knew"><span className={styles.tocNum}>3</span>The evidence: &ldquo;they knew&rdquo;</a></li>
              <li><a href="#s-230"><span className={styles.tocNum}>4</span>Why Section 230 didn&rsquo;t save them</a></li>
              <li><a href="#s-money"><span className={styles.tocNum}>5</span>The money &amp; the medicine</a></li>
              <li><a href="#s-tobacco"><span className={styles.tocNum}>6</span>Big Tobacco 2.0</a></li>
              <li><a href="#s-wave"><span className={styles.tocNum}>7</span>The wave behind it</a></li>
              <li><a href="#s-watch"><span className={styles.tocNum}>8</span>What to watch</a></li>
              <li><a href="#s-lessons"><span className={styles.tocNum}>★</span>Why it matters</a></li>
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
            <h2 id="s-trial">1. What was on trial</h2>
            <p>
              The case was a <strong>state enforcement action</strong> &mdash; not a private lawsuit for
              one family, but the government of <strong>29 states</strong> (led by California&rsquo;s
              Attorney General Rob Bonta) suing Meta on behalf of the public &mdash; with four of them,
              California, Colorado, Kentucky and New Jersey, actually arguing the case at trial. It was
              heard in the{' '}
              <strong>U.S. District Court for the Northern District of California</strong> in Oakland,
              before <strong>Chief Judge Yvonne Gonzalez Rogers</strong>, who also oversees the ~2,000
              consolidated child-harm cases, in front of an <strong>eight-person jury</strong>. Jury
              selection began <strong>August 12</strong>; opening statements were{' '}
              <strong>August 18, 2026</strong>. The trial had been expected to run about{' '}
              <strong>six to seven weeks</strong>; a proposed settlement was announced on{' '}
              <strong>August 26</strong>, in its second week.
            </p>
            <p>
              The legal claims were consumer-protection and child-privacy statutes, not &ldquo;free
              speech&rdquo; territory: <strong>COPPA</strong> (collecting data on under-13s without
              proper parental consent), plus California&rsquo;s <strong>Unfair Competition</strong> and{' '}
              <strong>False Advertising</strong> laws (misleading the public about known risks). Heading
              in, the states scored a <em>&ldquo;critical win&rdquo;</em>: the judge <strong>fully denied
              Meta&rsquo;s motion for summary judgment</strong> and found the company failed to obtain
              COPPA-compliant consent. That sent the case to a jury on the facts.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-design">2. The core allegation: addiction by design</h2>
            <p>
              The states&rsquo; theory was deceptively simple: Meta didn&rsquo;t just <em>host</em> content
              that happened to harm kids &mdash; it <strong>engineered the product to be compulsive</strong>.
              In a deputy AG&rsquo;s framing on day one, <em>&ldquo;profits won&rdquo;</em> over safety.
              The specific features named were the ones every user knows by feel:
            </p>
            <div className={styles.lessons}>
              <ul>
                <li><strong>Infinite scroll</strong> — a feed that never ends, removing every natural stopping point.</li>
                <li><strong>Autoplay</strong> — the next video starts before you decide to watch it.</li>
                <li><strong>Push notifications &amp; “streaks”</strong> — engineered interruptions that pull kids back, exploiting the fear of missing out.</li>
                <li><strong>Variable rewards (“likes,” pull-to-refresh)</strong> — the slot-machine mechanic that makes checking the app feel like gambling.</li>
              </ul>
            </div>
            <p>
              The states argued these were tuned to <em>&ldquo;entice, engage, and ultimately ensnare
              youth and teens&rdquo;</em> for as long as possible &mdash; and that the resulting
              compulsive use fed anxiety, depression, sleep loss and worse. Framing an app as a{' '}
              <strong>defectively designed product</strong>, rather than a neutral pipe for other
              people&rsquo;s speech, is the legal move that made this trial possible.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-knew">3. The evidence: &ldquo;they knew&rdquo;</h2>
            <p>
              Every landmark corporate-harm case turns on the same thing: internal documents showing the
              company understood the danger. That is what the states said they had. A few of the exhibits
              made public before and during the trial:
            </p>

            <div className={styles.letterWrap}>
              <div className={`${styles.letter} ${styles.letterBear}`}>
                <div className={styles.letterHeader}>
                  <span>📄 Internal document (as alleged)</span>
                  <span className={styles.letterDate}>Meta growth strategy</span>
                </div>
                <div className={styles.letterBody}>
                  <blockquote className={styles.letterQuote}>
                    &ldquo;If we wanna win big with teens, we must bring them in as tweens.&rdquo;
                  </blockquote>
                  <p>
                    The states read this as an explicit strategy to hook users <em>below</em> the
                    platform&rsquo;s own minimum age of 13 &mdash; the heart of the COPPA claim.
                  </p>
                </div>
              </div>

              <div className={`${styles.letter} ${styles.letterBear}`}>
                <div className={styles.letterHeader}>
                  <span>📄 Internal research (as alleged)</span>
                  <span className={styles.letterDate}>Instagram usage data</span>
                </div>
                <div className={styles.letterBody}>
                  <blockquote className={styles.letterQuote}>
                    <strong>11-year-olds were ~4× more likely</strong> to keep coming back to Instagram
                    &mdash; despite the app requiring users to be at least 13.
                  </blockquote>
                  <p>
                    A finding that the youngest, most-vulnerable users were the <em>stickiest</em> —
                    which the states argued was a feature, not an accident.
                  </p>
                </div>
              </div>

              <div className={`${styles.letter} ${styles.letterBear}`}>
                <div className={styles.letterHeader}>
                  <span>⚖️ Court finding</span>
                  <span className={styles.letterDate}>Privilege ruling, 2026</span>
                </div>
                <div className={styles.letterBody}>
                  <p>
                    A federal court ruled Meta could <strong>not</strong> use attorney-client privilege
                    to bury its internal teen-harm research &mdash; finding that Meta&rsquo;s lawyers had
                    advised employees to:
                  </p>
                  <blockquote className={styles.letterQuote}>
                    &ldquo;remove,&rdquo; &ldquo;block,&rdquo; &ldquo;button up&rdquo; or &ldquo;limit&rdquo;
                    portions of internal studies on the harm of social media to teens&rsquo; mental health.
                  </blockquote>
                  <p className={styles.letterNote}>
                    Stripping privilege from a company&rsquo;s own research is rare and damaging — it put
                    the documents in front of the jury. Meta disputes the characterization.
                  </p>
                </div>
              </div>
            </div>

            <p>
              Meta&rsquo;s response was that these were cherry-picked fragments, that its own research was
              being mischaracterized, that the science does not establish its products <em>cause</em>{' '}
              mental-health harm, and that it had since built Teen Accounts, age checks and parental
              supervision tools. The case settled before a jury weighed any of that, and this page
              doesn&rsquo;t try to.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-230">4. Why Section 230 didn&rsquo;t save them this time</h2>
            <p>
              For two decades, <strong>Section 230</strong> was the platforms&rsquo; force field: you
              can&rsquo;t sue Facebook for what a user posted. Suit after suit died on it. The states&rsquo;
              innovation was to stop suing about <em>content</em> at all. Their claim was that the{' '}
              <strong>machinery</strong> &mdash; the recommendation and engagement features &mdash; is a{' '}
              <em>defectively designed product</em>, independent of any particular post. Courts have
              increasingly agreed that <strong>design choices aren&rsquo;t protected speech</strong>,
              letting these claims survive where content-based suits failed.
            </p>
            <p>
              That distinction is the single most important thing about this trial. If &ldquo;we
              designed the app to be addictive&rdquo; is a valid product-liability claim, then the
              shield that protected the entire industry has a hole in it &mdash; and every
              engagement-maximizing design decision becomes potential evidence.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-money">5. The money and the medicine</h2>
            <p>
              There were two kinds of stakes, and the second was the bigger one. The first was{' '}
              <strong>money</strong>. Run the per-violation penalties to their limit and the theoretical
              maximum was a jaw-dropping <strong>~$1.4 trillion</strong> &mdash; a number Meta had been
              keen to cite, precisely because it sounds absurd. The states deliberately did <em>not</em>{' '}
              anchor to it: Bonta said they weren&rsquo;t seeking a set figure, pointing instead to
              Meta&rsquo;s ~$200B in annual revenue &mdash;{' '}
              <em>&ldquo;maybe that amount would be appropriate. Maybe more. Maybe less.&rdquo;</em> The
              second stake was <strong>injunctive relief</strong> &mdash; a court ordering Meta to{' '}
              <em>change the products</em>: age verification, default limits, turning off the most
              compulsive features for minors. For an ad business built on maximizing engagement, being
              ordered to make the apps <em>less</em> engaging was the real threat.
            </p>

            <figure className={styles.figure}>
              <p className={styles.figTitle}>The stakes in context ($ billions)</p>
              <BarChart
                rows={SCALE}
                max={206}
                valueFmt={(v) => `$${v}B`}
                fillFor={(r) => (r.kind === 'ref' ? 'var(--viz-s3)' : 'var(--viz-s1)')}
                ariaLabel="Big Tobacco's 206 billion dollar settlement versus Meta's 201 billion 2025 revenue and 60 billion net income"
              />
              <figcaption className={styles.figCaption}>
                A <span style={{ color: 'var(--viz-s3)', fontWeight: 700 }}>Big-Tobacco-scale</span>{' '}
                outcome ($206B over 25 years) would roughly equal a single year of Meta&rsquo;s revenue.
                Meta nets ~$60B a year, so even a tens-of-billions outcome was financially{' '}
                <em>survivable</em> &mdash; which is why, going into trial, the injunction (forcing changes
                to the engagement engine that produces the $201B) and the <em>precedent</em> mattered more
                than the cheque. Figures: Meta FY2025; the 1998 Tobacco Master Settlement.
              </figcaption>
            </figure>

            <p>
              This is the finance lens on the story. A cash penalty Meta can absorb from a few
              months&rsquo; profit. A legal precedent that says the attention-economy playbook is a
              defective product &mdash; applied across Instagram, TikTok, Snap and YouTube &mdash; is a
              risk to the <em>business model</em>, and that is what a market prices.
            </p>
            <p className={styles.plainBox} style={{ borderLeftColor: 'var(--viz-good)' }}>
              <strong>How it resolved.</strong> In the end the &ldquo;medicine&rdquo; came by settlement,
              not verdict. On <strong>Aug 26, 2026</strong> a proposed settlement was announced for{' '}
              <strong>up to $17 billion over ten years</strong>, subject to court approval &mdash; California&rsquo;s share (~$1.5&ndash;2.1B) earmarked for youth
              mental-health care &mdash; and to exactly the kind of <em>product changes</em> the states
              were after: default 2-hour daily limits, parent-set nightly blocks,{' '}
              <strong>no &ldquo;like&rdquo; counts for under-18s</strong>, a non-algorithmic feed option
              for minors, no notifications during school hours, a ban on cosmetic-surgery filters, and
              age-assurance measures &mdash; plus an <strong>injunction</strong> against deceptive safety
              claims and an <strong>independent auditor</strong> with a direct line to the attorneys
              general. Meta did not admit wrongdoing. Note the shape: the cheque is a fraction of the
              theoretical $1.4T, but the <em>forced redesign of the product for minors</em> is precisely
              the outcome that touches the engagement model &mdash; the medicine, not the fine.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-tobacco">6. Big Tobacco 2.0</h2>
            <p>
              The reason so many people reach for the tobacco comparison is that the <em>shape</em> is
              identical: a legal product, wildly profitable, sold to the public while the company&rsquo;s
              own internal research allegedly documented the harm &mdash; and state attorneys general,
              not individuals, forcing the reckoning. Tobacco ended in the largest civil settlement in
              U.S. history and permanent limits on how the product could be marketed. Opioids followed
              the same script a generation later.
            </p>

            <table className={styles.posTable}>
              <thead>
                <tr>
                  <th>Litigation wave</th>
                  <th>Plaintiffs</th>
                  <th>The “they knew” documents</th>
                  <th>Legal theory</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {WAVES.map((w) => (
                  <tr key={w.name}>
                    <td><strong>{w.name}</strong><br /><span style={{ color: 'var(--viz-muted)' }}>{w.year}</span></td>
                    <td>{w.plaintiffs}</td>
                    <td>{w.knew}</td>
                    <td>{w.theory}</td>
                    <td>{w.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.posCaption} style={{ marginBottom: 0 }}>
              Same pattern, three eras: a profitable product, internal knowledge of harm, and a coalition
              of state AGs. Whether social media becomes the third entry at tobacco/opioid scale is still
              open: this case settled, and the ~2,000 cases behind it will do more to decide it.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-wave">7. The wave behind it</h2>
            <p>
              This one trial was a <strong>bellwether</strong> &mdash; the leading edge of a much larger
              front. Behind it sit roughly <strong>2,000+ personal-injury and school-district cases</strong>{' '}
              consolidated before the same judge, plus the parallel state-court proceedings. And the
              defendant list isn&rsquo;t just Meta: <strong>TikTok, Snap and Google&rsquo;s YouTube</strong>{' '}
              are named across the broader litigation. In March 2026, a separate California jury already
              found <strong>Meta and YouTube liable</strong> in{' '}
              <em>K.G.M. v. Meta et al.</em> &mdash; the first verdict of its kind, and a preview of how a
              jury can react to this evidence.
            </p>
            <p>
              That is why markets watched a single Oakland courtroom: it was a test of a legal theory
              that, had it held, would apply to the entire <strong>attention economy</strong> &mdash; every
              app whose revenue depends on keeping users, especially young ones, scrolling.
            </p>
          </section>

          <section className={styles.section}>
            <h2 id="s-watch">8. What to watch next</h2>
            <div className={styles.lessons}>
              <ul>
                <li><strong>Court approval.</strong> The settlement is proposed, not final: it takes effect only if the court approves it and enters a consent judgment. Until then the terms, including the up-to-$17B figure, can still change.</li>
                <li><strong>Do the product changes actually ship — and stick.</strong> The settlement&rsquo;s teeth are the app changes for minors plus an independent auditor with a line to the AGs. Whether Meta rolls out the 2-hour caps, kills under-18 &ldquo;like&rdquo; counts and offers the non-algorithmic feed on schedule is the real thing to track.</li>
                <li><strong>The ~2,000 cases behind it.</strong> This state-enforcement deal does <em>not</em> resolve the personal-injury and school-district suits consolidated before the same judge. A $17B state settlement — on top of the March <em>K.G.M.</em> verdict — reprices every one of them.</li>
                <li><strong>The other defendants.</strong> TikTok, Snap and YouTube still face parallel cases. A $17B Meta number becomes the benchmark the next settlement talks start from — this stays a sector event, not a single-stock one.</li>
                <li><strong>No settled precedent.</strong> Because the case settled rather than reaching a verdict, no jury or appellate court ruled on the design-defect theory <em>here</em>, so the big Section 230 / First Amendment questions remain open for the industry — the <em>K.G.M.</em> bellwether verdict is the one that stands.</li>
                <li><strong>Where the money goes.</strong> California earmarked its ~$1.5&ndash;2.1B for youth mental-health prevention and treatment; watch how the states actually deploy the funds.</li>
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <h2 id="s-lessons">Why it matters</h2>
            <div className={styles.lessons}>
              <ul>
                <li>
                  <strong>A legal shield can crack.</strong> Section 230 looked impregnable for 20 years.
                  Reframing the product as a <em>design defect</em> rather than a speech platform is the
                  hairline that let this case &mdash; and the wave behind it &mdash; through.
                </li>
                <li>
                  <strong>The real risk to a platform isn&rsquo;t the fine — it&rsquo;s the injunction.</strong>{' '}
                  Meta can write a ten-figure cheque. Being ordered to make its apps <em>less addictive</em>{' '}
                  strikes the engine that produces $200B a year. That&rsquo;s the difference between a
                  one-time charge and a permanent hit to the model.
                </li>
                <li>
                  <strong>Internal documents are destiny.</strong> Tobacco, opioids, now this — the cases
                  that reshape industries are won on the company&rsquo;s own words. &ldquo;Bring them in as
                  tweens&rdquo; is this era&rsquo;s version of a memo that should never have been written.
                </li>
                <li>
                  <strong>It&rsquo;s a sector event, not a stock event.</strong> The theory that was on trial —
                  &ldquo;engagement design is a defective product&rdquo; — doesn&rsquo;t stop at Meta. It
                  reaches every company monetizing attention.
                </li>
                <li>
                  <strong>A settlement isn&rsquo;t a verdict.</strong> Meta agreed, pending court approval, to pay up to $17B and to
                  change the apps <em>without admitting wrongdoing</em>, so the design-defect theory was
                  never finally adjudicated here &mdash; the deeper Section 230 / First Amendment
                  questions stay open for the industry. But a $17B cheque plus a forced product redesign
                  for minors is, itself, the reckoning the &ldquo;Big Tobacco moment&rdquo; framing
                  anticipated.
                </li>
              </ul>
            </div>
            <div className={styles.learnBox}>
              <strong>Related on this site →</strong>
              <ul>
                <li><Link to="/events/jane-street-15b-loss">Jane Street&rsquo;s $15 billion month</Link> — the other August-2026 headline event.</li>
                <li><Link to="/events/situational-awareness-collapse">The Situational Awareness collapse</Link> — a leverage blow-up, for contrast.</li>
                <li><Link to="/terminal">Market terminal</Link> — watch META and the other platform names move.</li>
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
              A <strong>proposed settlement</strong> was announced on Aug 26, 2026: up to
              <strong> $17 billion</strong> over ten years and changes to Meta&rsquo;s apps,{' '}
              <strong>without admitting wrongdoing</strong> &mdash; there was <strong>no jury
              verdict</strong>, and the settlement <strong>remains subject to court approval</strong>. The states&rsquo; claims were <strong>allegations Meta denied</strong>; a
              settlement resolves the case without a finding of guilt. Internal-document quotes are as
              reported by news outlets and court filings. The settlement terms follow the California DOJ release of Aug 26, 2026
              (a coalition of 51 attorneys general; up to $17B; California&rsquo;s share $1.5&ndash;2.1B),
              which some news headlines rounded to a final &ldquo;$17 billion settlement&rdquo;.{' '}
              <em>Corrected Sep 13, 2026:</em> earlier versions called the settlement final, gave the
              amount without &ldquo;up to&rdquo;, and cited 47 states. <em>Updated Sep 14, 2026:</em> passages
              written while the trial was running now read as dated history. This is an educational explainer of a public court case, not legal
              or investment advice.
            </p>
          </div>
        </article>
      </main>
    </Layout>
  );
}
