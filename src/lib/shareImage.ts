// Renders a branded share-card PNG on a canvas and hands it to the native
// share sheet (mobile) or downloads it (desktop). Falls back to the text-only
// share in shareCard.ts if anything here fails.

import songiqLogo from "@/assets/songiq-logo.png";
import type { ShareCardOptions } from "@/lib/shareCard";

// Theme tokens (mirrors src/index.css)
const COLORS = {
  bgTop: "hsl(230 35% 13%)",
  bgBottom: "hsl(230 35% 7%)",
  foreground: "hsl(45 100% 96%)",
  muted: "hsl(45 30% 70%)",
  gold: "hsl(45 100% 60%)",
  green: "hsl(150 60% 40%)",
  red: "hsl(0 70% 50%)",
  border: "hsl(45 100% 60% / 0.35)",
};

const W = 1080;
const H = 1350; // 4:5 portrait — ideal for Instagram/WhatsApp

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function ensureFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('80px "Archivo Black"'),
        document.fonts.load('40px "Space Grotesk"'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    // canvas falls back to sans-serif
  }
}

const display = (px: number) => `${px}px "Archivo Black", sans-serif`;
const body = (px: number, weight = 400) => `${weight} ${px}px "Space Grotesk", sans-serif`;

export async function renderShareCard(opts: ShareCardOptions): Promise<Blob | null> {
  const { categoryName, score, results, rank, playerCount } = opts;

  await ensureFonts();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Starfield
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 2 + 0.5;
    ctx.fillStyle = `hsl(45 100% 90% / ${0.05 + Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Gold frame
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 4;
  roundRect(ctx, 40, 40, W - 80, H - 80, 48);
  ctx.stroke();

  ctx.textAlign = "center";

  // Logo (fall back to wordmark text)
  const logo = await loadImage(songiqLogo);
  if (logo) {
    const logoH = 130;
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, (W - logoW) / 2, 110, logoW, logoH);
  } else {
    ctx.fillStyle = COLORS.gold;
    ctx.font = display(90);
    ctx.fillText("SongIQ", W / 2, 210);
  }

  // Category
  ctx.fillStyle = COLORS.foreground;
  ctx.font = display(52);
  ctx.fillText(categoryName, W / 2, 370);

  // Score
  ctx.fillStyle = COLORS.gold;
  ctx.font = display(170);
  ctx.shadowColor = "hsl(45 100% 60% / 0.45)";
  ctx.shadowBlur = 40;
  ctx.fillText(String(score), W / 2, 600);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COLORS.muted;
  ctx.font = body(40, 600);
  ctx.fillText("POINTS", W / 2, 665);

  // Correct count
  const correct = results.filter(Boolean).length;
  ctx.fillStyle = COLORS.foreground;
  ctx.font = body(46, 700);
  ctx.fillText(`${correct}/${results.length} correct`, W / 2, 780);

  // Result grid — rounded squares, up to 10 per row
  if (results.length > 0) {
    const perRow = Math.min(results.length, 10);
    const rows = Math.ceil(results.length / perRow);
    const size = 72;
    const gap = 18;
    const gridW = perRow * size + (perRow - 1) * gap;
    const startX = (W - gridW) / 2;
    const startY = 830;

    results.forEach((r, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = startX + col * (size + gap);
      const y = startY + row * (size + gap);
      ctx.fillStyle = r ? COLORS.green : COLORS.red;
      roundRect(ctx, x, y, size, size, 16);
      ctx.fill();
    });

    // Rank (multiplayer)
    const gridBottom = startY + rows * (size + gap);
    if (rank && playerCount && playerCount > 1) {
      const medal = rank === 1 ? "🏆" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🎧";
      ctx.fillStyle = COLORS.gold;
      ctx.font = body(52, 700);
      ctx.fillText(`${medal} #${rank} of ${playerCount} players`, W / 2, gridBottom + 80);
    }
  }

  // Footer
  ctx.fillStyle = COLORS.gold;
  ctx.font = display(46);
  ctx.fillText("songiq.xyz", W / 2, H - 150);

  ctx.fillStyle = COLORS.muted;
  ctx.font = body(32);
  ctx.fillText("Guess the Song — Test Your Music IQ.", W / 2, H - 95);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export type ImageShareOutcome = "shared" | "downloaded" | "canceled" | "failed";

/**
 * Share the rendered card image via the native share sheet; on desktop (no
 * file sharing) download the PNG and copy the text so it can be pasted.
 */
export async function shareResultImage(opts: ShareCardOptions, text: string): Promise<ImageShareOutcome> {
  let blob: Blob | null = null;
  try {
    blob = await renderShareCard(opts);
  } catch {
    blob = null;
  }
  if (!blob) return "failed";

  const file = new File([blob], "songiq-result.png", { type: "image/png" });

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "canceled";
      // fall through to download
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "songiq-result.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // text copy is best-effort alongside the download
    }
    return "downloaded";
  } catch {
    return "failed";
  }
}
