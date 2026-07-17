import React, { useState } from 'react';
import LabCard from './LabCard';
import styles from './flashcards.module.css';

/**
 * Flip-card deck for memorising definitions.
 *
 * <Flashcards title="Key terms" cards={[
 *   { front: 'Delta', back: '∂V/∂S — sensitivity of option price to the underlying.' },
 * ]} />
 */
export default function Flashcards({ title = 'Flashcards', cards = [] }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards.length) return null;
  const card = cards[order[pos] ?? 0];

  const go = (delta) => {
    setFlipped(false);
    setPos((p) => (p + delta + order.length) % order.length);
  };

  const shuffle = () => {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
    setPos(0);
    setFlipped(false);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setFlipped((f) => !f);
    }
  };

  return (
    <LabCard badge="Flashcards" title={title}>
      <div
        className={styles.scene}
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Show term' : 'Show definition'}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={onKey}
      >
        <div className={`${styles.card} ${flipped ? styles.isFlipped : ''}`}>
          <div className={`${styles.face} ${styles.front}`}>
            <span className={styles.sideTag}>term</span>
            <div className={styles.faceText}>{card.front}</div>
            <span className={styles.tapHint}>tap to reveal</span>
          </div>
          <div className={`${styles.face} ${styles.back}`}>
            <span className={styles.sideTag}>definition</span>
            <div className={styles.faceText}>{card.back}</div>
          </div>
        </div>
      </div>

      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={() => go(-1)} aria-label="Previous card">
          ← Prev
        </button>
        <span className={styles.counter}>
          {pos + 1} / {order.length}
        </span>
        <button className={styles.navBtn} onClick={() => go(1)} aria-label="Next card">
          Next →
        </button>
        <button className={styles.navBtn} onClick={shuffle} aria-label="Shuffle deck">
          🔀 Shuffle
        </button>
      </div>
    </LabCard>
  );
}
