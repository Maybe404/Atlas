import { useEffect, useRef, useState } from 'react';
import { I } from '../chrome';
import type { Loose } from '../loose-types';
import { accentDot } from './shared';

const _I = I;

export function SpaceChipPicker({ doc, spaces, onPick }: Loose) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<Loose>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Loose) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <span
      ref={wrapRef}
      className="space-chip space-chip-edit"
      onClick={(e: Loose) => {
        e.stopPropagation();
        setOpen((o: Loose) => !o);
      }}
      style={{ position: 'relative' }}
    >
      <span className={`dot ${accentDot(doc.spaceAccent)}`}></span>
      {doc.spaceName}
      <svg className="chev" width="9" height="9" viewBox="0 0 10 10" fill="none">
        <path
          d="M2 3.5 5 7 8 3.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {open && (
        <div className="space-picker-pop" onClick={(e: Loose) => e.stopPropagation()}>
          {spaces.map((s: Loose) => {
            const active = s.id === doc.spaceId;
            return (
              <div
                key={s.id}
                className={`space-picker-row ${active ? 'active' : ''}`}
                onClick={() => {
                  onPick(s);
                  setOpen(false);
                }}
              >
                <span className={`dot ${accentDot(s.accent)}`}></span>
                <span>{s.name}</span>
                {active && (
                  <span className="check">
                    <_I.check />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
