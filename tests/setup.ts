// Global test setup. Runs before each test file.
// Tests mock src/lib/supabase.js, so no real network calls are made.
process.env.VITE_SUPABASE_URL ??= 'http://localhost:54321'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key'
