// Centered confirmation for shares that fall back to "save the image / copy
// the text" (desktop, and iOS when the share sheet isn't available). These
// used to be corner toasts that people often missed -- leaving them unsure
// whether anything happened or what to do next. Mounted once in App.tsx;
// any page opens it with showShareConfirm().
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyText } from "@/lib/shareCard";

interface ShareConfirmState {
  imageSaved: boolean;
  textCopied: boolean;
  /** The message, so "Copy again" works even if the clipboard was overwritten. */
  text?: string;
}

let listener: ((s: ShareConfirmState) => void) | null = null;

/** Open the centered share confirmation. */
export function showShareConfirm(state: ShareConfirmState) {
  listener?.(state);
}

export function ShareConfirmDialog() {
  const [state, setState] = useState<ShareConfirmState | null>(null);
  const [recopied, setRecopied] = useState(false);

  useEffect(() => {
    listener = (s) => {
      setRecopied(false);
      setState(s);
    };
    return () => {
      listener = null;
    };
  }, []);

  const open = state !== null;
  const title = state?.imageSaved && state.textCopied
    ? "Image saved & message copied"
    : state?.imageSaved
    ? "Image saved"
    : "Message copied";

  const copyAgain = async () => {
    if (state?.text && (await copyText(state.text))) setRecopied(true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setState(null)}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center text-center">
          <div className="w-14 h-14 rounded-full bg-kente-green/15 flex items-center justify-center mb-2">
            {state?.imageSaved ? (
              <ImageDown className="w-7 h-7 text-kente-green" />
            ) : (
              <CheckCircle2 className="w-7 h-7 text-kente-green" />
            )}
          </div>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {state?.textCopied
              ? "Open WhatsApp, Instagram or any app and paste the message to challenge your friends."
              : "Open WhatsApp, Instagram or any app to share it with your friends."}
            {state?.imageSaved && " The image is in your Downloads — attach it for extra flex."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          {state?.text && (
            <Button variant="outline" onClick={copyAgain}>
              <Copy className="w-4 h-4 mr-2" />
              {recopied ? "Copied!" : state.textCopied ? "Copy message again" : "Copy message"}
            </Button>
          )}
          <Button variant="gold" onClick={() => setState(null)}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
