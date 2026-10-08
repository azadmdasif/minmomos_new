import React, { useState, useEffect } from 'react';
import { AtsCandidate, AtsJob } from '../../types/ats';
import { createAtsCandidate } from '../../utils/atsStorage';
import { AddJobModal } from './AddJobModal';

interface AddCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: AtsJob[];
  onCandidateAdded: (candidate: AtsCandidate) => void;
}

export const AddCandidateModal: React.FC<AddCandidateModalProps> = ({
  isOpen,
  onClose,
  jobs,
  onCandidateAdded
}) => {
  const [localJobs, setLocalJobs] = useState<AtsJob[]>(jobs);
  const [fullName, setFullName] = useState('');
  const [jobId, setJobId] = useState(jobs[0]?.id || '');
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('Bangalore');
  const [experienceYears, setExperienceYears] = useState(1);
  const [skillsStr, setSkillsStr] = useState('Food Prep, Momo Folding, Customer Service');
  const [expectedSalary, setExpectedSalary] = useState('₹18,000 - ₹24,000 / month');
  const [noticePeriod, setNoticePeriod] = useState('Immediate');
  const [summary, setSummary] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLocalJobs(jobs);
    if (!jobId && jobs[0]?.id) {
      setJobId(jobs[0].id);
    }
  }, [jobs]);

  if (!isOpen) return null;

  const targetJob = localJobs.find(j => j.id === jobId) || localJobs[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please provide candidate full name.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const skillsArray = skillsStr.split(',').map(s => s.trim()).filter(Boolean);

      const newCand = await createAtsCandidate({
        job_id: jobId,
        job_title: targetJob?.title || 'General Staff',
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        location: location.trim() || undefined,
        experience_years: experienceYears,
        skills: skillsArray,
        expected_salary: expectedSalary.trim() || undefined,
        notice_period: noticePeriod.trim() || undefined,
        ai_summary: summary.trim() || `${fullName} applied manually for ${targetJob?.title}. Has ${experienceYears} yrs experience with skills in ${skillsArray.slice(0, 3).join(', ')}.`,
        ai_strengths: ['Direct walk-in / manual entry', 'Relevant hospitality background'],
        ai_match_score: 80,
        stage: 'APPLIED',
        rating: 3,
        source: 'Walk-in / Referral',
        tags: ['Walk-in', 'Direct Application'],
        interview_notes: []
      });

      onCandidateAdded(newCand);
      onClose();
    } catch (err: any) {
      console.error('Error creating candidate:', err);
      setError(err?.message || 'Failed to save candidate');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-brand-cream border border-brand-stone/40 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 bg-brand-brown text-brand-cream flex items-center justify-between border-b border-white/10">
          <div>
            <h3 className="text-lg font-black text-brand-yellow tracking-tight">Add Candidate Manually</h3>
            <p className="text-[10px] text-brand-cream/60">For walk-in applicants, referrals, or direct outreach</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
              Candidate Full Name *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Ramesh Thapa"
              className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider">
                  Target Job Opening &amp; Branch
                </label>
                <button
                  type="button"
                  onClick={() => setIsAddJobOpen(true)}
                  className="text-[10px] font-black text-brand-red hover:underline"
                >
                  + New Role for Branch
                </button>
              </div>
              <select
                value={jobId}
                onChange={e => setJobId(e.target.value)}
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              >
                {localJobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.title} (📍 {j.branch_name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                Experience (Years)
              </label>
              <input
                type="number"
                step="0.5"
                value={experienceYears}
                onChange={e => setExperienceYears(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              >
              </input>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="candidate@example.com"
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Bangalore"
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
              Skills (comma separated)
            </label>
            <input
              type="text"
              value={skillsStr}
              onChange={e => setSkillsStr(e.target.value)}
              placeholder="e.g. Momo Folding, Cash Register, Food Hygiene"
              className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                Expected Salary
              </label>
              <input
                type="text"
                value={expectedSalary}
                onChange={e => setExpectedSalary(e.target.value)}
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                Notice Period
              </label>
              <input
                type="text"
                value={noticePeriod}
                onChange={e => setNoticePeriod(e.target.value)}
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
              Notes / Profile Summary
            </label>
            <textarea
              rows={3}
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Brief details about candidate background, referral source, or trial shift availability..."
              className="w-full bg-white border border-brand-stone/40 rounded-xl p-3 text-xs font-medium text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-brand-stone/30">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-brand-stone/50 font-bold text-brand-brown hover:bg-brand-stone/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 rounded-xl bg-brand-brown hover:bg-brand-brown/90 disabled:opacity-50 text-white font-black shadow-md"
            >
              {isSaving ? 'Saving...' : 'Add Candidate'}
            </button>
          </div>
        </form>
      </div>

      <AddJobModal
        isOpen={isAddJobOpen}
        onClose={() => setIsAddJobOpen(false)}
        onJobAdded={(newJob) => {
          setLocalJobs(prev => [newJob, ...prev]);
          setJobId(newJob.id);
        }}
      />
    </div>
  );
};
