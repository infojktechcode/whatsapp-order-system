// M-Pesa STK push — intentionally empty in the frontend bundle.
// Daraja credentials (CONSUMER_KEY/SECRET, PASSKEY) are Edge Function secrets.
// The STK request must be initiated by supabase/functions/mpesa-stk, which
// recalculates the amount server-side (AGENTS.md: never trust frontend amounts).
export {}
