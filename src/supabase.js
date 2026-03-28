import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rixcntulaffsermowvvj.supabase.co'
const supabaseKey = 'sb_publishable_fNzxi-zcp_BaLxPUTapDnw_w3qv555K'

export const supabase = createClient(supabaseUrl, supabaseKey)