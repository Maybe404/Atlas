import sanitize from 'sanitize-html';
import { badRequest } from './http-error';

const MAX_HTML_BYTES = 8 * 1024 * 1024;
const DANGEROUS_PATTERN_RE =
  /<(script|iframe|object|embed|form|input|button|textarea|select|option|meta|base)\b|javascript:|data:text\/html|on[a-z]+\s*=|url\s*\(\s*(['"]?)\s*javascript:/gi;

const allowedTags = sanitize.defaults.allowedTags.concat([
  'article',
  'aside',
  'caption',
  'details',
  'figcaption',
  'figure',
  'footer',
  'header',
  'main',
  'mark',
  'nav',
  'section',
  'summary',
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'defs',
  'linearGradient',
  'stop',
]);

const globalAttributes = [
  'abbr',
  'align',
  'aria-*',
  'class',
  'data-*',
  'dir',
  'height',
  'id',
  'lang',
  'role',
  'style',
  'title',
  'width',
];

const svgAttributes = [
  'cx',
  'cy',
  'd',
  'fill',
  'height',
  'offset',
  'points',
  'r',
  'rx',
  'ry',
  'stroke',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-width',
  'viewBox',
  'width',
  'x',
  'x1',
  'x2',
  'y',
  'y1',
  'y2',
];

function countDangerousPatterns(html: string) {
  return html.match(DANGEROUS_PATTERN_RE)?.length ?? 0;
}

export function sanitizeHtml(html: string) {
  const size = new TextEncoder().encode(html).byteLength;
  if (size > MAX_HTML_BYTES) {
    throw badRequest(`HTML exceeds the ${MAX_HTML_BYTES / 1024 / 1024} MB upload limit.`);
  }

  const removed = countDangerousPatterns(html);
  let sanitized = sanitize(html, {
    allowedTags,
    allowedAttributes: {
      '*': globalAttributes,
      a: ['href', 'name', 'target', 'rel', ...globalAttributes],
      img: ['alt', 'height', 'loading', 'src', 'srcset', 'width', ...globalAttributes],
      table: ['cellpadding', 'cellspacing', 'summary', ...globalAttributes],
      td: ['colspan', 'rowspan', ...globalAttributes],
      th: ['colspan', 'rowspan', 'scope', ...globalAttributes],
      svg: svgAttributes.concat(globalAttributes),
      path: svgAttributes.concat(globalAttributes),
      circle: svgAttributes.concat(globalAttributes),
      rect: svgAttributes.concat(globalAttributes),
      line: svgAttributes.concat(globalAttributes),
      polyline: svgAttributes.concat(globalAttributes),
      polygon: svgAttributes.concat(globalAttributes),
      g: svgAttributes.concat(globalAttributes),
      stop: svgAttributes.concat(globalAttributes),
      linearGradient: svgAttributes.concat(globalAttributes),
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
    allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    allowProtocolRelative: false,
    allowedIframeHostnames: [],
    disallowedTagsMode: 'discard',
    parseStyleAttributes: true,
    transformTags: {
      a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
  });

  if (!/<!doctype html/i.test(sanitized)) {
    sanitized = `<!doctype html>\n${sanitized}`;
  }

  return {
    html: sanitized,
    removed,
    size,
  };
}
