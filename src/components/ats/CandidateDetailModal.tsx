import React, { useState } from 'react';
import { AtsCandidate, AtsStage } from '../../types/ats';
import { updateAtsCandidateStage, updateAtsCandidateRating, addCandidateInterviewNote, deleteAtsCandidate } from '../../utils/atsStorage';
import { User } from '../../types';

interface CandidateDetailModalProps {
  candidate: AtsCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUpdate: (updated: AtsCandidate) => void;
  onDelete: (id: string) => void;
}

const STAGE_CONFIG: Record<AtsStage, { label: string; color: string; bg: string }> = {
  APPLIED: { label: 'Applied', color: 'text-amber-700', bg: 'bg-amber-100' },
  SCREENING: { label: 'Screening', color: 'text-blue-700', bg: 'bg-blue-100' },
  INTERVIEW_SCHEDULED: { label: 'Interview Scheduled', color: 'text-purple-700', bg: 'bg-purple-100' },
  TRIAL_SHIFT: { label: 'Trial Shift', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  OFFERED: { label: 'Offer Extended', color: 'text-teal-700', bg: 'bg-teal-100' },
  HIRED: { label: 'Hired 🎉', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  REJECTED: { label: 'Rejected', color: 'text-rose-700', bg: 'bg-rose-100' },
  ARCHIVED: { label: 'Archived', color: 'text-stone-700', bg: 'bg-stone-200' },
};

const STAGES_FLOW: AtsStage[] = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW_SCHEDULED',
  'TRIAL_SHIFT',
  'OFFERED',
  'HIRED'
];

export const CandidateDetailModal: React.FC<CandidateDetailModalProps> = ({
  candidate,
  isOpen,
  onClose,
  currentUser,
  onUpdate,
  onDelete
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'interview_ai' | 'notes'>('profile');
  const [newNoteText, setNewNoteText] = useState('');
  const [noteRating, setNoteRating] = useState<number>(5);
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  
  // AI Interview Questions state
  const [questions, setQuestions] = useState<{ question: string; category: string; look_for: string }[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  if (!isOpen || !candidate) return null;

  const currentStageConfig = STAGE_CONFIG[candidate.stage] || STAGE_CONFIG.APPLIED;

  const handleStageChange = async (newStage: AtsStage) => {
    await updateAtsCandidateStage(candidate.id, newStage);
    const updated = { ...candidate, stage: newStage };
    onUpdate(updated);
  };

  const handleRatingChange = async (newRating: number) => {
    await updateAtsCandidateRating(candidate.id, newRating);
    const updated = { ...candidate, rating: newRating };
    onUpdate(updated);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    setIsSubmittingNote(true);
    try {
      const addedNote = await addCandidateInterviewNote(candidate.id, {
        author: currentUser.username,
        authorRole: currentUser.role,
        text: newNoteText.trim(),
        stage: candidate.stage,
        rating: noteRating
      });

      const updated = {
        ...candidate,
        interview_notes: [addedNote, ...(candidate.interview_notes || [])]
      };
      onUpdate(updated);
      setNewNoteText('');
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleGenerateQuestions = async () => {
    setIsLoadingQuestions(true);
    try {
      const res = await fetch('/api/ats/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateName: candidate.full_name,
          targetRole: candidate.job_title,
          skills: candidate.skills,
          experienceYears: candidate.experience_years,
          summary: candidate.ai_summary
        })
      });

      if (!res.ok) throw new Error('Failed to generate interview questions');
      const data = await res.json();
      setQuestions(data.questions || []);
      setActiveTab('interview_ai');
    } catch (err) {
      console.error('Error generating questions:', err);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to remove candidate "${candidate.full_name}"?`)) {
      await deleteAtsCandidate(candidate.id);
      onDelete(candidate.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-brand-cream border border-brand-stone/40 w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Bar */}
        <div className="px-6 py-5 bg-brand-brown text-brand-cream flex flex-wrap items-center justify-between gap-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-yellow text-brand-brown font-black text-xl flex items-center justify-center shadow-md">
              {candidate.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-brand-yellow tracking-tight">{candidate.full_name}</h2>
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${currentStageConfig.bg} ${currentStageConfig.color}`}>
                  {currentStageConfig.label}
                </span>
              </div>
              <p className="text-xs text-brand-cream/70 font-medium">
                Applied for <strong className="text-white">{candidate.job_title}</strong> • {candidate.experience_years} yrs exp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Rating Stars */}
            <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRatingChange(star)}
                  className={`text-sm transition-transform hover:scale-120 ${
                    star <= (candidate.rating || 0) ? 'text-amber-400' : 'text-white/30'
                  }`}
                  title={`Rate ${star} Stars`}
                >
                  ★
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stage Progression Bar */}
        <div className="bg-white/60 px-6 py-3 border-b border-brand-stone/30 flex items-center justify-between overflow-x-auto gap-2 no-scrollbar">
          <span className="text-[10px] font-black uppercase tracking-wider text-brand-brown/50 whitespace-nowrap">
            Pipeline Stage:
          </span>
          <div className="flex items-center gap-1.5 flex-1 max-w-2xl">
            {STAGES_FLOW.map((s, idx) => {
              const isActive = candidate.stage === s;
              const isPast = STAGES_FLOW.indexOf(candidate.stage) > idx;
              return (
                <button
                  key={s}
                  onClick={() => handleStageChange(s)}
                  className={`flex-1 min-w-[70px] py-1.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-center transition-all ${
                    isActive
                      ? 'bg-brand-brown text-brand-yellow shadow-md scale-102'
                      : isPast
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-brand-stone/20 text-brand-brown/50 hover:bg-brand-stone/40'
                  }`}
                >
                  {STAGE_CONFIG[s].label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleStageChange('REJECTED')}
              className={`text-[10px] font-black uppercase px-2.5 py-1.5 rounded-xl transition-all ${
                candidate.stage === 'REJECTED'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              Reject
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="px-6 pt-4 border-b border-brand-stone/30 flex gap-4 text-xs font-black">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'border-brand-brown text-brand-brown'
                : 'border-transparent text-brand-brown/50 hover:text-brand-brown'
            }`}
          >
            <span>👤 Candidate Profile</span>
          </button>
          <button
            onClick={() => setActiveTab('interview_ai')}
            className={`pb-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'interview_ai'
                ? 'border-brand-brown text-brand-brown'
                : 'border-transparent text-brand-brown/50 hover:text-brand-brown'
            }`}
          >
            <span>✨ AI Interview Assistant</span>
            {questions.length > 0 && (
              <span className="bg-brand-yellow text-brand-brown px-1.5 py-0.2 rounded-full text-[9px]">
                {questions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`pb-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'notes'
                ? 'border-brand-brown text-brand-brown'
                : 'border-transparent text-brand-brown/50 hover:text-brand-brown'
            }`}
          >
            <span>📝 Evaluation Notes</span>
            <span className="bg-brand-stone/40 text-brand-brown px-1.5 py-0.2 rounded-full text-[9px]">
              {(candidate.interview_notes || []).length}
            </span>
          </button>
        </div>

        {/* Modal Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'profile' && (
            <div className="space-y-5">
              {/* AI Highlights Banner */}
              {candidate.ai_summary && (
                <div className="bg-white p-5 rounded-2xl border border-brand-stone/30 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">✨</span>
                      <h4 className="text-xs font-black uppercase text-brand-brown tracking-wider">
                        AI Hiring Assistant Evaluation
                      </h4>
                    </div>
                    {candidate.ai_match_score && (
                      <span className="text-xs font-black bg-brand-yellow/30 text-brand-brown px-2.5 py-1 rounded-full border border-brand-yellow">
                        {candidate.ai_match_score}% Match Score
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-brand-brown/90 leading-relaxed font-medium">
                    {candidate.ai_summary}
                  </p>
                  {candidate.ai_strengths && candidate.ai_strengths.length > 0 && (
                    <div className="pt-2 border-t border-brand-stone/20">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800 mb-1">
                        Key Strengths for Momomaya:
                      </p>
                      <ul className="text-xs text-emerald-950 space-y-1 list-disc pl-4">
                        {candidate.ai_strengths.map((str, idx) => (
                          <li key={idx}>{str}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Contact & Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-wider text-brand-brown/50">Contact Phone</p>
                  <p className="text-xs font-black text-brand-brown">{candidate.phone || 'Not provided'}</p>
                  {candidate.phone && (
                    <div className="flex gap-2 pt-1">
                      <a
                        href={`tel:${candidate.phone}`}
                        className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg hover:bg-emerald-100"
                      >
                        📞 Call
                      </a>
                      <a
                        href={`https://wa.me/${candidate.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg hover:bg-teal-100"
                      >
                        💬 WhatsApp
                      </a>
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-wider text-brand-brown/50">Email Address</p>
                  <p className="text-xs font-black text-brand-brown truncate">{candidate.email || 'Not provided'}</p>
                  {candidate.email && (
                    <a
                      href={`mailto:${candidate.email}`}
                      className="inline-block text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg hover:bg-blue-100 mt-1"
                    >
                      ✉️ Email Candidate
                    </a>
                  )}
                </div>

                <div className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-wider text-brand-brown/50">Location & Notice</p>
                  <p className="text-xs font-black text-brand-brown">{candidate.location || 'Bangalore'}</p>
                  <p className="text-[10.5px] text-brand-brown/70 font-semibold">
                    Notice: {candidate.notice_period || 'Immediate'} • Exp: ₹{candidate.expected_salary || 'Competitive'}
                  </p>
                </div>
              </div>

              {/* Skills Cloud */}
              <div className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-brand-brown/50">
                  Skills & Operational Capabilities
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(candidate.skills || []).map((skill, idx) => (
                    <span
                      key={idx}
                      className="bg-brand-yellow/20 text-brand-brown border border-brand-yellow/50 px-2.5 py-1 rounded-lg text-xs font-bold"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Work History */}
              {candidate.work_history && candidate.work_history.length > 0 && (
                <div className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-brand-brown/50">
                    Past Employment & Work Experience
                  </p>
                  <div className="space-y-3">
                    {candidate.work_history.map((job, idx) => (
                      <div key={idx} className="pb-3 border-b border-brand-stone/20 last:border-none last:pb-0">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-black text-brand-brown">{job.role}</h5>
                          <span className="text-[10.5px] font-bold text-brand-brown/60">{job.duration}</span>
                        </div>
                        <p className="text-xs font-semibold text-brand-red">{job.company}</p>
                        {job.highlights && (
                          <p className="text-xs text-brand-brown/80 mt-1">{job.highlights}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {candidate.education && (
                <div className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-wider text-brand-brown/50">Education & Training</p>
                  <p className="text-xs font-bold text-brand-brown">{candidate.education}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'interview_ai' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-purple-900 to-brand-brown text-white p-5 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                <div>
                  <h4 className="text-sm font-black text-purple-200">AI Tailored Interview Questions</h4>
                  <p className="text-xs text-white/80 mt-0.5">
                    Generate probing operational questions customized to {candidate.full_name}'s resume gaps and Momomaya QSR standards.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isLoadingQuestions}
                  onClick={handleGenerateQuestions}
                  className="px-4 py-2 bg-brand-yellow text-brand-brown rounded-xl text-xs font-black shadow-md hover:bg-yellow-400 flex items-center gap-2 whitespace-nowrap active:scale-95 transition-all"
                >
                  {isLoadingQuestions ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-brand-brown border-t-transparent rounded-full animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <span>✨ {questions.length > 0 ? 'Regenerate Questions' : 'Generate Questions'}</span>
                  )}
                </button>
              </div>

              {questions.length === 0 && !isLoadingQuestions && (
                <div className="bg-white p-8 rounded-2xl border border-brand-stone/30 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto text-xl font-black">
                    💬
                  </div>
                  <h5 className="text-sm font-black text-brand-brown">No questions generated yet</h5>
                  <p className="text-xs text-brand-brown/60 max-w-md mx-auto">
                    Click "Generate Questions" above. Gemini AI will analyze {candidate.full_name}'s background for {candidate.job_title} and suggest targeted questions with interview guidance.
                  </p>
                </div>
              )}

              {questions.map((q, idx) => (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-brand-stone/30 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200">
                      Q{idx + 1}: {q.category}
                    </span>
                  </div>
                  <h5 className="text-xs font-black text-brand-brown leading-snug">
                    "{q.question}"
                  </h5>
                  <div className="p-3 bg-brand-cream rounded-xl border border-brand-stone/30 text-[11px] text-brand-brown/80 font-medium">
                    <strong className="text-brand-brown block text-[10px] uppercase font-black tracking-wider mb-0.5">
                      What to look for in response:
                    </strong>
                    {q.look_for}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-5">
              {/* Add Note Form */}
              <form onSubmit={handleAddNote} className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider">
                    Add Interview or Trial Feedback
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-brand-brown/50 mr-1">Rating:</span>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setNoteRating(s)}
                        className={`text-sm ${s <= noteRating ? 'text-amber-400' : 'text-stone-300'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder={`Write your impressions regarding ${candidate.full_name}'s trial shift, cooking speed, attitude, or salary discussion...`}
                  rows={3}
                  className="w-full bg-brand-cream border border-brand-stone/40 rounded-xl p-3 text-xs font-medium text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none resize-none"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmittingNote || !newNoteText.trim()}
                    className="px-4 py-2 bg-brand-brown hover:bg-brand-brown/90 disabled:opacity-50 text-white rounded-xl text-xs font-black"
                  >
                    {isSubmittingNote ? 'Saving...' : 'Post Evaluation Note'}
                  </button>
                </div>
              </form>

              {/* Notes Timeline */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-black uppercase tracking-wider text-brand-brown/50">
                  Feedback History ({(candidate.interview_notes || []).length})
                </h5>

                {(!candidate.interview_notes || candidate.interview_notes.length === 0) ? (
                  <p className="text-xs text-brand-brown/50 italic py-4 text-center">No notes recorded yet.</p>
                ) : (
                  candidate.interview_notes.map((note) => (
                    <div key={note.id} className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-brand-brown">{note.author}</span>
                          <span className="text-[9px] font-bold uppercase bg-brand-stone/30 text-brand-brown/70 px-1.5 py-0.2 rounded">
                            {note.authorRole}
                          </span>
                          <span className="text-[10px] font-medium text-brand-brown/40">
                            {new Date(note.timestamp).toLocaleDateString()} at {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {note.rating && (
                          <div className="text-amber-400 text-xs">
                            {'★'.repeat(note.rating)}{'☆'.repeat(5 - note.rating)}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-brand-brown/90 font-medium leading-relaxed">
                        {note.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-brand-stone/10 border-t border-brand-stone/30 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors"
          >
            🗑 Delete Candidate
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-brand-brown text-white rounded-xl text-xs font-black hover:bg-brand-brown/90 shadow-md"
          >
            Done / Close
          </button>
        </div>

      </div>
    </div>
  );
};
