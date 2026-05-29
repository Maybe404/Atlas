import { badRequest } from './http-error';

const MAX_HTML_BYTES = 8 * 1024 * 1024;

// Atlas does NOT sanitize stored HTML. Uploaded documents are rendered as-is
// inside a sandboxed iframe (see apps/web reader views), which is the sole
// isolation boundary. This helper only enforces an upload size limit.
export function validateHtmlForStorage(html: string) {
  const size = new TextEncoder().encode(html).byteLength;
  if (size > MAX_HTML_BYTES) {
    throw badRequest(`HTML exceeds the ${MAX_HTML_BYTES / 1024 / 1024} MB upload limit.`);
  }

  return { html, size };
}
