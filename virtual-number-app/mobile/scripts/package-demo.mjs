// Turns `expo export --platform web` output (dist-demo/) into a page that
// works from any URL path, e.g. a hosted preview link:
// - absolute "/_expo/…" and "/assets/…" references become relative, with
//   "_expo/" renamed to "bundle/" (hosts may reserve "_"-prefixed paths), and
// - page.html pins the document base to its own folder, then resets the path
//   to "/" so the router starts at the home screen, before loading bundles.
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const dist = new URL("../dist-demo/", import.meta.url).pathname;

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

for (const file of files(dist).filter((f) => f.endsWith(".js"))) {
  const source = readFileSync(file, "utf8");
  const patched = source.replaceAll('"/_expo/static/', '"./bundle/static/').replaceAll('"/assets/', '"./assets/');
  if (patched !== source) writeFileSync(file, patched);
}

if (existsSync(join(dist, "_expo"))) renameSync(join(dist, "_expo"), join(dist, "bundle"));

const index = readFileSync(join(dist, "index.html"), "utf8");
const scripts = [...index.matchAll(/<script src="\/_expo\/([^"]+)"/g)].map((m) => `bundle/${m[1]}`);
if (scripts.length === 0) throw new Error("no bundles found in index.html");

writeFileSync(
  join(dist, "page.html"),
  `<title>SecondLine Demo</title>
<meta name="theme-color" content="#4F46E5">
<style>
  :root { --frame: #E8EAF6; --app: #F9FAFB; --strip: #312E81; --strip-text: #E0E7FF; color-scheme: light; }
  html, body { height: 100%; }
  body { background: var(--frame); overflow: hidden; }
  #shell { display: flex; flex-direction: column; height: 100%; max-width: 440px; margin: 0 auto; background: var(--app); }
  #demo-strip { flex: none; padding: 6px 16px; background: var(--strip); color: var(--strip-text); font: 600 12px/1.3 system-ui, -apple-system, sans-serif; text-align: center; }
  #root { display: flex; flex: 1; min-height: 0; }
  @media (min-width: 600px) { #shell { box-shadow: 0 0 0 1px rgba(17, 24, 39, .08), 0 20px 60px rgba(17, 24, 39, .15); } }
</style>
<noscript>SecondLine needs JavaScript.</noscript>
<div id="shell">
  <div id="demo-strip">Demo: numbers, texts, calls and payments are simulated</div>
  <div id="root"></div>
</div>
<script>
  (function () {
    var base = document.createElement("base");
    base.href = new URL(".", location.href).href;
    document.head.prepend(base);
    try { history.replaceState(null, "", "/"); } catch (e) { /* router shows not-found */ }
    ${JSON.stringify(scripts)}.forEach(function (src) {
      var s = document.createElement("script");
      s.src = base.href + src;
      s.async = false;
      document.body.append(s);
    });
  })();
</script>
`,
);

const published = files(dist)
  .map((f) => relative(dist, f))
  .filter((f) => f !== "index.html" && f !== "page.html" && f !== "metadata.json");
writeFileSync(join(dist, "files.json"), JSON.stringify(published, null, 2));
console.log(`demo packaged: page.html + ${published.length} files`);
