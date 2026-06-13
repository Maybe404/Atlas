import { badRequest } from './http-error';

const MAX_CONTENT_BYTES = 8 * 1024 * 1024;

// Atlas does NOT sanitize stored content at rest. HTML is rendered inside a
// sandboxed iframe; Markdown is sanitized at render time on the client. This
// helper only enforces an upload size limit.
export function validateContentForStorage(content: string) {
  const size = new TextEncoder().encode(content).byteLength;
  if (size > MAX_CONTENT_BYTES) {
    throw badRequest(`内容超出 ${MAX_CONTENT_BYTES / 1024 / 1024} MB 上限。`);
  }
  return { content, size };
}

// Backwards-compatible alias used by existing HTML routes.
export function validateHtmlForStorage(html: string) {
  const { content, size } = validateContentForStorage(html);
  return { html: content, size };
}
