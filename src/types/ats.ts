export type AtsStage = 
  | 'APPLIED' 
  | 'SCREENING' 
  | 'INTERVIEW_SCHEDULED' 
  | 'TRIAL_SHIFT' 
  | 'OFFERED' 
  | 'HIRED' 
  | 'REJECTED' 
  | 'ARCHIVED';

export interface AtsInterviewNote {
  id: string;
  author: string;
  authorRole: string;
  text: string;
  stage: AtsStage;
  rating?: number;
  timestamp: string;
}

export interface AtsWorkHistoryItem {
  role: string;
  company: string;
  duration?: string;
  highlights?: string;
}

export interface AtsCandidate {
  id: string;
  job_id?: string;
  job_title: string;
  full_name: string;
  email?: string;
  phone?: string;
  location?: string;
  current_company?: string;
  current_role?: string;
  experience_years: number;
  skills: string[];
  education?: string;
  work_history?: AtsWorkHistoryItem[];
  stage: AtsStage;
  rating: number; // 0 to 5
  expected_salary?: string;
  notice_period?: string;
  ai_summary?: string;
  ai_strengths?: string[];
  ai_match_score?: number; // 0 to 100
  interview_notes?: AtsInterviewNote[];
  tags?: string[];
  source?: string;
  applied_date: string;
  updated_at?: string;
}

export interface AtsJob {
  id: string;
  title: string;
  department: string;
  branch_name: string;
  employment_type: string;
  salary_range: string;
  description: string;
  requirements: string[];
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  created_at: string;
  updated_at?: string;
}

export interface AtsParsedResume {
  full_name: string;
  email?: string;
  phone?: string;
  location?: string;
  current_company?: string;
  current_role?: string;
  experience_years: number;
  skills: string[];
  education?: string;
  work_history?: AtsWorkHistoryItem[];
  expected_salary?: string;
  notice_period?: string;
  ai_summary?: string;
  ai_strengths?: string[];
  ai_match_score?: number;
  suggested_roles?: string[];
  tags?: string[];
}
