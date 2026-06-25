// Defensive shim injected into raw uploaded HTML served for the reader's <iframe>.
//
// Why this exists: many uploaded "report" documents pair a same-page table of contents
// (anchor links + CSS `scroll-behavior: smooth`) with a scroll-spy that calls
// `Element.scrollIntoView()` on the active TOC entry as sections cross the viewport. In
// Chromium a programmatic scroll of a scroller CANCELS that scroller's in-flight smooth
// scroll, so the scroll-spy aborts the anchor jump partway — the page "scrolls a little
// bit then stops". WebKit (Safari) doesn't preempt the user-initiated smooth scroll, so
// it lands correctly. The iframe is a sandboxed opaque origin, so Atlas can't reach in
// from the parent frame; the only lever is to ship a guard inside the served document.
//
// What the guard does: for a short window after an in-page anchor navigation, it stops
// ONLY the scroll-spy's bookkeeping `scrollIntoView` from moving the ROOT scroller. The
// tell is the target: the spy scrolls a TOC *link* (`a[href^="#"]`) to keep the active
// entry visible, so we redirect that to an inner container (e.g. the TOC sidebar) and
// leave the root alone, letting the anchor smooth scroll finish.
//
// Every other `scrollIntoView` passes straight through — crucially the CONTENT-targeted
// kind: some docs do the jump themselves in a click handler (`e.preventDefault()` then
// `section.scrollIntoView({behavior:'smooth'})`) instead of relying on a native anchor.
// That call targets a section, not a TOC link, so it is never suppressed — otherwise the
// guard would eat the very scroll the user asked for. Docs without the spy pattern are
// likewise unaffected; the patch is a passthrough outside the narrow guarded case.
//
// The script is static (no document data is interpolated) and runs in the same sandboxed
// opaque origin as the document's own scripts, so it adds no privilege or injection risk.
const SCROLL_GUARD = `<script>(function(){try{var S=Element.prototype.scrollIntoView;if(typeof S!=="function")return;var until=0,cap=0;function now(){return Date.now();}function arm(){var t=now();until=t+260;cap=t+3000;}function active(){var t=now();return t<until&&t<cap;}document.addEventListener("click",function(e){var t=e.target;var a=t&&t.closest?t.closest('a[href^="#"]'):null;if(a)arm();},true);window.addEventListener("hashchange",arm);window.addEventListener("scroll",function(){if(until&&now()<cap)until=now()+260;},{passive:true});function box(el){var n=el&&el.parentElement;var root=document.scrollingElement||document.documentElement;while(n&&n!==root&&n!==document.body&&n!==document.documentElement){var oy=getComputedStyle(n).overflowY;if((oy==="auto"||oy==="scroll")&&n.scrollHeight>n.clientHeight+1)return n;n=n.parentElement;}return null;}Element.prototype.scrollIntoView=function(){if(active()&&this&&this.closest&&this.closest('a[href^="#"]')){var c=box(this);if(c){var cr=c.getBoundingClientRect(),er=this.getBoundingClientRect();if(er.top<cr.top)c.scrollTop-=(cr.top-er.top);else if(er.bottom>cr.bottom)c.scrollTop+=(er.bottom-cr.bottom);}return;}return S.apply(this,arguments);};}catch(_e){}})();</script>`;

// Marker the API tests assert on without pinning the whole minified body.
export const SCROLL_GUARD_MARKER = 'Element.prototype.scrollIntoView=function';

// Insert the guard as early as possible so the prototype patch is in place before the
// document's own scripts run. Prefer right after <head>, then <body>; fall back to after
// a leading doctype (prepending a <script> before <!doctype> would force quirks mode).
export function injectScrollGuard(html: string): string {
  if (!html) return html;
  const head = html.match(/<head[^>]*>/i);
  if (head?.index != null) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + SCROLL_GUARD + html.slice(at);
  }
  const body = html.match(/<body[^>]*>/i);
  if (body?.index != null) {
    const at = body.index + body[0].length;
    return html.slice(0, at) + SCROLL_GUARD + html.slice(at);
  }
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) {
    return html.slice(0, doctype[0].length) + SCROLL_GUARD + html.slice(doctype[0].length);
  }
  return SCROLL_GUARD + html;
}
