
import { createClient } from '@supabase/supabase-js';

// Substitua pelas suas chaves do painel do Supabase
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'SUA_SUPABASE_URL_AQUI';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'SUA_SUPABASE_ANON_KEY_AQUI';

export const supabase = createClient(supabaseUrl, supabaseKey);
