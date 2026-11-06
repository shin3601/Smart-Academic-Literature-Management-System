import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ================================
// SUPABASE CONNECTION
// ================================

const supabaseUrl = "https://jhewuhiiaifsnshosbmr.supabase.co";
const supabaseKey = "sb_publishable_AocXOzQKUdAtA8XmxBJnKg_DmzSFFBh";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
