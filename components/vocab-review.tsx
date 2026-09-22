"use client";

import { useMemo, useState } from "react";

import { dueEntries, reviewWord, type VocabEntry } from "@/lib/vocab";

type VocabReviewProps = {
  entries: VocabEntry[];
  onUpdated: (next: VocabEntry[]) => void;
  onClose: () => void;
  onSpeak: (text: string) => void;
};

export function VocabReview({ entries, onUpdated, onClose, onSpeak }: VocabReviewProps) {
  // Frozen when the session opens: answering a card sets its next due date, so
  // a live-recomputed queue would drop each card the moment you graded it.
  const queue = useMemo(() => dueEntries(entries), []);

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ right: 0, wrong: 0 });

  const card = queue[index];

  const grade = (correct: boolean) => {
    if (!card) return;
    onUpdated(reviewWord(card.surface, correct));
    setScore((s) => ({
      right: s.right + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
    }));
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  if (!queue.length) {
    return (
      <div className="review">
        <div className="review-empty">
          <h3>Nothing due right now</h3>
          <p>
            Words you save come back on a schedule — a day later, then two, then four.
            Go and collect some more.
          </p>
          <button className="isekai-submit isekai-submit-wide" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="review">
        <div className="review-empty">
          <h3>Done for now</h3>
          <p>
            {score.right} remembered · {score.wrong} to see again sooner.
          </p>
          <button className="isekai-submit isekai-submit-wide" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="review">
      <div className="review-head">
        <span className="review-progress">
          {index + 1} / {queue.length}
        </span>
        <button className="review-close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="review-card">
        <button
          type="button"
          className="review-word"
          onClick={() => onSpeak(card.surface)}
          title="Hear it"
        >
          {card.surface}
        </button>

        {revealed ? (
          <div className="review-back">
            <span className="review-reading">{card.reading}</span>
            <span className="review-meaning">{card.meaning}</span>
          </div>
        ) : (
          <button className="review-reveal" onClick={() => setRevealed(true)}>
            Show meaning
          </button>
        )}
      </div>

      {revealed && (
        <div className="review-actions">
          <button className="review-miss" onClick={() => grade(false)}>
            Didn&rsquo;t know it
          </button>
          <button className="review-got" onClick={() => grade(true)}>
            Knew it
          </button>
        </div>
      )}

      <p className="review-hint">
        {card.box ? `Box ${card.box} of 5` : "New word"} · answering sets when it returns
      </p>
    </div>
  );
}
