import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MailX, CheckCircle2 } from "lucide-react";
import { Starfield } from "@/components/Starfield";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Footer link target in daily reminder emails. Unsubscribing takes a click
 * rather than happening on page load: email security scanners open every
 * link in a message, which would otherwise opt people out on their own.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const u = params.get("u");
  const t = params.get("t");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");

  const handleUnsubscribe = async () => {
    setStatus("working");
    const { error } = await supabase.functions.invoke("email-unsubscribe", { body: { u, t } });
    setStatus(error ? "error" : "done");
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      <Helmet>
        <title>Unsubscribe | SongIQ</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Starfield />
      <div className="raised-panel relative z-10 max-w-md w-full p-8 text-center">
        {!u || !t ? (
          <>
            <p className="text-xl font-bold text-foreground mb-2">This link isn't valid</p>
            <p className="text-muted-foreground mb-6">Use the unsubscribe link from one of our emails.</p>
            <Button variant="gold" onClick={() => navigate("/")}>Go to SongIQ</Button>
          </>
        ) : status === "done" ? (
          <>
            <CheckCircle2 className="w-10 h-10 text-kente-green mx-auto mb-4" />
            <p className="text-xl font-bold text-foreground mb-2">You're unsubscribed</p>
            <p className="text-muted-foreground mb-6">You won't get daily reminder emails anymore.</p>
            <Button variant="gold" onClick={() => navigate("/daily")}>Play today's Daily</Button>
          </>
        ) : (
          <>
            <MailX className="w-10 h-10 text-primary mx-auto mb-4" />
            <p className="text-xl font-bold text-foreground mb-2">Stop daily reminder emails?</p>
            <p className="text-muted-foreground mb-6">
              We'll stop emailing you about the Daily Challenge. Your account and streak aren't affected.
            </p>
            {status === "error" && (
              <p className="text-destructive text-sm mb-4">
                That didn't work — the link may be invalid. Please try again.
              </p>
            )}
            <Button variant="gold" className="w-full" onClick={handleUnsubscribe} disabled={status === "working"}>
              {status === "working" ? "Unsubscribing…" : "Unsubscribe"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
