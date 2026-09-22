"use client";

import { useState } from "react";

import { dueEntries, type VocabEntry } from "@/lib/vocab";

type VocabPanelProps = {
  entries: VocabEntry[];
  onRemove: (surface: string) => void;
  onSpeak: (text: string) => void;
  onReview: () => void;
};

export function VocabPanel({ entries, onRemove, onSpeak, onReview }: VocabPanelProps) {
  const [open, setOpen] = useState(false);
  const due = dueEntries(entries).length;

  return (
    <div className="vocab">
      <button
        type="button"
        className="vocab-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <BookIcon />
        <span>My words</span>
        <span className="vocab-count">{entries.length}</span>
        {due > 0 && <span className="vocab-due">{due} due</span>}
        <span className={`vocab-chevron ${open ? "open" : ""}`}>
          <ChevronIcon />
        </span>
      </button>

      {open && (
        <div className="vocab-body">
          {entries.length === 0 ? (
            <p className="vocab-empty">
              Double-click any word in the narration to save it here.
            </p>
          ) : (
            <>
              <button type="button" className="vocab-review-cta" onClick={onReview}>
                {due > 0 ? `Review ${due} word${due === 1 ? "" : "s"}` : "Review anyway"}
              </button>
              <ul className="vocab-list">
              {entries.map((entry) => (
                <li key={entry.surface} className="vocab-item">
                  <button
                    type="button"
                    className="vocab-word"
                    onClick={() => onSpeak(entry.surface)}
                    title="Hear it"
                  >
                    {entry.surface}
                  </button>
                  <span className="vocab-reading">{entry.reading}</span>
                  <span className="vocab-meaning">{entry.meaning}</span>
                  <button
                    type="button"
                    className="vocab-remove"
                    onClick={() => onRemove(entry.surface)}
                    aria-label={`Remove ${entry.surface}`}
                  >
                    ×
                  </button>
                </li>
              ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BookIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
