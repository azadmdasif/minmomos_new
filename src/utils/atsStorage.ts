import { supabase } from './supabase';
import { AtsCandidate, AtsJob, AtsStage, AtsInterviewNote } from '../types/ats';

const ATS_CANDIDATES_CACHE_KEY = 'momomaya_ats_candidates_cache';
const ATS_JOBS_CACHE_KEY = 'momomaya_ats_jobs_cache';

// Default initial jobs for Momomaya
export const INITIAL_ATS_JOBS: AtsJob[] = [
  {
    id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    title: 'Head Momo Chef',
    department: 'Kitchen',
    branch_name: 'All Stations',
    employment_type: 'Full-time',
    salary_range: '₹28,000 - ₹38,000 / month',
    description: 'Lead recipe execution, dough kneading, signature spice blends, and kitchen quality standards.',
    requirements: ['3+ years QSR or dumpling experience', 'Knowledge of HACCP & kitchen hygiene', 'Team leadership'],
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'b2c3d4e5-f6a7-4b6c-9d0e-1f2a3b4c5d6e',
    title: 'Line Cook / Steamer Operator',
    department: 'Kitchen',
    branch_name: 'BNR',
    employment_type: 'Full-time',
    salary_range: '₹18,000 - ₹24,000 / month',
    description: 'Operate high-pressure momo steamers, prep fillings, manage portioning and speedy dispatch.',
    requirements: ['1+ years culinary experience', 'Speed under high order volume', 'Punctuality'],
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString()
  },
  {
    id: 'c3d4e5f6-a7b8-4c7d-0e1f-2a3b4c5d6e7f',
    title: 'Counter Cashier & Front of House',
    department: 'Front of House',
    branch_name: 'BNR',
    employment_type: 'Shift-based',
    salary_range: '₹16,000 - ₹22,000 / month',
    description: 'Welcoming guests, operating Momomaya POS billing, handling cash/UPI, and upselling momo platters.',
    requirements: ['Energetic customer-first attitude', 'Fast numerical & billing speed', 'Clear communication'],
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString()
  },
  {
    id: 'd4e5f6a7-b8c9-4d8e-1f2a-3b4c5d6e7f8a',
    title: 'Restaurant Store Manager',
    department: 'Management',
    branch_name: 'BNR',
    employment_type: 'Full-time',
    salary_range: '₹35,000 - ₹50,000 / month',
    description: 'Oversee end-to-end station profitability, staff rosters, inventory tracking, and customer satisfaction.',
    requirements: ['Prior QSR or cafe managerial experience', 'P&L awareness', 'Shift roster planning'],
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString()
  },
  {
    id: 'e5f6a7b8-c9d0-4e9f-2a3b-4c5d6e7f8a9b',
    title: 'Food Delivery Coordinator',
    department: 'Operations',
    branch_name: 'BNR',
    employment_type: 'Full-time',
    salary_range: '₹18,000 - ₹25,000 / month',
    description: 'Coordinate Swiggy/Zomato dispatch, packaging quality check, rider handoffs, and delivery SLA compliance.',
    requirements: ['Smartphone proficient', 'Fast-paced coordination', 'Attention to packaging'],
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString()
  }
];

// Initial candidates list (zero dummy candidates - clean production state)
export const INITIAL_ATS_CANDIDATES: AtsCandidate[] = [];

