import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';
export const supabase=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export const isConfigured=Boolean(import.meta.env.VITE_SUPABASE_URL&&(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY));
