// Markdown rendering core. All heavy deps are loaded via dynamic import() for code-splitting.
// Do NOT import CSS here — styles are handled separately.

let mdInstance: import('markdown-it').default | null = null;
let hooksAdded = false;

async function getMarkdownIt(): Promise<import('markdown-it').default> {
  if (mdInstance) return mdInstance;

  const [
    { default: MarkdownIt },
    { default: hljs },
    // Untyped plugins — shimmed in shims.d.ts
    { default: footnote },
    { default: deflist },
    { default: sub },
    { default: sup },
    { default: mark },
    { default: ins },
    { default: taskLists },
    // markdown-it-emoji@3 exports named { full, light, bare } — no default
    emojiMod,
    // markdown-it-anchor@9 has proper types; permalink namespace lives on the default export
    { default: anchor },
    { default: toc },
    // @vscode/markdown-it-katex is a CJS module with exports.default
    katexMod,
    // markdown-it-github-alerts exports default
    alertsMod,
  ] = await Promise.all([
    import('markdown-it'),
    import('highlight.js'),
    import('markdown-it-footnote'),
    import('markdown-it-deflist'),
    import('markdown-it-sub'),
    import('markdown-it-sup'),
    import('markdown-it-mark'),
    import('markdown-it-ins'),
    import('markdown-it-task-lists'),
    import('markdown-it-emoji'),
    import('markdown-it-anchor'),
    import('markdown-it-table-of-contents'),
    import('@vscode/markdown-it-katex'),
    import('markdown-it-github-alerts'),
  ]);

  // Declare md first so the highlight callback can close over it without circularity.
  let md: import('markdown-it').default;

  const highlightFn = (code: string, lang: string): string => {
    if (lang === 'mermaid') {
      // Preserve as a placeholder for enhance() to replace with SVG
      return `<pre class="md-mermaid">${md.utils.escapeHtml(code)}</pre>`;
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(code, { language: lang }).value}</code></pre>`;
      } catch {
        // fall through to plain escape
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
  };

  md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: highlightFn,
  });

  // markdown-it-emoji@3: named exports { full, light, bare } — use the full preset
  // biome-ignore lint/suspicious/noExplicitAny: plugin interop — no default export in v3
  const emoji = (emojiMod as any).full;

  // @vscode/markdown-it-katex: CJS module, real plugin is under .default
  // biome-ignore lint/suspicious/noExplicitAny: plugin interop — CJS esModuleInterop wrapping
  const katex = (katexMod as any).default ?? katexMod;

  // markdown-it-github-alerts: ESM with default export
  // biome-ignore lint/suspicious/noExplicitAny: plugin interop — guard against bundler wrapping
  const alerts = (alertsMod as any).default ?? alertsMod;

  md.use(footnote)
    .use(deflist)
    .use(sub)
    .use(sup)
    .use(mark)
    .use(ins)
    .use(taskLists, { enabled: true, label: true })
    .use(emoji)
    .use(anchor, { permalink: anchor.permalink?.headerLink?.() })
    .use(toc, { includeLevel: [2, 3] })
    .use(katex)
    .use(alerts);

  mdInstance = md;
  return md;
}

export async function renderMarkdown(src: string): Promise<string> {
  const [md, dompurifyMod] = await Promise.all([getMarkdownIt(), import('dompurify')]);

  // dompurify@3 in a browser/Vite context: default export has .sanitize
  // biome-ignore lint/suspicious/noExplicitAny: plugin interop — guard against bundler wrapping
  const DOMPurify = (dompurifyMod as any).default ?? dompurifyMod;

  if (!hooksAdded) {
    hooksAdded = true;
    DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
      if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  const rawHtml = md.render(src ?? '');
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_ATTR: ['class', 'style', 'id', 'aria-hidden', 'target', 'rel'],
  }) as string;
}

let mermaidCallCount = 0;

export async function enhance(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre.md-mermaid');
  if (blocks.length === 0) return;

  const [mermaidMod, dompurifyMod] = await Promise.all([import('mermaid'), import('dompurify')]);
  // biome-ignore lint/suspicious/noExplicitAny: plugin interop — guard against bundler wrapping
  const mermaid = (mermaidMod as any).default ?? mermaidMod;
  // biome-ignore lint/suspicious/noExplicitAny: plugin interop — guard against bundler wrapping
  const DOMPurify = (dompurifyMod as any).default ?? dompurifyMod;

  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });

  const callId = mermaidCallCount++;
  let diagramIndex = 0;

  for (const block of blocks) {
    const source = block.textContent ?? '';
    const id = `md-mermaid-${callId}-${diagramIndex++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      const wrap = document.createElement('div');
      wrap.className = 'md-mermaid-rendered';
      wrap.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      }) as string;
      block.replaceWith(wrap);
    } catch (e) {
      console.warn('mermaid render failed', e);
      block.classList.add('md-mermaid-error');
    }
  }
}
