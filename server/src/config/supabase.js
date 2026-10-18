import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
export const authClient=env.SUPABASE_URL&&env.SUPABASE_ANON_KEY?createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null;
export const adminClient=env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY?createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null;