// Helper: Local Storage Fallback
function getCached<T>(key: string, defaultVal: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setCached(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (err) {
    console.error('Storage cache error:', err);
  }
}

// -------------------------------------------------------------------------
// Jobs API
// -------------------------------------------------------------------------
export async function getAtsJobs(): Promise<{ jobs: AtsJob[]; fromSupabase: boolean }> {
  try {
    const { data, error } = await supabase
      .from('ats_jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      const cached = getCached<AtsJob[]>(ATS_JOBS_CACHE_KEY, INITIAL_ATS_JOBS);
      return { jobs: cached, fromSupabase: false };
    }

    const formatted: AtsJob[] = data.map((d: any) => ({
      id: d.id,
      title: d.title,
      department: d.department || 'Operations',
      branch_name: d.branch_name || 'All Stations',
      employment_type: d.employment_type || 'Full-time',
      salary_range: d.salary_range || 'Competitive',
      description: d.description || '',
      requirements: Array.isArray(d.requirements) ? d.requirements : (typeof d.requirements === 'string' ? JSON.parse(d.requirements || '[]') : []),
      status: d.status || 'ACTIVE',
      created_at: d.created_at || new Date().toISOString(),
      updated_at: d.updated_at
    }));

    setCached(ATS_JOBS_CACHE_KEY, formatted);
    return { jobs: formatted, fromSupabase: true };
  } catch (err) {
    console.warn('Supabase getAtsJobs failed, using local cache:', err);
    return { jobs: getCached<AtsJob[]>(ATS_JOBS_CACHE_KEY, INITIAL_ATS_JOBS), fromSupabase: false };
  }
}

export async function createAtsJob(job: Omit<AtsJob, 'id' | 'created_at'>): Promise<AtsJob> {
  const newJob: AtsJob = {
    ...job,
    id: crypto.randomUUID ? crypto.randomUUID() : `job-${Date.now()}`,
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('ats_jobs')
      .insert({
        id: newJob.id,
        title: newJob.title,
        department: newJob.department,
        branch_name: newJob.branch_name,
        employment_type: newJob.employment_type,
        salary_range: newJob.salary_range,
        description: newJob.description,
        requirements: newJob.requirements,
        status: newJob.status
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      newJob.id = data.id;
    }
  } catch (err) {
    console.warn('Supabase createAtsJob error:', err);
  }

  // Update cache
  const cached = getCached<AtsJob[]>(ATS_JOBS_CACHE_KEY, INITIAL_ATS_JOBS);
  setCached(ATS_JOBS_CACHE_KEY, [newJob, ...cached]);
  return newJob;
}

export async function updateAtsJob(id: string, updates: Partial<AtsJob>): Promise<void> {
  try {
    await supabase
      .from('ats_jobs')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
  } catch (err) {
    console.warn('Supabase updateAtsJob error:', err);
  }

  const cached = getCached<AtsJob[]>(ATS_JOBS_CACHE_KEY, INITIAL_ATS_JOBS);
  const updated = cached.map(j => j.id === id ? { ...j, ...updates } : j);
  setCached(ATS_JOBS_CACHE_KEY, updated);
}

// -------------------------------------------------------------------------
// Candidates API (Resumes NEVER stored as files, only structured data)
// -------------------------------------------------------------------------
// Helper to identify mock/dummy candidates from previous demos
export const isDummyCandidate = (c: any): boolean => {
  if (!c) return false;
  const name = String(c.full_name || '').toLowerCase().trim();
  const id = String(c.id || '');
  return id.startsWith('cand-00') ||
    name === 'tenzing norbu' ||
    name === 'tsering dorjee' ||
    name === 'priya sharma' ||
    name === 'ananya deshmukh' ||
    name === 'rohan gurung' ||
    name === 'vikramaditya rao';
};

export async function clearAllDummyCandidates(): Promise<void> {
  const cached = getCached<AtsCandidate[]>(ATS_CANDIDATES_CACHE_KEY, []);
  const cleaned = cached.filter(c => !isDummyCandidate(c));
  setCached(ATS_CANDIDATES_CACHE_KEY, cleaned);
  try {
    await supabase
      .from('ats_candidates')
      .delete()
      .or('id.like.cand-00%,full_name.in.("Tenzing Norbu","Tsering Dorjee","Priya Sharma","Ananya Deshmukh","Rohan Gurung","Vikramaditya Rao")');
  } catch (err) {
    console.warn('Purge dummy candidates from Supabase notice:', err);
  }
}

export async function getAtsCandidates(): Promise<{ candidates: AtsCandidate[]; fromSupabase: boolean }> {
  try {
    const { data, error } = await supabase
      .from('ats_candidates')
      .select('*')
      .order('applied_date', { ascending: false });

    if (data && data.length > 0) {
      // Purge any dummy records from Supabase in background
      const dummyIds = data.filter(isDummyCandidate).map((d: any) => d.id);
      if (dummyIds.length > 0) {
        supabase.from('ats_candidates').delete().in('id', dummyIds).then(() => {});
      }

      const realRows = data.filter((d: any) => !isDummyCandidate(d));

      const formatted: AtsCandidate[] = realRows.map((d: any) => ({
        id: d.id,
        job_id: d.job_id,
        job_title: d.job_title || 'General Staff',
        full_name: d.full_name,
        email: d.email,
        phone: d.phone,
        location: d.location,
        current_company: d.current_company,
        current_role: d.current_role || d.candidate_role,
        experience_years: Number(d.experience_years) || 0,
        skills: Array.isArray(d.skills) ? d.skills : (typeof d.skills === 'string' ? JSON.parse(d.skills || '[]') : []),
        education: d.education,
        work_history: Array.isArray(d.work_history) ? d.work_history : (typeof d.work_history === 'string' ? JSON.parse(d.work_history || '[]') : []),
        stage: d.stage as AtsStage,
        rating: Number(d.rating) || 0,
        expected_salary: d.expected_salary,
        notice_period: d.notice_period,
        ai_summary: d.ai_summary,
        ai_strengths: Array.isArray(d.ai_strengths) ? d.ai_strengths : (typeof d.ai_strengths === 'string' ? JSON.parse(d.ai_strengths || '[]') : []),
        ai_match_score: Number(d.ai_match_score) || 0,
        interview_notes: Array.isArray(d.interview_notes) ? d.interview_notes : (typeof d.interview_notes === 'string' ? JSON.parse(d.interview_notes || '[]') : []),
        tags: Array.isArray(d.tags) ? d.tags : (typeof d.tags === 'string' ? JSON.parse(d.tags || '[]') : []),
        source: d.source || 'AI Resume Assistant',
        applied_date: d.applied_date || new Date().toISOString(),
        updated_at: d.updated_at
      }));

      setCached(ATS_CANDIDATES_CACHE_KEY, formatted);
      return { candidates: formatted, fromSupabase: true };
    }

    if (error || !data || data.length === 0) {
      const cached = getCached<AtsCandidate[]>(ATS_CANDIDATES_CACHE_KEY, []);
      const cleaned = cached.filter(c => !isDummyCandidate(c));
      if (cleaned.length !== cached.length) {
        setCached(ATS_CANDIDATES_CACHE_KEY, cleaned);
      }
      return { candidates: cleaned, fromSupabase: false };
    }

    return { candidates: [], fromSupabase: false };
  } catch (err) {
    console.warn('Supabase getAtsCandidates failed, using local cache:', err);
    const cached = getCached<AtsCandidate[]>(ATS_CANDIDATES_CACHE_KEY, []);
    const cleaned = cached.filter(c => !isDummyCandidate(c));
    return { candidates: cleaned, fromSupabase: false };
  }
}

export async function createAtsCandidate(candidate: Omit<AtsCandidate, 'id' | 'applied_date'>): Promise<AtsCandidate> {
  const newCandidate: AtsCandidate = {
    ...candidate,
    id: crypto.randomUUID ? crypto.randomUUID() : `cand-${Date.now()}`,
    applied_date: new Date().toISOString()
  };

  try {
    const payload = {
      id: newCandidate.id,
      job_id: newCandidate.job_id || null,
      job_title: newCandidate.job_title,
      full_name: newCandidate.full_name,
      email: newCandidate.email || null,
      phone: newCandidate.phone || null,
      location: newCandidate.location || null,
      current_company: newCandidate.current_company || null,
      current_role: newCandidate.current_role || null,
      experience_years: newCandidate.experience_years || 0,
      skills: newCandidate.skills || [],
      education: newCandidate.education || null,
      work_history: newCandidate.work_history || [],
      stage: newCandidate.stage || 'APPLIED',
      rating: newCandidate.rating || 0,
      expected_salary: newCandidate.expected_salary || null,
      notice_period: newCandidate.notice_period || null,
      ai_summary: newCandidate.ai_summary || null,
      ai_strengths: newCandidate.ai_strengths || [],
      ai_match_score: newCandidate.ai_match_score || 0,
      interview_notes: newCandidate.interview_notes || [],
      tags: newCandidate.tags || [],
      source: newCandidate.source || 'AI Resume Assistant'
    };

    const { data, error } = await supabase
      .from('ats_candidates')
      .insert(payload)
      .select()
      .maybeSingle();

    if (!error && data) {
      newCandidate.id = data.id;
    }
  } catch (err) {
    console.warn('Supabase createAtsCandidate error:', err);
  }

  // Update local cache
  const cached = getCached<AtsCandidate[]>(ATS_CANDIDATES_CACHE_KEY, INITIAL_ATS_CANDIDATES);
  setCached(ATS_CANDIDATES_CACHE_KEY, [newCandidate, ...cached]);
  return newCandidate;
}

export async function updateAtsCandidateStage(id: string, stage: AtsStage): Promise<void> {
  try {
    await supabase
      .from('ats_candidates')
      .update({
        stage: stage,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
  } catch (err) {
    console.warn('Supabase updateAtsCandidateStage error:', err);
  }

  const cached = getCached<AtsCandidate[]>(ATS_CANDIDATES_CACHE_KEY, INITIAL_ATS_CANDIDATES);
  const updated = cached.map(c => c.id === id ? { ...c, stage, updated_at: new Date().toISOString() } : c);
  setCached(ATS_CANDIDATES_CACHE_KEY, updated);
}

export async function updateAtsCandidateRating(id: string, rating: number): Promise<void> {
  try {
    await supabase
      .from('ats_candidates')
      .update({
        rating: rating,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
  } catch (err) {
    console.warn('Supabase updateAtsCandidateRating error:', err);
  }

  const cached = getCached<AtsCandidate[]>(ATS_CANDIDATES_CACHE_KEY, INITIAL_ATS_CANDIDATES);
  const updated = cached.map(c => c.id === id ? { ...c, rating, updated_at: new Date().toISOString() } : c);
  setCached(ATS_CANDIDATES_CACHE_KEY, updated);
}

export async function addCandidateInterviewNote(candidateId: string, note: Omit<AtsInterviewNote, 'id' | 'timestamp'>): Promise<AtsInterviewNote> {
  const newNote: AtsInterviewNote = {
    ...note,
    id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString()
  };

  const cached = getCached<AtsCandidate[]>(ATS_CANDIDATES_CACHE_KEY, INITIAL_ATS_CANDIDATES);
  const candidate = cached.find(c => c.id === candidateId);
  const existingNotes = candidate?.interview_notes || [];
  const updatedNotes = [newNote, ...existingNotes];

  try {
    await supabase
      .from('ats_candidates')
      .update({
        interview_notes: updatedNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', candidateId);
  } catch (err) {
    console.warn('Supabase addCandidateInterviewNote error:', err);
  }

  const updatedCandidates = cached.map(c => c.id === candidateId ? { ...c, interview_notes: updatedNotes } : c);
  setCached(ATS_CANDIDATES_CACHE_KEY, updatedCandidates);
  return newNote;
}

export async function deleteAtsCandidate(id: string): Promise<void> {
  try {
    await supabase
      .from('ats_candidates')
      .delete()
      .eq('id', id);
  } catch (err) {
    console.warn('Supabase deleteAtsCandidate error:', err);
  }

  const cached = getCached<AtsCandidate[]>(ATS_CANDIDATES_CACHE_KEY, INITIAL_ATS_CANDIDATES);
  const filtered = cached.filter(c => c.id !== id);
  setCached(ATS_CANDIDATES_CACHE_KEY, filtered);
}

// -------------------------------------------------------------------------
// Supabase Connection & Health Check
// -------------------------------------------------------------------------
export async function checkSupabaseAtsStatus(): Promise<{
  connected: boolean;
  hasJobsTable: boolean;
  hasCandidatesTable: boolean;
  error?: string;
}> {
  try {
    const jobsRes = await supabase.from('ats_jobs').select('id').limit(1);
    const candidatesRes = await supabase.from('ats_candidates').select('id').limit(1);

    const hasJobsTable = !jobsRes.error;
    const hasCandidatesTable = !candidatesRes.error;

    return {
      connected: hasJobsTable && hasCandidatesTable,
      hasJobsTable,
      hasCandidatesTable,
      error: jobsRes.error?.message || candidatesRes.error?.message
    };
  } catch (err: any) {
    return {
      connected: false,
      hasJobsTable: false,
      hasCandidatesTable: false,
      error: err?.message || 'Connection failed'
    };
  }
}

// -------------------------------------------------------------------------
// Ready-to-Execute Supabase SQL Migration Script
// -------------------------------------------------------------------------
export const SUPABASE_ATS_SQL = `-- =========================================================================
-- MOMOMAYA APPLICANT TRACKING SYSTEM (ATS) - SUPABASE DATABASE MIGRATION
-- Run this in your Supabase Project: SQL Editor -> New Query -> Run
-- =========================================================================

-- 1. Create Jobs Openings Table
CREATE TABLE IF NOT EXISTS public.ats_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    branch_name TEXT DEFAULT 'All Stations',
    employment_type TEXT DEFAULT 'Full-time',
    salary_range TEXT,
    description TEXT,
    requirements JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'CLOSED'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Candidates Table
-- CRITICAL: Resumes are NOT stored as files; only structured AI-extracted data is saved
CREATE TABLE IF NOT EXISTS public.ats_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.ats_jobs(id) ON DELETE SET NULL,
    job_title TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    location TEXT,
    current_company TEXT,
    "current_role" TEXT,
    experience_years NUMERIC DEFAULT 0,
    skills JSONB DEFAULT '[]'::jsonb,
    education TEXT,
    work_history JSONB DEFAULT '[]'::jsonb,
    stage TEXT DEFAULT 'APPLIED', -- 'APPLIED', 'SCREENING', 'INTERVIEW_SCHEDULED', 'TRIAL_SHIFT', 'OFFERED', 'HIRED', 'REJECTED', 'ARCHIVED'
    rating INTEGER DEFAULT 0, -- 1 to 5 stars
    expected_salary TEXT,
    notice_period TEXT,
    ai_summary TEXT,
    ai_strengths JSONB DEFAULT '[]'::jsonb,
    ai_match_score INTEGER DEFAULT 0,
    interview_notes JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    source TEXT DEFAULT 'AI Resume Assistant',
    applied_date TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. High Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ats_candidates_stage ON public.ats_candidates(stage);
CREATE INDEX IF NOT EXISTS idx_ats_candidates_job_id ON public.ats_candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_ats_candidates_rating ON public.ats_candidates(rating);
CREATE INDEX IF NOT EXISTS idx_ats_candidates_applied_date ON public.ats_candidates(applied_date DESC);
CREATE INDEX IF NOT EXISTS idx_ats_jobs_status ON public.ats_jobs(status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.ats_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_candidates ENABLE ROW LEVEL SECURITY;

-- 5. Open RLS Policies for Anon / Authenticated Access
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow all access to ats_jobs" ON public.ats_jobs;
    CREATE POLICY "Allow all access to ats_jobs" ON public.ats_jobs FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all access to ats_candidates" ON public.ats_candidates;
    CREATE POLICY "Allow all access to ats_candidates" ON public.ats_candidates FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 6. Initial Seed Jobs for Momomaya Restaurant Chain
INSERT INTO public.ats_jobs (id, title, department, branch_name, employment_type, salary_range, description, requirements, status)
VALUES 
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Head Momo Chef', 'Kitchen', 'All Stations', 'Full-time', '₹28,000 - ₹38,000 / month', 'Lead momo preparation, dough kneading, signature spice blends, and kitchen quality standards.', '["3+ years QSR or dumpling experience", "Knowledge of HACCP & kitchen hygiene", "Team leadership"]'::jsonb, 'ACTIVE'),
  ('b2c3d4e5-f6a7-4b6c-9d0e-1f2a3b4c5d6e', 'Line Cook / Steamer Operator', 'Kitchen', 'BNR', 'Full-time', '₹18,000 - ₹24,000 / month', 'Operate high-pressure momo steamers, prep fillings, manage portioning and speedy dispatch.', '["1+ years culinary experience", "Speed under high order volume", "Punctuality"]'::jsonb, 'ACTIVE'),
  ('c3d4e5f6-a7b8-4c7d-0e1f-2a3b4c5d6e7f', 'Counter Cashier & Front of House', 'Front of House', 'BNR', 'Shift-based', '₹16,000 - ₹22,000 / month', 'Welcoming guests, operating Momomaya POS billing, handling cash/UPI, and upselling momo platters.', '["Energetic customer-first attitude", "Fast numerical & billing speed", "Clear communication"]'::jsonb, 'ACTIVE'),
  ('d4e5f6a7-b8c9-4d8e-1f2a-3b4c5d6e7f8a', 'Restaurant Store Manager', 'Management', 'BNR', 'Full-time', '₹35,000 - ₹50,000 / month', 'Oversee end-to-end station profitability, staff rosters, inventory tracking, customer review rate, and food waste minimization.', '["Prior QSR or cafe managerial experience", "P&L awareness", "Shift roster planning"]'::jsonb, 'ACTIVE'),
  ('e5f6a7b8-c9d0-4e9f-2a3b-4c5d6e7f8a9b', 'Food Delivery Coordinator', 'Operations', 'BNR', 'Full-time', '₹18,000 - ₹25,000 / month', 'Coordinate Swiggy/Zomato dispatch, packaging quality check, rider handoffs, and delivery SLA compliance.', '["Smartphone proficient", "Fast-paced coordination", "Attention to packaging"]'::jsonb, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
`;
