import { useEffect, useState } from 'react';

// Render uploaded HTML through a blob: URL instead of an iframe `srcDoc`.
//
// A `srcDoc` document lives at the special `about:srcdoc` URL. Our HTML iframes are sandboxed
// WITHOUT `allow-same-origin` (so untrusted uploads stay on an opaque origin and can't script the
// Atlas page). Clicking an in-page table-of-contents link (`<a href="#section">`) navigates that
// frame to `about:srcdoc#section`; Chromium cannot re-render the opaque-origin srcdoc on that
// navigation, so the whole article goes blank until the iframe is re-created.
//
// A blob: URL is a real, fetchable URL, so the identical `#section` click is just an ordinary
// same-document scroll — no blanking. The sandbox stays opaque, so isolation is unchanged.
// Requires `frame-src blob:` in the server CSP (apps/api/src/server.ts) for production.
export function useHtmlBlobUrl(html: string | null | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    // charset=utf-8 is required: unlike a srcDoc string (decoded as Unicode directly), a blob is
    // raw UTF-8 bytes — without the charset the iframe guesses a legacy encoding and CJK turns to
    // mojibake. Documents that declare their own <meta charset> still render fine.
    const objectUrl = URL.createObjectURL(
      new Blob([html ?? ''], { type: 'text/html;charset=utf-8' }),
    );
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [html]);
  return url;
}
