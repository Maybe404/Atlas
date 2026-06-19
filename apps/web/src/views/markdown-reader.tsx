import { useCallback, useEffect, useRef, useState } from 'react';
import { TocList } from '../chrome';
import type { Loose } from '../loose-types';
import { renderMarkdownWithDiagrams } from '../markdown/renderer';
import { getScroll, setScroll } from '../reader-progress';

// Build the TocList shape ([{ num, id, title, subs:[{ id, title }] }]) from the
// rendered headings. The highest heading level present becomes the numbered
// sections; the next level down becomes their subs.
function buildToc(root: HTMLElement): Loose[] {
  const heads = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3')).filter((h) => h.id);
  if (heads.length === 0) return [];
  const minLevel = Math.min(...heads.map((h) => Number(h.tagName[1])));
  const secs: Loose[] = [];
  let num = 0;
  for (const h of heads) {
    const level = Number(h.tagName[1]);
    const title = (h.textContent || '').trim();
    if (!title) continue;
    if (level === minLevel || secs.length === 0) {
      num += 1;
      secs.push({ id: h.id, title, num: String(num).padStart(2, '0'), subs: [] });
    } else {
      secs[secs.length - 1].subs.push({ id: h.id, title, depth: level - minLevel });
    }
  }
  return secs;
}

