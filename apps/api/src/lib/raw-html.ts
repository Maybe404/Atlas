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

// Two-way bridge between the reader's HTML <iframe> and the Atlas shell. The iframe is
// a sandboxed opaque origin (no allow-same-origin), so the parent can't reach into its
// DOM — but postMessage works BOTH ways, so everything that needs the frame's innards
// runs from inside via this injected script:
//
//   iframe → parent
//     • 'scroll' {top, userScroll} — recedes the topbar only for direct user scrolling AND
//                         carries the scroll offset for reader-progress.
//     • 'reveal'        — a genuine edge-hover / Esc inside the frame brings the nav back.
//                         The same-coordinate check skips the synthetic mousemoves a
//                         browser fires while the page scrolls under a still pointer,
//                         which would otherwise reveal the chrome a scroll just hid.
//     • 'ready'         — the document is parsed; ask the parent for its init payload.
//   parent → iframe
//     • 'init' {masthead, restoreTop} — the parent owns the doc metadata (space / author /
//                         date, honoring the share link's showAuthor), so it hands back a
//                         slim provenance strip to prepend and the saved scroll offset to
//                         restore. The strip is a single muted line (space · author · date
//                         · HTML), NOT a big title: uploaded reports usually carry their own
//                         hero title, and a second large title just collides with it. We
//                         build it with createElement + textContent (no innerHTML) so doc
//                         data is never parsed as markup.
//
// Parent side: app.tsx's 'message' handler maps 'scroll' → hideChrome / 'reveal' →
// wakeChrome; the reader/public views map 'ready' → post init and 'scroll' → setScroll.
const CHROME_BRIDGE = `<script>(function(){try{function se(){return document.scrollingElement||document.documentElement||document.body;}function post(t,x){try{var m={source:"atlas-reader",type:t};if(x)for(var k in x)m[k]=x[k];parent.postMessage(m,"*");}catch(_e){}}var _sc=null;function findScroller(){if(_sc)return _sc;var best=se();var bo=best?(best.scrollHeight-best.clientHeight):0;try{var all=document.body?document.body.getElementsByTagName("*"):[];for(var i=0;i<all.length;i++){var el=all[i];var oy=getComputedStyle(el).overflowY;if(oy==="auto"||oy==="scroll"){var ov=el.scrollHeight-el.clientHeight;if(ov>bo+4){bo=ov;best=el;}}}}catch(_e){}_sc=best;return best;}var st=false,scroller=null;function fs(){st=false;post("scroll",{top:curTop(scroller||findScroller())});}document.addEventListener("scroll",function(e){var t=e.target;scroller=(!t||t===document||t===document.documentElement||t===document.body)?se():t;if(st)return;st=true;(window.requestAnimationFrame||window.setTimeout)(fs);},{capture:true,passive:true});window.addEventListener("scroll",function(e){var t=e.target;scroller=(!t||t===document||t===document.documentElement||t===document.body)?se():t;if(st)return;st=true;(window.requestAnimationFrame||window.setTimeout)(fs);},{capture:true,passive:true});var lx=-1,ly=-1;document.addEventListener("mousemove",function(e){if(e.clientX===lx&&e.clientY===ly)return;lx=e.clientX;ly=e.clientY;var nb=innerHeight-e.clientY<90,nt=e.clientY<16,ntr=e.clientY<120&&(innerWidth-e.clientX)<240;if(nb||nt||ntr)post("reveal");},{passive:true});document.addEventListener("keydown",function(e){if(e.key==="Escape")post("reveal");});function mast(m){try{if(!m)return;var items=[];if(m.eyebrow)items.push(m.eyebrow);if(m.byline)for(var i=0;i<m.byline.length;i++){if(m.byline[i])items.push(m.byline[i]);}if(!items.length)return;var sc=findScroller();var host=(sc&&sc.nodeType===1&&sc!==se()&&sc.insertBefore)?sc:(document.body||document.documentElement);if(!host||(host.querySelector&&host.querySelector("[data-atlas-masthead]")))return;var h=document.createElement("div");h.setAttribute("data-atlas-masthead","");h.style.cssText="display:block;box-sizing:border-box;background:none;margin:0;padding:13px 40px;border:0;border-bottom:1px solid rgba(120,120,128,.2);font:500 12.5px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:.01em;color:#6b7280;";h.textContent=items.join("  \\u00b7  ");host.insertBefore(h,host.firstChild);}catch(_e){}}function isRoot(sc){return !sc||sc===se()||sc===document.documentElement||sc===document.body;}function curTop(sc){return isRoot(sc)?(window.pageYOffset||(se()?se().scrollTop:0)||0):sc.scrollTop;}function setTop(sc,top){try{if(isRoot(sc))window.scrollTo(0,top);else sc.scrollTop=top;}catch(_e){}}
// A freshly (re)navigated iframe isn't scrollable at DOMContentLoaded: the parent is
// still settling the frame's box, so the document's content doesn't overflow the viewport
// for a few hundred ms — window.scrollTo is a no-op until then. So we don't restore once,
// we poll: every 80ms re-apply the target (clamped to the current max) until it actually
// lands and holds for two consecutive checks, then stop (which also avoids fighting a user
// who scrolls once the page is finally live). Bounded to ~2s so we never loop forever.
function restore(top){if(!(top>0))return;restoring=true;var tries=0,holds=0;function tick(){tries++;var sc=findScroller();var max=isRoot(sc)?(document.documentElement.scrollHeight-window.innerHeight):(sc.scrollHeight-sc.clientHeight);var want=max>0?Math.min(top,max):top;setTop(sc,want);if(curTop(sc)>=want-3)holds++;else holds=0;if(holds<2&&tries<25)setTimeout(tick,80);else restoring=false;}tick();}
window.addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data;if(!d||d.source!=="atlas-host")return;if(d.type==="init"){mast(d.masthead);restore(d.restoreTop);}});function ready(){post("ready");}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready);else ready();}catch(_e){}})();</script>`;

