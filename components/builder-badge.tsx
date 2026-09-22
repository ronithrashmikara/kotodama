"use client";

import { useEffect, useRef, useState } from "react";

export function BuilderBadge() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="builder-badge" ref={rootRef}>
      {open && (
        <div className="builder-popover" role="dialog" aria-label="Who made this">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="builder-popover-avatar" src="/art/honeybird.png" alt="" />
          <span className="builder-popover-eyebrow">Made by</span>
          <span className="builder-popover-name">Honey Bird</span>
          <p className="builder-popover-text">
            Yume was designed and built by <strong>Honey Bird</strong> for the Visko Orbis Online
            Challenge — a Japanese language-learning game where your words shape a living, AI-generated
            world.
          </p>
        </div>
      )}
      <button
        type="button"
        className="builder-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Who made this"
        title="Who made this?"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/honeybird.png" alt="" />
      </button>
    </div>
  );
}
