/**
 * Standalone post-card renderer, served as raw HTML so it bypasses the site
 * layout (no nav, no footer) and can be screenshotted headlessly at exactly
 * 1200x675:
 *
 *   npx playwright screenshot --viewport-size=1200,675 --device-scale-factor=2 \
 *     "http://localhost:3000/card?headline=We+show+our+work" card.png
 *
 * Every field is a query param: tag, headline, subtext, footer.
 */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const tag = q.get("tag") ?? "How it works";
  const headline = q.get("headline") ?? "We show our work";
  const subtext =
    q.get("subtext") ??
    "Every depth score breaks into seven on-chain signals. If we can't read one yet, we mark it not scored and leave it out — no filler, no guessing.";
  const footer = q.get("footer") ?? "poolscan.xyz · @poolscan_";

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600&family=Fragment+Mono&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:675px;overflow:hidden;font-family:"Plus Jakarta Sans",sans-serif}
  .card{position:relative;width:1200px;height:675px;overflow:hidden;
        background:linear-gradient(135deg,#ffffff 0%,#e9f7f1 100%)}
  .blob1{position:absolute;top:-160px;right:-120px;width:520px;height:520px;border-radius:50%;
         background:radial-gradient(circle,#a3ddc5,transparent 62%);opacity:.7}
  .blob2{position:absolute;bottom:-200px;left:120px;width:480px;height:480px;border-radius:50%;
         background:radial-gradient(circle,#c9ecdb,transparent 60%);opacity:.6}
  .mark{position:absolute;right:-110px;bottom:-110px;width:620px;height:620px;opacity:.14}
  .brand{position:absolute;top:56px;left:64px;display:flex;align-items:center;gap:14px}
  .brand span{font-family:"Fraunces",Georgia,serif;font-size:36px;color:#12211d}
  .body{position:absolute;left:64px;top:214px;right:300px}
  .tag{font-family:"Fragment Mono",monospace;text-transform:uppercase;letter-spacing:.22em;
       font-size:16px;color:#2f7d5b}
  h2{font-family:"Fraunces",Georgia,serif;font-weight:400;font-size:76px;line-height:1.04;
     letter-spacing:-.02em;color:#12211d;margin-top:18px}
  .sub{font-size:26px;line-height:1.45;color:#56655f;margin-top:22px}
  .foot{position:absolute;left:64px;bottom:50px;font-size:19px;color:#93a49c}
</style></head>
<body><div class="card">
  <div class="blob1"></div><div class="blob2"></div>
  <img class="mark" src="/logo.png" alt="">
  <div class="brand"><img src="/logo.png" width="46" height="46" alt=""><span>poolscan</span></div>
  <div class="body">
    <p class="tag">${esc(tag)}</p>
    <h2>${esc(headline)}</h2>
    <p class="sub">${esc(subtext)}</p>
  </div>
  <div class="foot">${esc(footer)}</div>
</div></body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
