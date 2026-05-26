const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '...',
  laquo: '<<',
  ldquo: '"',
  lsquo: "'",
  mdash: '-',
  nbsp: ' ',
  ndash: '-',
  quot: '"',
  raquo: '>>',
  rdquo: '"',
  rsquo: "'",
  lt: '<',
};

const TITLE_PLACEHOLDERS = new Set(['untitled', 'new document', '未命名文章', '无标题']);

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return ENTITY_MAP[normalized] ?? match;
  });
}

function cleanText(value = '') {
  return decodeHtmlEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const clipped = value.slice(0, maxLength);
  const lastPunctuation = Math.max(
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？'),
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('! '),
    clipped.lastIndexOf('? '),
  );
  if (lastPunctuation >= Math.floor(maxLength * 0.5)) {
    return clipped.slice(0, lastPunctuation + 1).trim();
  }
  return `${clipped.replace(/[，,;；:\s]+$/g, '').trim()}...`;
}

function getAttribute(tag: string, name: string) {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i');
  const match = tag.match(pattern);
  return match ? decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '') : '';
}

function firstTagText(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

function findMetaContent(html: string, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = (getAttribute(tag, 'name') || getAttribute(tag, 'property')).toLowerCase();
    if (wanted.has(key)) {
      const content = cleanText(getAttribute(tag, 'content'));
      if (content) return content;
    }
  }
  return '';
}

function firstMeaningfulParagraph(html: string) {
  const matches = html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
  let first = '';
  for (const match of matches) {
    const text = cleanText(match[1]);
    if (!text) continue;
    first ||= text;
    if (text.length >= 24) return text;
  }
  return first;
}

function fallbackBodySummary(html: string) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  return cleanText(body);
}

function normalizeFallbackTitle(value = '') {
  return value
    .replace(/\.html?$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlaceholderTitle(value: string) {
  return TITLE_PLACEHOLDERS.has(value.trim().toLowerCase());
}

export function extractHtmlMetadata(
  html: string,
  options: { fallbackTitle?: string; maxSummaryLength?: number } = {},
) {
  const maxSummaryLength = options.maxSummaryLength ?? 180;
  const fallbackTitle = normalizeFallbackTitle(options.fallbackTitle);
  const htmlTitle = firstTagText(html, 'title');
  const socialTitle = findMetaContent(html, ['og:title', 'twitter:title']);
  const h1 = firstTagText(html, 'h1');
  const rawTitle = [htmlTitle, socialTitle, h1, fallbackTitle].find(
    (item) => item && !isPlaceholderTitle(item),
  );
  const title = rawTitle ? truncateText(rawTitle, 200) : fallbackTitle;

  const metaSummary =
    findMetaContent(html, ['description', 'og:description', 'twitter:description']) ||
    firstMeaningfulParagraph(html) ||
    fallbackBodySummary(html);
  const summary = metaSummary ? truncateText(metaSummary, maxSummaryLength) : '';

  return { title, summary };
}
