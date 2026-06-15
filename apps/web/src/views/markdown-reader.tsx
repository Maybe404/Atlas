import { useCallback, useEffect, useRef, useState } from 'react';
import { TocList } from '../chrome';
import type { Loose } from '../loose-types';
import { enhance, renderMarkdown } from '../markdown/renderer';

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

export function MarkdownReader({ content, onScroll, tocPanel = false }: Loose) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null); // .md-body
  const scrollRef = useRef<HTMLDivElement>(null); // .md-scroll

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

  // Scroll-spy: the active heading is the last one above the fold.
  const updateActive = useCallback(() => {
    const sc = scrollRef.current;
    const body = ref.current;
    if (!sc || !body) return;
    const heads = body.querySelectorAll<HTMLElement>('h1, h2, h3');
    const top = sc.getBoundingClientRect().top;
    let cur = '';
    for (const h of heads) {
      if (!h.id) continue;
      if (h.getBoundingClientRect().top - top <= 96) cur = h.id;
      else break;
    }
    if (!cur) {
      const first = heads[0];
      if (first?.id) cur = first.id;
    }
    if (cur) setActive(cur);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    renderMarkdown(content || '')
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: html triggers enhance + toc rebuild after new content is set
  useEffect(() => {
    if (loading || !ref.current) return;
    enhance(ref.current);
    if (tocPanel) {
      setToc(buildToc(ref.current));
      setTocOpen(false);
      updateActive();
    }
  }, [loading, html]);

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
            <TocList toc={toc} active={active} onPick={onPick} />
          </aside>
        </>
      )}
    </>
  );
}
