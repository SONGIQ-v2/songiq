import { Helmet } from "react-helmet-async";
import { resolvePageSeo, type SeoPath } from "@/lib/seoPages";

/**
 * Title, description, canonical and link-preview tags for an indexable page,
 * from src/lib/seoPages.ts. The build writes the same tags into that page's
 * own HTML file, so what crawlers see and what the browser shows never drift.
 */
export const PageSeo = ({ path }: { path: SeoPath }) => {
  const seo = resolvePageSeo(path);
  return (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <link rel="canonical" href={seo.canonical} />
      <meta property="og:title" content={seo.ogTitle} />
      <meta property="og:description" content={seo.ogDescription} />
      <meta property="og:url" content={seo.canonical} />
      <meta name="twitter:title" content={seo.ogTitle} />
      <meta name="twitter:description" content={seo.ogDescription} />
    </Helmet>
  );
};
