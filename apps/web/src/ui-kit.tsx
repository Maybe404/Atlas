// Shared UI primitives — a themed dropdown and a confirm dialog that replace the
// native <select> / window.confirm() controls, so every surface matches Atlas's
// design instead of falling back to the small, system-styled browser widgets.

import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Loose } from './loose-types';

// ── useDismiss ────────────────────────────────────────────────────────────
// Close a popover on outside-pointerdown or Escape. `ignore` selectors keep the
// trigger (and the popover itself) from counting as "outside".
export function useDismiss(open: boolean, onClose: () => void, ignore: string[] = []) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Loose) => {
      const t = e.target as Element | null;
      if (t && ignore.some((sel) => t.closest(sel))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, ignore]);
}

// ── clickableProps ──────────────────────────────────────────────────────────
// Make a non-button clickable element keyboard-operable: adds role=button,
// tabindex, and Enter/Space activation. Spread onto a <div onClick> to bring it
// up to baseline accessibility without restructuring the markup.
export function clickableProps(onClick: (e: Loose) => void, opts: { label?: string } = {}) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': opts.label,
    onClick,
    onKeyDown: (e: Loose) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(e);
      }
    },
  };
}

// ── Select ────────────────────────────────────────────────────────────────
type Option = { value: string; label: string; hint?: string };
type SelectProps = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string; // applied to the trigger button (e.g. "input")
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
};

export function Select({
  value,
  options,
  onChange,
  className = '',
  ariaLabel,
  placeholder = '选择…',
  disabled = false,
  align = 'left',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [rect, setRect] = useState<Loose>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const current = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, right: r.right, bottom: r.bottom, top: r.top, width: r.width });
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    place();
    setActiveIdx(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  }, [disabled, place, options, value]);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ['[data-atlas-select-menu]', '[data-atlas-select-trigger]']);

  // Fixed-positioned menu detaches on scroll/resize — reposition or close.
  useEffect(() => {
    if (!open) return;
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node | null)) return;
      close();
    };
    const onResize = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close, place]);

  const pick = (v: string) => {
    onChange(v);
    close();
    btnRef.current?.focus();
  };

  const onKeyDown = (e: Loose) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[activeIdx];
      if (opt) pick(opt.value);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-atlas-select-trigger
        className={`atlas-select ${className} ${open ? 'open' : ''}`.trim()}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={`atlas-select-value ${current ? '' : 'placeholder'}`}>
          {current?.label ?? placeholder}
        </span>
        <svg
          aria-hidden="true"
          className="atlas-select-caret"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
        >
          <path
            d="M2 3.5 5 7 8 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            data-atlas-select-menu
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            className="atlas-select-menu"
            style={{
              position: 'fixed',
              top: rect.bottom + 6,
              left: align === 'right' ? undefined : rect.left,
              right: align === 'right' ? window.innerWidth - rect.right : undefined,
              minWidth: rect.width,
            }}
            onKeyDown={onKeyDown}
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`atlas-select-option ${o.value === value ? 'selected' : ''} ${
                  i === activeIdx ? 'active' : ''
                }`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pick(o.value)}
              >
                <span className="atlas-select-option-label">{o.label}</span>
                {o.hint && <span className="atlas-select-option-hint">{o.hint}</span>}
                {o.value === value && (
                  <svg
                    aria-hidden="true"
                    className="atlas-select-check"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="m2.5 6.5 2.5 2.5L9.5 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

// ── Confirm dialog ──────────────────────────────────────────────────────────
// Imperative API so any handler (across separate panes) can `await confirmDialog(...)`
// without threading dialog state through props. A single <ConfirmRoot/> mounted in
// App renders the actual dialog.
type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const confirmListeners = new Set<() => void>();
let confirmState: ConfirmOptions | null = null;
let confirmResolve: ((v: boolean) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // Resolve any in-flight prompt as cancelled before opening a new one.
  if (confirmResolve) confirmResolve(false);
  return new Promise<boolean>((resolve) => {
    confirmState = opts;
    confirmResolve = resolve;
    confirmListeners.forEach((l) => {
      l();
    });
  });
}

function settleConfirm(value: boolean) {
  confirmResolve?.(value);
  confirmResolve = null;
  confirmState = null;
  confirmListeners.forEach((l) => {
    l();
  });
}

export function ConfirmRoot() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    confirmListeners.add(l);
    return () => {
      confirmListeners.delete(l);
    };
  }, []);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const opts = confirmState;
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus the default action whenever a new prompt opens; opts aliases the module-level state and is the intended trigger
  useEffect(() => {
    if (opts) confirmRef.current?.focus();
  }, [opts]);
  useDismiss(Boolean(opts), () => settleConfirm(false), ['[data-confirm-dialog]']);
  if (!opts) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop; dismissable via Escape (useDismiss) and the cancel button
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop; dismissable via Escape (useDismiss) and the cancel button
    <div className="overlay" onClick={() => settleConfirm(false)}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog surface only stops backdrop-dismiss propagation */}
      <div
        className="dialog confirm-dialog"
        data-confirm-dialog
        role="alertdialog"
        aria-modal="true"
        aria-label={opts.title}
        onClick={(e: Loose) => e.stopPropagation()}
      >
        <div className="confirm-body">
          <h2 className="dialog-title">{opts.title}</h2>
          {opts.message && <p className="confirm-message">{opts.message}</p>}
        </div>
        <div className="dialog-foot confirm-foot">
          <button type="button" className="btn ghost" onClick={() => settleConfirm(false)}>
            {opts.cancelLabel || '取消'}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={`btn ${opts.danger ? 'danger-solid' : 'primary'}`}
            onClick={() => settleConfirm(true)}
          >
            {opts.confirmLabel || '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
// Content-shaped placeholder block with a soft shimmer. Renders as an inline
// <span> (so it can sit in text flow) but is sized via width/height so it
// works anywhere a content rectangle is needed. aria-hidden so screen readers
// skip the placeholder noise.
export function Skeleton({
  w,
  h = 14,
  r = 6,
  className = '',
}: {
  w?: string | number;
  h?: number;
  r?: number;
  className?: string;
}) {
  const style: CSSProperties = {
    width: w,
    height: h,
    borderRadius: r,
    display: 'block',
  };
  return <span className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

// ── EmptyState ──────────────────────────────────────────────────────────────
// Centered "nothing here yet" panel — a glyph (optional), a title, a hint, and
// an optional CTA. role="status" so ATs announce the empty state, which beats
// a silently blank grid.
export function EmptyState({
  glyph,
  title,
  desc,
  action,
}: {
  glyph?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state" role="status">
      {glyph && <div className="empty-state-glyph">{glyph}</div>}
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
