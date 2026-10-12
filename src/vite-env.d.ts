/// <reference types="vite/client" />

// Typed contract for the environment variables this app is allowed to read.
// Anything with a VITE_ prefix ends up in the public browser bundle — only
// publishable keys belong here (AGENTS.md: never expose secrets to the frontend).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
