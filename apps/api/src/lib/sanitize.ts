import { badRequest } from './http-error';

const MAX_HTML_BYTES = 8 * 1024 * 1024;

export function validateHtmlForStorage(html: string) {
  const size = new TextEncoder().encode(html).byteLength;
  if (size > MAX_HTML_BYTES) {
    throw badRequest(`HTML exceeds the ${MAX_HTML_BYTES / 1024 / 1024} MB upload limit.`);
  }

  return { html, size };
}
