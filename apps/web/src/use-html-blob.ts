import { useEffect, useState } from 'react';

// Render UNSAVED uploaded HTML (live editor + upload previews) through a blob: URL instead of an
// iframe `srcDoc`. Saved documents go through the same-origin /documents/:id/raw endpoint instead
// (see reader-view / public-document-view / admin-docs-view) — that's the only way in-page TOC
// anchors actually SCROLL. Previews have no served URL, so blob is the best available option.
//
// Why not srcDoc: a `srcDoc` document lives at the special `about:srcdoc` URL. Our HTML iframes are
// sandboxed WITHOUT `allow-same-origin` (untrusted uploads stay opaque and can't script the Atlas
// page). Clicking an in-page anchor navigates a sandboxed srcdoc frame to `about:srcdoc#x`, which
// Chromium cannot re-render → the article goes blank. A blob: URL avoids the blanking.
//
// Caveat: blob: (like about:srcdoc) does NOT perform same-document fragment scrolling, so TOC
// clicks in these previews won't jump to the section — only a real network URL does (the raw
// endpoint). That's an accepted limitation for the authoring previews.
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
