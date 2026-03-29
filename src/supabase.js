import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rixcntulaffsermowvvj.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpeGNudHVsYWZmc2VybW93dnZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTU2MTcsImV4cCI6MjA5MDI3MTYxN30.PYuwzVLeTEo1F_Xt57KkrttyScqIFJVHo9BXlY6NMTc'

export const supabase = createClient(supabaseUrl, supabaseKey)