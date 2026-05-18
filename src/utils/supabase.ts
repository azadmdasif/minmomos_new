
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojogjmzgboiufktapskp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qb2dqbXpnYm9pdWZrdGFwc2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NzIyMTMsImV4cCI6MjA4NjA0ODIxM30.4rKQSCEHTZTD0JHh2EAp1oTv3EaQME9EItVSzzjm8wM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
