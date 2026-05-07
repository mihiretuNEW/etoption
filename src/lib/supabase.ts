import { createClient } from '@supabase/supabase-js';

// Provided credentials as fallbacks to ensure the app works immediately
const DEFAULT_URL = 'https://qmunmdeciktrkzdtobzw.supabase.co';
const DEFAULT_KEY = 'sb_publishable_2WGD2BUsqwrsiSmO5M_lKA_uB7AxcTt';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || DEFAULT_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Authentication will not work until configured.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
