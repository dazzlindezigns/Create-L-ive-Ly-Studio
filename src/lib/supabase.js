import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Vite bakes VITE_* vars in at build time. If they were missing when Vercel built the site,
// createClient() would throw and blank the whole app — so App.jsx shows a setup screen instead.
export const missingEnv = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean)

export const supabase = missingEnv.length ? null : createClient(supabaseUrl, supabaseAnonKey)
