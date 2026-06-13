import { renderMarkdown } from './renderer';

export async function copyMarkdownSource(src: string): Promise<void> {
  await navigator.clipboard.writeText(src ?? '');
}

// Copy with formatting: write text/html (sanitized rendered HTML) + a plain-text fallback.
export async function copyMarkdownRich(src: string): Promise<void> {
  const html = await renderMarkdown(src);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
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
