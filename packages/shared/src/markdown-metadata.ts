const TITLE_PLACEHOLDERS = new Set(['untitled', 'new document', '未命名文章', '无标题']);

function normalizeFallbackTitle(value = '') {
  return value
    .replace(/\.(md|markdown)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip the most common inline Markdown markers so the summary reads as plain text.
function stripInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/^>+\s?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max).trim()}...`;
}

export function extractMarkdownMetadata(
  md: string,
  options: { fallbackTitle?: string; maxSummaryLength?: number } = {},
) {
  const maxSummaryLength = options.maxSummaryLength ?? 180;
  const fallbackTitle = normalizeFallbackTitle(options.fallbackTitle);
  const lines = md.replace(/\r\n/g, '\n').split('\n');

  // Only ATX headings (# …) and setext headings (underline with = or -) are recognised.
  let headingTitle = '';
  let inFence = false;
  const paragraphLines: string[] = [];
  let summary = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // ATX heading: # … through ###### …
    const atx = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (atx && !headingTitle) {
      headingTitle = atx[1]?.trim() ?? '';
      continue;
    }

    // Thematic break: 3+ of the same `-`, `*`, or `_`, optionally space-separated, nothing else.
    const isThematicBreak = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
    if (isThematicBreak) {
      if (paragraphLines.length && !summary) summary = stripInline(paragraphLines.join(' '));
      // Reset accumulated lines so a setext heading immediately before a break isn't misread.
      paragraphLines.length = 0;
      continue;
    }

    // Setext heading underline: line of `=` or `-` directly after a single accumulated prose line.
    if (!headingTitle && paragraphLines.length === 1 && /^\s{0,3}(=+|-+)\s*$/.test(line)) {
      headingTitle = paragraphLines[0] ?? '';
      paragraphLines.length = 0;
      continue;
    }

    if (!summary) {
      if (line.trim() === '') {
        if (paragraphLines.length) summary = stripInline(paragraphLines.join(' '));
        continue;
      }
      // Block-level markers that are not paragraph text (headings, lists, blockquotes, tables).
      if (/^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>|\|)/.test(line)) {
        if (paragraphLines.length) summary = stripInline(paragraphLines.join(' '));
        continue;
      }
      paragraphLines.push(line.trim());
    }
  }
  if (!summary && paragraphLines.length) summary = stripInline(paragraphLines.join(' '));

  const rawTitle = [headingTitle, fallbackTitle].find(
    (item) => item && !TITLE_PLACEHOLDERS.has(item.toLowerCase()),
  );
  const title = rawTitle ? truncate(rawTitle, 200) : fallbackTitle;

  return { title, summary: summary ? truncate(summary, maxSummaryLength) : '' };
}
