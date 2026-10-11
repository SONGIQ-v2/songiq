// Database-clock time for multiplayer round timing.
//
// Rounds carry started_at / ended_at from the database clock. Comparing
// those against the device clock (Date.now()) breaks for any phone whose
// clock is off: a clock running ahead showed the options before the round
// had started, so every answer reached the server "early" and scored the
// maximum. serverNow() is Date.now() corrected by the measured offset.

import { supabase } from "@/integrations/supabase/client";

let offsetMs = 0;

/** Current time on the database clock (ms since epoch), as best we know it. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/**
 * Measure the device-vs-database clock offset. Takes a few samples and keeps
 * the one with the shortest round trip (least network noise), assuming the
 * server read the clock halfway through. Leaves the previous estimate in
 * place if every sample fails.
 */
export async function syncServerClock(samples = 3): Promise<void> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < samples; i++) {
    const sentAt = Date.now();
    const { data, error } = await (supabase as any).rpc("server_time_ms");
    const receivedAt = Date.now();
    if (error || data == null || !Number.isFinite(Number(data))) continue;
    const rtt = receivedAt - sentAt;
    const offset = Number(data) - (sentAt + rtt / 2);
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  if (best) offsetMs = best.offset;
}
