import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { SEO_PAGES, resolvePageSeo } from "./src/lib/seoPages";

const escapeAttr = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The app is a single-page app, so every URL used to get the same
 * index.html -- crawlers and link previews that don't run JavaScript saw the
 * homepage's title and description on every page. After the build, this
 * writes one HTML file per indexable page (dist/daily.html, ...; "/" rewrites
 * dist/index.html itself) with that page's tags from src/lib/seoPages.ts.
 * The host serves /daily from daily.html; any other URL still falls back to
 * index.html as before, and the app boots the same from either file.
 */
function seoPagesPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "songiq-seo-pages",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const template = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      for (const route of Object.keys(SEO_PAGES)) {
        const seo = resolvePageSeo(route);
        const swaps: [RegExp, string][] = [
          [/<title>[^<]*<\/title>/, `<title>${escapeAttr(seo.title)}</title>`],
          [/<meta data-rh="true" name="description" content="[^"]*"/, `<meta data-rh="true" name="description" content="${escapeAttr(seo.description)}"`],
          [/<meta data-rh="true" property="og:title" content="[^"]*"/, `<meta data-rh="true" property="og:title" content="${escapeAttr(seo.ogTitle)}"`],
          [/<meta data-rh="true" property="og:description" content="[^"]*"/, `<meta data-rh="true" property="og:description" content="${escapeAttr(seo.ogDescription)}"`],
          [/<meta data-rh="true" property="og:url" content="[^"]*"/, `<meta data-rh="true" property="og:url" content="${seo.canonical}"`],
          [/<meta data-rh="true" name="twitter:title" content="[^"]*"/, `<meta data-rh="true" name="twitter:title" content="${escapeAttr(seo.ogTitle)}"`],
          [/<meta data-rh="true" name="twitter:description" content="[^"]*"/, `<meta data-rh="true" name="twitter:description" content="${escapeAttr(seo.ogDescription)}"`],
        ];
        let html = template;
        for (const [pattern, replacement] of swaps) {
          // Fail the build rather than ship a page with the homepage's tags.
          if ((html.match(new RegExp(pattern, "g")) ?? []).length !== 1) {
            throw new Error(`[songiq-seo-pages] index.html tag not found exactly once: ${pattern}`);
          }
          html = html.replace(pattern, () => replacement);
        }
        // index.html doubles as the fallback for every other URL (rooms,
        // challenge links, ...), so only the per-page files carry a canonical;
        // the homepage gets its own from <PageSeo> once the app loads.
        if (route !== "/") {
          html = html.replace(/<\/title>/, () => `</title>\n    <link data-rh="true" rel="canonical" href="${seo.canonical}" />`);
        }
        const file = route === "/" ? "index.html" : `${route.slice(1)}.html`;
        fs.mkdirSync(path.dirname(path.join(outDir, file)), { recursive: true });
        fs.writeFileSync(path.join(outDir, file), html);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger(), seoPagesPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