export function MarkdownReader({ content, onScroll, tocPanel = false, scrollKey }: Loose) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null); // .md-body
  const scrollRef = useRef<HTMLDivElement>(null); // .md-scroll
  const tocScrollRef = useRef<HTMLDivElement>(null); // TOC .scroll-list

  const [toc, setToc] = useState<Loose[]>([]);
  const [active, setActive] = useState('');
  const [tocOpen, setTocOpen] = useState(false);

  // Refs read inside event handlers / timers that must see the latest value.
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const pickingRef = useRef(false);
  const pickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRef = useRef(false);
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = tocOpen;
  }, [tocOpen]);

  // Collapse after 3s of stillness — unless the pointer is parked on the panel.
  const armIdle = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      if (!hoverRef.current) setTocOpen(false);
    }, 3000);
  }, []);

  // Scroll-spy + continuous TOC follow. The active heading is the last one
  // above the reading line; we also drive the TOC's own scroll continuously so
  // it tracks the article as smoothly as a direct scroll — interpolating
  // between the active row and the next by how far we've read into the section,
  // instead of the discrete per-active jump that made rows pop in one-by-one.
  const LINE = 96; // reading line, measured from the scroll container's top
  const updateActive = useCallback(() => {
    const sc = scrollRef.current;
    const body = ref.current;
    if (!sc || !body) return;
    const heads = Array.from(body.querySelectorAll<HTMLElement>('h1, h2, h3')).filter((h) => h.id);
    if (heads.length === 0) return;
    const scTop = sc.getBoundingClientRect().top;
    let k = 0;
    for (let i = 0; i < heads.length; i++) {
      if (heads[i]!.getBoundingClientRect().top - scTop <= LINE) k = i;
      else break;
    }
    const activeId = heads[k]!.id;
    setActive(activeId); // identical string → React bails, no re-render

    const list = tocScrollRef.current;
    if (!list) return;
    const max = list.scrollHeight - list.clientHeight;
    if (max <= 0) return; // TOC fits — nothing to follow
    // Fraction read into the current section (0 at its heading, 1 at the next).
    const curTop = heads[k]!.getBoundingClientRect().top - scTop;
    const next = heads[k + 1];
    const nextTop = next ? next.getBoundingClientRect().top - scTop : curTop;
    const span = nextTop - curTop;
    const f = span > 0 ? Math.min(Math.max((LINE - curTop) / span, 0), 1) : 0;
    // Content-relative offsets of the matching rows (scrollTop cancels current scroll).
    const rowK = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(activeId)}"]`);
    if (!rowK) return;
    const listTop = list.getBoundingClientRect().top;
    const offK = rowK.getBoundingClientRect().top - listTop + list.scrollTop;
    const rowN = next
      ? list.querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)
      : null;
    const offN = rowN ? rowN.getBoundingClientRect().top - listTop + list.scrollTop : offK;
    const anchor = list.clientHeight * 0.38; // keep the active row ~⅓ down
    list.scrollTop = Math.min(Math.max(offK + f * (offN - offK) - anchor, 0), max);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    renderMarkdownWithDiagrams(content || '')
      .then((out) => {
        if (alive) {
          setHtml(out);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [content]);

  // html already has mermaid SVGs inlined by renderMarkdownWithDiagrams, so there
  // is no post-render DOM mutation to do — just rebuild the TOC from the headings.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild TOC after new content is set
  useEffect(() => {
    if (loading || !ref.current) return;
    // Restore the saved reading position for this document once it has rendered.
    if (scrollRef.current && scrollKey) {
      const saved = getScroll(scrollKey);
      if (saved > 0) scrollRef.current.scrollTop = saved;
    }
    if (tocPanel) {
      setToc(buildToc(ref.current));
      setTocOpen(false);
      updateActive();
    }
  }, [loading, html, scrollKey]);

  // Right-edge trigger: opening is intentional (pointer reaches the edge), so
  // plain scrolling never pops the panel. Only armed when there's a TOC.
  useEffect(() => {
    if (!tocPanel || toc.length === 0) return;
    const onMove = (e: MouseEvent) => {
      if (e.clientX > window.innerWidth - 22 && !openRef.current) {
        setTocOpen(true);
        armIdle();
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [tocPanel, toc.length, armIdle]);

  useEffect(
    () => () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Suppress the chrome auto-hide while a TOC pick is animating the scroll —
    // otherwise the programmatic jump toggles the top meta bar (flash + jitter).
    if (!pickingRef.current) onScroll?.(e);
    if (scrollKey) setScroll(scrollKey, e.currentTarget.scrollTop);
    if (!tocPanel) return;
    // Coalesce scroll-spy to one reflow per frame — reading every heading's
    // rect on each raw scroll event is what made following the article stutter.
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updateActive();
      });
    }
    // While open, scrolling keeps the panel alive and the active item tracks
    // the article; it collapses only once scrolling has been still for 3s.
    if (openRef.current) armIdle();
  };

  const onPick = (id: string) => {
    const sc = scrollRef.current;
    const el = document.getElementById(id);
    if (sc && el) {
      const top =
        el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 16;
      pickingRef.current = true;
      if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
      pickTimerRef.current = setTimeout(() => {
        pickingRef.current = false;
      }, 700);
      sc.scrollTo({ top, behavior: 'smooth' });
    }
    setActive(id);
    armIdle();
  };

  if (loading) return <div className="app-state-banner">正在渲染 Markdown…</div>;
  return (
    <>
      <div
        className="md-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ height: '100%', overflow: 'auto' }}
      >
        {/* content already sanitized by renderer's DOMPurify pass */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: content already sanitized by renderer's DOMPurify pass */}
        <div className="md-body" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      {tocPanel && toc.length > 0 && (
        <>
          <button
            type="button"
            className={`reader-toc-handle ${tocOpen ? 'hidden' : ''}`}
            aria-label="打开目录"
            onMouseEnter={() => {
              setTocOpen(true);
              armIdle();
            }}
            onClick={() => {
              setTocOpen(true);
              armIdle();
            }}
          >
            <span />
            <span />
            <span />
          </button>
          <aside
            className={`reader-toc-pop ${tocOpen ? 'open' : ''}`}
            onMouseEnter={() => {
              hoverRef.current = true;
              if (idleRef.current) clearTimeout(idleRef.current);
            }}
            onMouseLeave={() => {
              hoverRef.current = false;
              armIdle();
            }}
          >
            <div className="reader-toc-head">目录</div>
            <TocList toc={toc} active={active} onPick={onPick} scrollRef={tocScrollRef} />
          </aside>
        </>
      )}
    </>
  );
}
