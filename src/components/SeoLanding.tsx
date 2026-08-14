import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Music, Users, Headphones, Zap, Trophy, Play } from "lucide-react";

export interface SeoLandingFAQ {
  q: string;
  a: string;
}

export interface SeoLandingProps {
  /** Path WITHOUT leading slash domain (e.g. "/guess-the-song-game") */
  path: string;
  metaTitle: string;
  metaDescription: string;
  /** Visible H1 — may include keyword */
  h1: string;
  /** Subheadline below H1 */
  intro: string;
  /** 3 short feature bullets */
  features: { title: string; description: string; icon: "music" | "users" | "headphones" | "zap" | "trophy" }[];
  /** Long-form SEO body — array of paragraphs */
  body: { heading: string; paragraph: string }[];
  faq: SeoLandingFAQ[];
  /** Where the primary CTA goes — default /solo */
  primaryCta?: { label: string; to: string };
  secondaryCta?: { label: string; to: string };
}

const iconMap = { music: Music, users: Users, headphones: Headphones, zap: Zap, trophy: Trophy };

export const SeoLanding = ({
  path,
  metaTitle,
  metaDescription,
  h1,
  intro,
  features,
  body,
  faq,
  primaryCta = { label: "Play Solo Now", to: "/solo" },
  secondaryCta = { label: "Play Multiplayer", to: "/multiplayer" },
}: SeoLandingProps) => {
  const navigate = useNavigate();
  const url = `https://songiq.io${path}`;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>

      <Starfield />
      <Header />

      <main className="relative z-10 pt-24 pb-16 px-4">
        <article className="max-w-4xl mx-auto">
          {/* Hero */}
          <motion.header
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="font-display text-4xl md:text-6xl uppercase tracking-wide mb-5">
              {h1}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">{intro}</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button size="lg" onClick={() => navigate(primaryCta.to)} className="gap-2">
                <Play className="w-5 h-5" />
                {primaryCta.label}
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate(secondaryCta.to)} className="gap-2">
                <Users className="w-5 h-5" />
                {secondaryCta.label}
              </Button>
            </div>
          </motion.header>

          {/* Features */}
          <motion.section
            aria-labelledby="features-heading"
            className="grid md:grid-cols-3 gap-4 mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <h2 id="features-heading" className="sr-only">Features</h2>
            {features.map((f) => {
              const Icon = iconMap[f.icon];
              return (
                <div
                  key={f.title}
                  className="game-card text-center p-6"
                >
                  <Icon className="w-8 h-8 text-primary mx-auto mb-3" />
                  <h3 className="font-bold mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </div>
              );
            })}
          </motion.section>

          {/* Body content */}
          <section className="prose prose-invert max-w-none mb-16 space-y-8">
            {body.map((b) => (
              <div key={b.heading}>
                <h2 className="font-display text-4xl uppercase tracking-wide mb-3 text-foreground">
                  {b.heading}
                </h2>
                <p className="text-muted-foreground leading-relaxed">{b.paragraph}</p>
              </div>
            ))}
          </section>

          {/* FAQ */}
          <section className="mb-16">
            <h2 className="font-display text-4xl uppercase tracking-wide mb-6 text-center">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {faq.map((item) => (
                <details
                  key={item.q}
                  className="game-card p-5 group cursor-pointer"
                >
                  <summary className="font-semibold list-none flex justify-between items-center">
                    {item.q}
                    <span className="text-primary group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="text-muted-foreground mt-3 leading-relaxed">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Final CTA */}
          <section className="game-card text-center p-8">
            <h2 className="font-display text-4xl uppercase tracking-wide mb-3">
              Ready to play?
            </h2>
            <p className="text-muted-foreground mb-6">Free, no signup required. Jump in and start guessing.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button size="lg" onClick={() => navigate(primaryCta.to)} className="gap-2">
                <Play className="w-5 h-5" />
                {primaryCta.label}
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate(secondaryCta.to)} className="gap-2">
                <Users className="w-5 h-5" />
                {secondaryCta.label}
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground underline underline-offset-4">
                ← Back to SongIQ home
              </Link>
            </p>
          </section>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
};
