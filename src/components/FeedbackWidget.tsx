import { useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  message: z.string().trim().min(1, "Message required").max(2000),
});

export const FeedbackWidget = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Hide during gameplay
  const path = location.pathname;
  const isGameplay = path === "/solo/game" || /^\/room\/[^/]+\/game$/.test(path);
  if (isGameplay) return null;

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ name, email, message });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const submittedAt = new Date().toISOString();
    const feedbackNotificationId = crypto.randomUUID();
    const { error } = await supabase.from("user_feedback").insert([{
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message,
      user_id: user?.id ?? undefined,
    }]);
    if (error) {
      setSubmitting(false);
      toast({ title: "Couldn't send feedback", description: error.message, variant: "destructive" });
      return;
    }
    // Fire-and-forget email notification (captures IP + country server-side)
    supabase.functions.invoke("feedback-notify", {
      body: {
        feedbackId: feedbackNotificationId,
        name: parsed.data.name,
        email: parsed.data.email,
        message: parsed.data.message,
        submittedAt,
      },
    }).catch(() => { /* non-blocking */ });
    setSubmitting(false);
    toast({ title: "Thanks for your feedback!" });
    setName(""); setEmail(""); setMessage("");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all px-4 py-2.5 text-sm font-semibold"
      >
        <MessageSquare className="w-4 h-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share your feedback</DialogTitle>
            <DialogDescription>
              Help us improve SongIQ — we read every message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              placeholder="Your name"
              aria-label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
            <Input
              type="email"
              placeholder="Email"
              aria-label="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
            <Textarea
              placeholder="What's on your mind?"
              aria-label="Your message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
