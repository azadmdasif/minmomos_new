import React, { useState, useEffect, useMemo } from 'react';
import { AtsCandidate, AtsJob, AtsStage } from '../../types/ats';
import {
  getAtsJobs,
  getAtsCandidates,
  updateAtsCandidateStage,
  checkSupabaseAtsStatus,
  clearAllDummyCandidates,
  SUPABASE_ATS_SQL
} from '../../utils/atsStorage';
import { User } from '../../types';
import { AiResumeModal } from './AiResumeModal';
import { CandidateDetailModal } from './CandidateDetailModal';
import { AddCandidateModal } from './AddCandidateModal';
import { AddJobModal } from './AddJobModal';

interface AtsViewProps {
  user: User;
}

const KANBAN_STAGES: { stage: AtsStage; label: string; bg: string; color: string; accent: string }[] = [
  { stage: 'APPLIED', label: 'Applied', bg: 'bg-amber-500/10', color: 'text-amber-800', accent: 'border-amber-400' },
  { stage: 'SCREENING', label: 'Screening', bg: 'bg-blue-500/10', color: 'text-blue-800', accent: 'border-blue-400' },
  { stage: 'INTERVIEW_SCHEDULED', label: 'Interview', bg: 'bg-purple-500/10', color: 'text-purple-800', accent: 'border-purple-400' },
  { stage: 'TRIAL_SHIFT', label: 'Trial Shift', bg: 'bg-indigo-500/10', color: 'text-indigo-800', accent: 'border-indigo-400' },
  { stage: 'OFFERED', label: 'Offered', bg: 'bg-teal-500/10', color: 'text-teal-800', accent: 'border-teal-400' },
  { stage: 'HIRED', label: 'Hired 🎉', bg: 'bg-emerald-500/10', color: 'text-emerald-800', accent: 'border-emerald-500' },
];

