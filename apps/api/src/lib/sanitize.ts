const BLOCKED_TAG_RE =
  /<(script|iframe|object|embed|form|input|button|textarea|select|option|meta|base)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCKED_VOID_TAG_RE =
  /<(script|iframe|object|embed|form|input|button|textarea|select|option|meta|base)\b[^>]*\/?>/gi;
const EVENT_HANDLER_RE = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_RE = /\s+(href|src|xlink:href)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi;
const DANGEROUS_STYLE_RE = /url\s*\(\s*(['"]?)\s*javascript:[\s\S]*?\1\s*\)/gi;

export function sanitizeHtml(html: string) {
  let removed = 0;
  let sanitized = html
    .replace(BLOCKED_TAG_RE, () => {
      removed += 1;
      return '';
    })
    .replace(BLOCKED_VOID_TAG_RE, () => {
      removed += 1;
      return '';
    })
    .replace(EVENT_HANDLER_RE, () => {
      removed += 1;
      return '';
    })
    .replace(JS_URL_RE, (_match, attr: string) => {
      removed += 1;
      return ` ${attr}="#"`;
    })
    .replace(DANGEROUS_STYLE_RE, () => {
      removed += 1;
      return 'none';
    });

  if (!/<!doctype html/i.test(sanitized)) {
    sanitized = `<!doctype html>\n${sanitized}`;
  }

  return {
    html: sanitized,
    removed,
  };
}