const CHROME_BRIDGE_WITH_USER_SCROLL = CHROME_BRIDGE.replace(
  'var st=false,scroller=null;function fs(){st=false;post("scroll",{top:curTop(scroller||findScroller())});}document.addEventListener("scroll"',
  'var st=false,scroller=null,lastUserScroll=0,restoring=false;function markUserScroll(){lastUserScroll=Date.now();}function fs(){st=false;post("scroll",{top:curTop(scroller||findScroller()),userScroll:(Date.now()-lastUserScroll<500)||!restoring});}document.addEventListener("wheel",markUserScroll,{passive:true});document.addEventListener("touchmove",markUserScroll,{passive:true});document.addEventListener("keydown",function(e){if(e.key===" "||e.key==="PageDown"||e.key==="PageUp"||e.key==="ArrowDown"||e.key==="ArrowUp"||e.key==="Home"||e.key==="End")markUserScroll();},{passive:true});document.addEventListener("scroll"',
).replace(
  'var nb=innerHeight-e.clientY<90,nt=e.clientY<16,ntr=e.clientY<120&&(innerWidth-e.clientX)<240;if(nb||nt||ntr)post("reveal");',
  'var nb=innerHeight-e.clientY<90,nt=e.clientY<16;if(nb||nt)post("reveal");',
);

// Insert the guard as early as possible so the prototype patch is in place before the
// document's own scripts run. Prefer right after <head>, then <body>; fall back to after
// a leading doctype (prepending a <script> before <!doctype> would force quirks mode).
export function injectScrollGuard(html: string): string {
  if (!html) return html;
  // SCROLL_GUARD first so the scrollIntoView marker keeps its position; CHROME_BRIDGE
  // rides along in the same insertion point.
  const inject = SCROLL_GUARD + CHROME_BRIDGE_WITH_USER_SCROLL;
  const head = html.match(/<head[^>]*>/i);
  if (head?.index != null) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + inject + html.slice(at);
  }
  const body = html.match(/<body[^>]*>/i);
  if (body?.index != null) {
    const at = body.index + body[0].length;
    return html.slice(0, at) + inject + html.slice(at);
  }
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) {
    return html.slice(0, doctype[0].length) + inject + html.slice(doctype[0].length);
  }
  return inject + html;
}
