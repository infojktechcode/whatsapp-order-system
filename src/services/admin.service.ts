// Admin service — not implemented yet.
// Admin reads go through the Supabase client with RLS + admin_users checks;
// privileged writes belong in an Edge Function (service role never ships to src/).
export {}