export const AtsView: React.FC<AtsViewProps> = ({ user }) => {
  const [viewMode, setViewMode] = useState<'kanban' | 'table' | 'jobs' | 'sql'>('kanban');
  const [candidates, setCandidates] = useState<AtsCandidate[]>([]);
  const [jobs, setJobs] = useState<AtsJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupabaseLive, setIsSupabaseLive] = useState(false);
  const [dbStatusError, setDbStatusError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobFilter, setSelectedJobFilter] = useState('ALL');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL');
  const [selectedStageFilter, setSelectedStageFilter] = useState('ALL');

  // Modals
  const [isAiResumeModalOpen, setIsAiResumeModalOpen] = useState(false);
  const [isManualCandidateModalOpen, setIsManualCandidateModalOpen] = useState(false);
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<AtsCandidate | null>(null);
  
  // SQL Copy feedback
  const [hasCopiedSql, setHasCopiedSql] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await clearAllDummyCandidates();
      const [jobsRes, candidatesRes, statusRes] = await Promise.all([
        getAtsJobs(),
        getAtsCandidates(),
        checkSupabaseAtsStatus()
      ]);

      setJobs(jobsRes.jobs);
      setCandidates(candidatesRes.candidates);
      setIsSupabaseLive(statusRes.connected);
      if (!statusRes.connected && statusRes.error) {
        setDbStatusError(statusRes.error);
      } else {
        setDbStatusError(null);
      }
    } catch (err) {
      console.error('Failed to load ATS data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allBranches = useMemo(() => {
    return Array.from(new Set(jobs.map(j => j.branch_name).filter(Boolean)));
  }, [jobs]);

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        c.full_name.toLowerCase().includes(q) ||
        c.job_title.toLowerCase().includes(q) ||
        (c.skills || []).some(s => s.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q));

      // Job Filter
      const matchesJob = selectedJobFilter === 'ALL' || c.job_id === selectedJobFilter || c.job_title === selectedJobFilter;

      // Branch Filter
      const candidateJob = jobs.find(j => j.id === c.job_id || j.title === c.job_title);
      const matchesBranch = selectedBranchFilter === 'ALL' || 
        (candidateJob && candidateJob.branch_name === selectedBranchFilter) ||
        (c.location && c.location.toLowerCase().includes(selectedBranchFilter.toLowerCase()));

      // Stage Filter
      const matchesStage = selectedStageFilter === 'ALL' || c.stage === selectedStageFilter;

      return matchesSearch && matchesJob && matchesBranch && matchesStage;
    });
  }, [candidates, searchQuery, selectedJobFilter, selectedBranchFilter, selectedStageFilter, jobs]);

  // Stage counts & Metrics
  const metrics = useMemo(() => {
    const total = candidates.length;
    const active = candidates.filter(c => !['HIRED', 'REJECTED', 'ARCHIVED'].includes(c.stage)).length;
    const inInterview = candidates.filter(c => ['INTERVIEW_SCHEDULED', 'TRIAL_SHIFT'].includes(c.stage)).length;
    const hired = candidates.filter(c => c.stage === 'HIRED').length;
    const openJobsCount = jobs.filter(j => j.status === 'ACTIVE').length;

    return { total, active, inInterview, hired, openJobsCount };
  }, [candidates, jobs]);

  // Handle stage drag/click move
  const handleMoveStage = async (candidateId: string, newStage: AtsStage) => {
    await updateAtsCandidateStage(candidateId, newStage);
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, stage: newStage } : c));
    if (selectedCandidate && selectedCandidate.id === candidateId) {
      setSelectedCandidate({ ...selectedCandidate, stage: newStage });
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_ATS_SQL);
    setHasCopiedSql(true);
    setTimeout(() => setHasCopiedSql(false), 2500);
  };

  return (
    <div className="h-full flex flex-col bg-brand-cream overflow-hidden">
      
      {/* Top Header & Metrics Bar */}
      <header className="bg-brand-brown text-brand-cream px-6 py-4 border-b border-white/10 flex-shrink-0 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-yellow text-brand-brown font-black text-xl flex items-center justify-center shadow-md">
              🎯
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl lg:text-2xl font-black text-brand-yellow uppercase tracking-tight italic">
                  Applicant Tracking System
                </h1>
                <span className="text-[9px] font-black uppercase tracking-wider bg-brand-red text-white px-2.5 py-0.5 rounded-full shadow-sm">
                  AI Hiring Assistant
                </span>
                {isSupabaseLive ? (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Supabase Synced
                  </span>
                ) : (
                  <button
                    onClick={() => setViewMode('sql')}
                    className="hidden sm:inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full hover:bg-amber-500/30 transition-colors"
                  >
                    <span>⚡ Run Supabase SQL</span>
                  </button>
                )}
              </div>
              <p className="text-[10px] text-brand-cream/60 font-medium">
                Talent pipeline for Momomaya • Visible to Admins, Co-Founders &amp; HR
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsAddJobModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-brand-yellow text-xs font-bold transition-all border border-brand-yellow/30 flex items-center gap-1.5 active:scale-95"
            >
              <span>📍 + New Role for Branch</span>
            </button>

            <button
              onClick={() => setIsManualCandidateModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-brand-cream text-xs font-bold transition-all border border-white/10 flex items-center gap-1.5"
            >
              <span>+ Quick Add</span>
            </button>

            <button
              onClick={() => setIsAiResumeModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-red/90 hover:to-orange-700 text-white text-xs font-black shadow-lg shadow-brand-red/30 transition-all flex items-center gap-2 active:scale-95"
            >
              <span>✨ AI Resume Assistant</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-3 border-t border-white/10">
          <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-brand-cream/50">Total Applicants</p>
            <p className="text-lg font-black text-white">{metrics.total}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-brand-cream/50">Active in Funnel</p>
            <p className="text-lg font-black text-brand-yellow">{metrics.active}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-brand-cream/50">Interviews &amp; Trials</p>
            <p className="text-lg font-black text-purple-300">{metrics.inInterview}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-brand-cream/50">Hired for Team</p>
            <p className="text-lg font-black text-emerald-400">{metrics.hired}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2 col-span-2 sm:col-span-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-brand-cream/50">Open Positions</p>
            <p className="text-lg font-black text-white">{metrics.openJobsCount}</p>
          </div>
        </div>
      </header>

      {/* Control & Filter Sub-Bar */}
      <div className="bg-white/70 backdrop-blur-sm border-b border-brand-stone/30 px-6 py-3 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        {/* Navigation View Tabs */}
        <div className="flex bg-brand-cream p-1 rounded-2xl border border-brand-stone/30">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              viewMode === 'kanban'
                ? 'bg-brand-brown text-brand-yellow shadow-md'
                : 'text-brand-brown/60 hover:text-brand-brown'
            }`}
          >
            <span>📋 Pipeline (Kanban)</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              viewMode === 'table'
                ? 'bg-brand-brown text-brand-yellow shadow-md'
                : 'text-brand-brown/60 hover:text-brand-brown'
            }`}
          >
            <span>📑 All Candidates ({filteredCandidates.length})</span>
          </button>
          <button
            onClick={() => setViewMode('jobs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              viewMode === 'jobs'
                ? 'bg-brand-brown text-brand-yellow shadow-md'
                : 'text-brand-brown/60 hover:text-brand-brown'
            }`}
          >
            <span>💼 Job Openings ({jobs.length})</span>
          </button>
          <button
            onClick={() => setViewMode('sql')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              viewMode === 'sql'
                ? 'bg-brand-brown text-brand-yellow shadow-md'
                : 'text-brand-brown/60 hover:text-brand-brown'
            }`}
          >
            <span>⚡ Supabase Setup</span>
            {!isSupabaseLive && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </button>
        </div>

        {/* Search & Filters (Kanban & Table modes) */}
        {(viewMode === 'kanban' || viewMode === 'table') && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search candidates, skills, phone..."
                className="bg-white border border-brand-stone/40 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none w-52 sm:w-64"
              />
              <span className="absolute left-2.5 top-2 text-brand-brown/40 text-xs">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1.5 text-brand-brown/40 hover:text-brand-brown text-xs font-black"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={selectedJobFilter}
              onChange={e => setSelectedJobFilter(e.target.value)}
              className="bg-white border border-brand-stone/40 rounded-xl px-2.5 py-1.5 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
            >
              <option value="ALL">All Job Roles</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>

            <select
              value={selectedBranchFilter}
              onChange={e => setSelectedBranchFilter(e.target.value)}
              className="bg-white border border-brand-stone/40 rounded-xl px-2.5 py-1.5 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
            >
              <option value="ALL">All Branches</option>
              {allBranches.map(b => (
                <option key={b} value={b}>📍 {b}</option>
              ))}
            </select>

            {viewMode === 'table' && (
              <select
                value={selectedStageFilter}
                onChange={e => setSelectedStageFilter(e.target.value)}
                className="bg-white border border-brand-stone/40 rounded-xl px-2.5 py-1.5 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              >
                <option value="ALL">All Stages</option>
                {KANBAN_STAGES.map(s => (
                  <option key={s.stage} value={s.stage}>{s.label}</option>
                ))}
                <option value="REJECTED">Rejected</option>
              </select>
            )}
          </div>
        )}
      </div>

      {/* Main ATS Viewport */}
      <div className="flex-1 overflow-hidden p-6 relative">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-4 border-brand-brown border-t-brand-yellow rounded-full animate-spin mx-auto" />
              <p className="text-xs font-black uppercase tracking-wider text-brand-brown/60">
                Loading ATS Pipeline...
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 1. KANBAN PIPELINE VIEW */}
            {viewMode === 'kanban' && (
              <div className="h-full flex gap-4 overflow-x-auto pb-4 items-start select-none">
                {KANBAN_STAGES.map((col) => {
                  const stageCandidates = filteredCandidates.filter(c => c.stage === col.stage);
                  return (
                    <div
                      key={col.stage}
                      className="w-80 min-w-[300px] flex-shrink-0 bg-white/70 border border-brand-stone/30 rounded-3xl p-3.5 flex flex-col max-h-full shadow-sm"
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-brand-stone/20 mb-3 px-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${col.accent.replace('border-', 'bg-')}`} />
                          <h3 className="text-xs font-black text-brand-brown uppercase tracking-wider">
                            {col.label}
                          </h3>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${col.bg} ${col.color}`}>
                          {stageCandidates.length}
                        </span>
                      </div>

                      {/* Column Candidates List */}
                      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                        {stageCandidates.length === 0 ? (
                          <div className="py-8 text-center border-2 border-dashed border-brand-stone/30 rounded-2xl">
                            <p className="text-[11px] font-bold text-brand-brown/40">No candidates in {col.label}</p>
                          </div>
                        ) : (
                          stageCandidates.map((cand) => (
                            <div
                              key={cand.id}
                              onClick={() => setSelectedCandidate(cand)}
                              className="bg-white rounded-2xl p-4 border border-brand-stone/30 shadow-sm hover:shadow-md hover:border-brand-brown/40 transition-all cursor-pointer group space-y-2.5"
                            >
                              {/* Candidate Card Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className="text-sm font-black text-brand-brown truncate group-hover:text-brand-red transition-colors">
                                    {cand.full_name}
                                  </h4>
                                  <p className="text-[10.5px] font-bold text-brand-brown/60 truncate">
                                    {cand.job_title}
                                  </p>
                                </div>
                                {cand.ai_match_score ? (
                                  <span className="text-[10px] font-black bg-brand-yellow/30 text-brand-brown px-2 py-0.5 rounded-lg border border-brand-yellow/60 flex-shrink-0">
                                    {cand.ai_match_score}%
                                  </span>
                                ) : null}
                              </div>

                              {/* Experience & Rating */}
                              <div className="flex items-center justify-between text-[11px] text-brand-brown/70">
                                <span>{cand.experience_years} yrs exp</span>
                                <div className="text-amber-400 text-xs">
                                  {'★'.repeat(cand.rating || 3)}
                                </div>
                              </div>

                              {/* Skills chips (first 2) */}
                              <div className="flex flex-wrap gap-1">
                                {(cand.skills || []).slice(0, 3).map((s, idx) => (
                                  <span
                                    key={idx}
                                    className="bg-brand-cream text-brand-brown/80 border border-brand-stone/30 text-[9.5px] font-bold px-2 py-0.5 rounded-md"
                                  >
                                    {s}
                                  </span>
                                ))}
                                {(cand.skills || []).length > 3 && (
                                  <span className="text-[9px] font-bold text-brand-brown/40 self-center">
                                    +{(cand.skills || []).length - 3}
                                  </span>
                                )}
                              </div>

                              {/* Quick Card Footer with Stage Nav */}
                              <div className="pt-2 border-t border-brand-stone/20 flex items-center justify-between text-[10px]">
                                <span className="text-brand-brown/40 font-medium">
                                  {new Date(cand.applied_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                                
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                  {/* Prev stage */}
                                  {col.stage !== 'APPLIED' && (
                                    <button
                                      title="Move back"
                                      onClick={() => {
                                        const curIdx = KANBAN_STAGES.findIndex(s => s.stage === col.stage);
                                        if (curIdx > 0) handleMoveStage(cand.id, KANBAN_STAGES[curIdx - 1].stage);
                                      }}
                                      className="p-1 rounded bg-brand-stone/20 hover:bg-brand-brown hover:text-white"
                                    >
                                      ←
                                    </button>
                                  )}
                                  {/* Next stage */}
                                  {col.stage !== 'HIRED' && (
                                    <button
                                      title="Move forward"
                                      onClick={() => {
                                        const curIdx = KANBAN_STAGES.findIndex(s => s.stage === col.stage);
                                        if (curIdx < KANBAN_STAGES.length - 1) handleMoveStage(cand.id, KANBAN_STAGES[curIdx + 1].stage);
                                      }}
                                      className="p-1 rounded bg-brand-brown text-brand-yellow hover:bg-brand-red hover:text-white font-black"
                                    >
                                      →
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. TABLE LIST VIEW */}
            {viewMode === 'table' && (
              <div className="bg-white rounded-3xl border border-brand-stone/30 shadow-sm overflow-hidden flex flex-col h-full">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-brand-brown text-brand-cream border-b border-white/10 uppercase tracking-wider text-[9.5px] font-black">
                        <th className="py-3 px-4">Candidate</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Experience</th>
                        <th className="py-3 px-4">Stage</th>
                        <th className="py-3 px-4">Fit Score</th>
                        <th className="py-3 px-4">Rating</th>
                        <th className="py-3 px-4">Applied</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-stone/20">
                      {filteredCandidates.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-brand-brown/40 font-bold">
                            No candidates match your filters.
                          </td>
                        </tr>
                      ) : (
                        filteredCandidates.map(c => {
                          const stageInfo = KANBAN_STAGES.find(s => s.stage === c.stage) || { label: c.stage, bg: 'bg-stone-100', color: 'text-stone-800' };
                          return (
                            <tr
                              key={c.id}
                              onClick={() => setSelectedCandidate(c)}
                              className="hover:bg-brand-yellow/10 cursor-pointer transition-colors group"
                            >
                              <td className="py-3 px-4">
                                <div className="font-black text-brand-brown">{c.full_name}</div>
                                <div className="text-[10px] text-brand-brown/50">{c.phone || c.email}</div>
                              </td>
                              <td className="py-3 px-4 font-bold text-brand-brown/80">{c.job_title}</td>
                              <td className="py-3 px-4 font-medium text-brand-brown/70">{c.experience_years} yrs</td>
                              <td className="py-3 px-4">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${stageInfo.bg} ${stageInfo.color}`}>
                                  {stageInfo.label}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-black text-brand-brown bg-brand-yellow/30 px-2 py-0.5 rounded-lg border border-brand-yellow/50">
                                  {c.ai_match_score || 80}%
                                </span>
                              </td>
                              <td className="py-3 px-4 text-amber-400">
                                {'★'.repeat(c.rating || 3)}
                              </td>
                              <td className="py-3 px-4 text-[10px] text-brand-brown/50">
                                {new Date(c.applied_date).toLocaleDateString()}
                              </td>
                              <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => setSelectedCandidate(c)}
                                  className="px-2.5 py-1 rounded-lg bg-brand-brown text-white text-[10px] font-bold hover:bg-brand-red transition-colors"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. JOB OPENINGS MANAGER */}
            {viewMode === 'jobs' && (
              <div className="h-full flex flex-col space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-brand-brown">Current Job Openings</h3>
                    <p className="text-xs text-brand-brown/60">Active roles accepting applications across branches</p>
                  </div>
                  <button
                    onClick={() => setIsAddJobModalOpen(true)}
                    className="px-4 py-2 bg-brand-brown text-brand-yellow hover:bg-brand-brown/90 text-xs font-black rounded-xl shadow-md transition-all active:scale-95"
                  >
                    + Create New Job Opening
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobs.map(job => {
                    const applicantCount = candidates.filter(c => c.job_id === job.id || c.job_title === job.title).length;
                    return (
                      <div
                        key={job.id}
                        className="bg-white rounded-3xl p-5 border border-brand-stone/30 shadow-sm flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[9px] font-black uppercase text-brand-red bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                                {job.department}
                              </span>
                              <h4 className="text-base font-black text-brand-brown mt-1">{job.title}</h4>
                            </div>
                            <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                              {job.status}
                            </span>
                          </div>

                          <p className="text-xs text-brand-brown/70 leading-snug">
                            {job.description}
                          </p>

                          <div className="text-xs font-bold text-brand-brown bg-brand-cream p-2.5 rounded-xl border border-brand-stone/30 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-brand-brown/50">Branch:</span>
                              <span>{job.branch_name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-brand-brown/50">Salary:</span>
                              <span className="text-brand-red font-black">{job.salary_range}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-brand-brown/50">Type:</span>
                              <span>{job.employment_type}</span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-brand-stone/20 flex items-center justify-between text-xs">
                          <span className="font-black text-brand-brown">
                            {applicantCount} Candidate{applicantCount === 1 ? '' : 's'} in Funnel
                          </span>
                          <button
                            onClick={() => {
                              setSelectedJobFilter(job.id);
                              setViewMode('kanban');
                            }}
                            className="text-xs font-black text-brand-red hover:underline"
                          >
                            View Pipeline →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. SUPABASE SQL SETUP VIEW */}
            {viewMode === 'sql' && (
              <div className="h-full overflow-y-auto space-y-5 max-w-4xl mx-auto">
                {/* Connection Banner */}
                <div className={`p-6 rounded-3xl border shadow-sm flex items-start justify-between gap-4 ${
                  isSupabaseLive
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{isSupabaseLive ? '✅' : '⚡'}</span>
                      <h3 className="text-base font-black">
                        {isSupabaseLive ? 'Supabase ATS Tables Connected & Active!' : 'Supabase Database Migration Required'}
                      </h3>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">
                      {isSupabaseLive
                        ? 'Your Supabase database has ats_jobs and ats_candidates tables created with active RLS policies. Candidates parsed by the AI Hiring Assistant are saved directly to your cloud database.'
                        : 'The ATS is currently running with optimistic local cache so you can test it immediately. To persist candidate records directly to your cloud Supabase database, run the SQL script below in your Supabase SQL Editor.'}
                    </p>
                    {dbStatusError && (
                      <p className="text-[11px] text-amber-800 font-mono bg-amber-100/70 p-2 rounded-xl mt-1">
                        Notice: {dbStatusError}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={loadData}
                    className="px-4 py-2 bg-white rounded-xl text-xs font-black shadow-sm border border-black/10 hover:bg-black/5 whitespace-nowrap"
                  >
                    🔄 Test Connection
                  </button>
                </div>

                {/* SQL Box */}
                <div className="bg-brand-brown text-brand-cream rounded-3xl p-6 shadow-xl border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-brand-yellow uppercase tracking-wider">
                        Supabase PostgreSQL DDL Script
                      </h4>
                      <p className="text-xs text-brand-cream/60">
                        Paste and execute in Supabase: <strong>SQL Editor → New Query → Run</strong>
                      </p>
                    </div>

                    <button
                      onClick={handleCopySql}
                      className="px-4 py-2 bg-brand-yellow text-brand-brown hover:bg-yellow-400 font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95"
                    >
                      {hasCopiedSql ? '✓ Copied to Clipboard!' : '📋 Copy SQL Script'}
                    </button>
                  </div>

                  <pre className="bg-black/40 p-4 rounded-2xl text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-96 border border-white/10 no-scrollbar">
                    {SUPABASE_ATS_SQL}
                  </pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <AiResumeModal
        isOpen={isAiResumeModalOpen}
        onClose={() => setIsAiResumeModalOpen(false)}
        jobs={jobs}
        onCandidateAdded={(newCand) => {
          setCandidates(prev => [newCand, ...prev]);
          setSelectedCandidate(newCand);
        }}
      />

      <AddCandidateModal
        isOpen={isManualCandidateModalOpen}
        onClose={() => setIsManualCandidateModalOpen(false)}
        jobs={jobs}
        onCandidateAdded={(newCand) => {
          setCandidates(prev => [newCand, ...prev]);
        }}
      />

      <AddJobModal
        isOpen={isAddJobModalOpen}
        onClose={() => setIsAddJobModalOpen(false)}
        onJobAdded={(newJob) => {
          setJobs(prev => [newJob, ...prev]);
        }}
      />

      <CandidateDetailModal
        candidate={selectedCandidate}
        isOpen={!!selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
        currentUser={user}
        onUpdate={(updated) => {
          setCandidates(prev => prev.map(c => c.id === updated.id ? updated : c));
          setSelectedCandidate(updated);
        }}
        onDelete={(deletedId) => {
          setCandidates(prev => prev.filter(c => c.id !== deletedId));
          setSelectedCandidate(null);
        }}
      />

    </div>
  );
};
