/**
 * Early-access countdown target.
 *
 * This is a FIXED moment on purpose — a "24h from render" value would reset on
 * every reload and cause hydration mismatches. Set it to the exact instant you
 * want early access to open (ISO 8601, UTC). Default: ~24h out from setup.
 *
 * To make it exactly 24h from your launch moment, just edit this one line.
 */
export const EARLY_ACCESS_DEADLINE_ISO = "2026-08-05T16:00:00.000Z";
