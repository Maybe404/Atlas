import { renderMarkdown } from './renderer';

export async function copyMarkdownSource(src: string): Promise<void> {
  await navigator.clipboard.writeText(src ?? '');
}

// Computed-style properties worth inlining. Feishu / Notion / WPS smart docs /
// Obsidian strip <style> blocks and class-based CSS on paste, so anything that
// isn't either a semantic tag or an inline style is lost. Inlining this subset
// makes the fragment self-contained — it pastes WITH formatting everywhere.
const INLINE_PROPS = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'line-height',
  'letter-spacing',
  'white-space',
  'list-style-type',
  'vertical-align',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-collapse',
  'border-radius',
  'padding',
  'margin',
];

// Walk the subtree, freeze each element's computed style into an inline `style`
// attribute, then drop the (now meaningless) class so the output carries no
// external dependencies.
function inlineComputedStyles(root: HTMLElement): void {
  const nodes: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of nodes) {
    const computed = getComputedStyle(el);
    const decls: string[] = [];
    for (const prop of INLINE_PROPS) {
      const val = computed.getPropertyValue(prop);
      if (val && val !== 'none' && val !== 'normal') decls.push(`${prop}:${val}`);
    }
    el.setAttribute('style', decls.join(';'));
    el.removeAttribute('class');
  }
}

// Unwrap heading self-links (markdown-it-anchor headerLink) so pasted headings
// are plain text, not blue underlined links to "#anchor".
function unwrapHeaderAnchors(root: HTMLElement): void {
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>('a.header-anchor'))) {
    const parent = a.parentNode;
    if (!parent) continue;
    while (a.firstChild) parent.insertBefore(a.firstChild, a);
    a.remove();
  }
}

// Render markdown to a self-contained, fully-inlined HTML string suitable for
// pasting into any rich-text editor. Rendered offscreen against the app's real
// stylesheet, but with the theme forced to light so colors are dark-on-light
// (a dark-mode copy would otherwise paste invisible light text onto white docs).
async function buildStyledHtml(src: string): Promise<string> {
  const html = await renderMarkdown(src);

  const host = document.createElement('div');
  host.className = 'md-body';
  // Offscreen but laid out (needed for getComputedStyle to resolve real values).
  host.style.cssText =
    'position:fixed;left:-99999px;top:0;width:760px;pointer-events:none;opacity:0;';
  host.innerHTML = html;

  // Force light theme synchronously — no await between toggle and restore, so the
  // browser never paints the change and the user sees no flicker.
  const root = document.documentElement;
  const prevTheme = root.getAttribute('data-theme');
  root.setAttribute('data-theme', '');
  document.body.appendChild(host);
  try {
    unwrapHeaderAnchors(host);
    inlineComputedStyles(host);
    return host.outerHTML;
  } finally {
    host.remove();
    if (prevTheme === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prevTheme);
  }
}

// Copy with formatting: write inlined-style HTML (text/html) so third-party
// editors render it with full formatting, plus the raw markdown as a text/plain
// fallback for plain-text targets.
export async function copyMarkdownRich(src: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const html = await buildStyledHtml(src);
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([src ?? ''], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }
  // Old browsers without ClipboardItem: fall back to copying source.
  await navigator.clipboard.writeText(src ?? '');
}
