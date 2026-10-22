# Roadmap

- [x] Fix edge-function build/type errors (admin-analytics, _shared/itunes.ts, apple-music web-push dep, feedback-notify cors import, process-email-queue, send-transactional-email) — all pass `deno check`; builds OK
- [x] admin-analytics: stop Google Analytics 429 quota crashes — GA4 reports queued 2-at-a-time with backoff retries, last-resort catch returns empty event data instead of a 500; queue verified by 6 isolated tests, function redeployed and returning 200 with live data
