import { Helmet } from "react-helmet-async";
import { Starfield } from "@/components/Starfield";
import { Header } from "@/components/Header";

const LAST_UPDATED = "August 5, 2026";
const CONTACT_EMAIL = "daniel@devcrib.io";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="font-display text-xl md:text-2xl mb-3 text-foreground">{title}</h2>
    <div className="text-muted-foreground text-sm md:text-base space-y-3 leading-relaxed">{children}</div>
  </section>
);

const Privacy = () => (
  <div className="min-h-screen relative overflow-hidden">
    <Helmet>
      <title>Privacy Policy | SongIQ Music Quiz</title>
      <meta
        name="description"
        content="How SongIQ collects, uses, and protects your data — including our limited use of Google API services."
      />
      <link rel="canonical" href="https://songiq.io/privacy" />
      <meta property="og:title" content="Privacy Policy | SongIQ" />
      <meta property="og:description" content="How SongIQ collects, uses, and protects your data." />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
    </Helmet>

    <Starfield />
    <Header />

    <main className="relative z-10 pt-24 pb-16 px-4">
      <div className="max-w-[820px] mx-auto">
        <h1 className="font-display text-4xl md:text-5xl mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="raised-panel p-6 md:p-8">
          <Section title="Overview">
            <p>
              SongIQ ("we", "us") is a music trivia game available at songiq.io. This policy explains what
              information we collect, why we collect it, and the choices you have. By using SongIQ you agree
              to the practices described here.
            </p>
          </Section>

          <Section title="Information We Collect">
            <p>
              <strong className="text-foreground">Gameplay data.</strong> Nickname, game mode, room codes,
              scores, answers, streaks and timestamps so we can run games, leaderboards and daily challenges.
            </p>
            <p>
              <strong className="text-foreground">Account data.</strong> If you sign in, we store your account
              identifier and email address provided by your chosen sign-in method. Anonymous players are given
              a random identifier stored on your device instead.
            </p>
            <p>
              <strong className="text-foreground">Technical data.</strong> Browser type, device information,
              approximate location derived from IP address, and error logs used to diagnose problems.
            </p>
            <p>
              <strong className="text-foreground">Feedback.</strong> Anything you voluntarily submit through
              the feedback form, together with the IP address and approximate country of the submission so we
              can prevent abuse.
            </p>
          </Section>

          <Section title="How We Use Information">
            <ul className="list-disc pl-5 space-y-1">
              <li>Operate gameplay, multiplayer rooms and leaderboards</li>
              <li>Keep the service secure and prevent cheating or abuse</li>
              <li>Diagnose bugs and improve performance</li>
              <li>Understand aggregate usage trends</li>
              <li>Respond to your feedback or support requests</li>
            </ul>
            <p>We do not sell your personal information, and we do not use it for advertising profiling.</p>
          </Section>

          <Section title="Google API Services and Limited Use">
            <p>
              SongIQ's use and transfer of information received from Google APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p>
              Where you connect a Google account (for example, to sign in or to authorize access to Google
              Search Console or Google Analytics data for your own site), we request the minimum scopes needed
              for the feature you asked for. Data obtained through those scopes is used only to provide that
              feature to you. It is never sold, never transferred to third parties except as required to
              provide the feature or to comply with law, and never used for advertising. Human access to this
              data occurs only with your explicit consent, for security purposes, or where required by law.
            </p>
            <p>
              You can revoke SongIQ's access to your Google account at any time at{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                myaccount.google.com/permissions
              </a>
              .
            </p>
          </Section>

          <Section title="Third-Party Services">
            <p>
              We rely on a small number of providers to run SongIQ: our backend and authentication platform
              (database, auth, storage and serverless functions), Apple Music and Spotify for song previews and
              metadata, Google Analytics for aggregate usage measurement, and an email delivery provider for
              transactional notifications. Each processes data only as needed to provide their service.
            </p>
          </Section>

          <Section title="Cookies and Local Storage">
            <p>
              We use cookies and browser local storage to remember your nickname, keep you signed in, and
              measure aggregate usage through Google Analytics. You can clear or block these through your
              browser settings, though some game features may stop working.
            </p>
          </Section>

          <Section title="Data Retention">
            <p>
              Game rooms and their activity logs are automatically cleaned up shortly after games end, and
              diagnostic logs are retained for roughly 14 days. Account and leaderboard records are kept while
              your account is active. Feedback submissions are kept until they are resolved and no longer
              needed.
            </p>
          </Section>

          <Section title="Your Rights">
            <p>
              Depending on where you live, you may have the right to access, correct, export or delete your
              personal data, and to object to or restrict certain processing. Contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4">
                {CONTACT_EMAIL}
              </a>{" "}
              and we will respond within a reasonable timeframe.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              SongIQ is not directed at children under 13, and we do not knowingly collect personal information
              from them. If you believe a child has provided us information, contact us and we will delete it.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Data is stored with row-level access controls and transmitted over encrypted connections. No
              online service can guarantee absolute security, but we work to protect your information against
              unauthorized access.
            </p>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this policy from time to time. Material changes will be reflected by updating the
              "Last updated" date above.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy? Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  </div>
);

export default Privacy;
