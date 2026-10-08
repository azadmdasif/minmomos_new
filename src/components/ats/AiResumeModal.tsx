import React, { useState, useRef, useEffect } from 'react';
import { AtsCandidate, AtsJob, AtsParsedResume } from '../../types/ats';
import { createAtsCandidate } from '../../utils/atsStorage';
import { AddJobModal } from './AddJobModal';

interface AiResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: AtsJob[];
  onCandidateAdded: (candidate: AtsCandidate) => void;
}

export const AiResumeModal: React.FC<AiResumeModalProps> = ({
  isOpen,
  onClose,
  jobs,
  onCandidateAdded
}) => {
  const [localJobs, setLocalJobs] = useState<AtsJob[]>(jobs);
  const [selectedJobId, setSelectedJobId] = useState<string>(jobs[0]?.id || '');
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  // Extracted preview state
  const [parsedData, setParsedData] = useState<AtsParsedResume | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newSkillInput, setNewSkillInput] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalJobs(jobs);
    if (!selectedJobId && jobs[0]?.id) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs]);

  if (!isOpen) return null;

  const targetJob = localJobs.find(j => j.id === selectedJobId) || localJobs[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Check size limit: 15MB
    if (selected.size > 15 * 1024 * 1024) {
      setError('File is too large. Please select a file under 15MB.');
      return;
    }

    setFile(selected);
    setError('');

    const reader = new FileReader();
    reader.onload = () => {
      setFileBase64(reader.result as string);
    };
    reader.onerror = () => {
      setError('Failed to read file from your device.');
    };

    // If text file, also extract raw text
    if (selected.type.includes('text') || selected.name.endsWith('.txt')) {
      const textReader = new FileReader();
      textReader.onload = () => {
        setRawText(textReader.result as string);
      };
      textReader.readAsText(selected);
    }

    reader.readAsDataURL(selected);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      setError('');
      const reader = new FileReader();
      reader.onload = () => {
        setFileBase64(reader.result as string);
      };
      reader.readAsDataURL(droppedFile);
    }
  };

  const handleProcessResume = async () => {
    if (!fileBase64 && !rawText.trim()) {
      setError('Please upload a resume file or paste candidate text.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setProcessingStep('Reading document in memory...');

    try {
      setTimeout(() => setProcessingStep('Sending to Gemini AI model...'), 600);
      setTimeout(() => setProcessingStep('Extracting candidate skills & experience...'), 1400);

      const response = await fetch('/api/ats/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: fileBase64 || undefined,
          mimeType: file?.type || 'application/pdf',
          fileName: file?.name || 'Resume.pdf',
          rawText: rawText || undefined,
          jobTitle: targetJob?.title || 'General Restaurant Staff'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze resume with AI');
      }

      const data = await response.json();
      if (!data.candidate) {
        throw new Error('No candidate data returned');
      }

      setProcessingStep('Finalizing structured profile...');
      setParsedData(data.candidate);
      setIsEditing(true);
    } catch (err: any) {
      console.error('Error processing resume:', err);
      setError(err?.message || 'Failed to extract candidate data. Please check connection or try pasting text.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleAddSkill = () => {
    if (!newSkillInput.trim() || !parsedData) return;
    setParsedData({
      ...parsedData,
      skills: [...(parsedData.skills || []), newSkillInput.trim()]
    });
    setNewSkillInput('');
  };

  const handleRemoveSkill = (index: number) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      skills: (parsedData.skills || []).filter((_, i) => i !== index)
    });
  };

  const handleSaveToDatabase = async () => {
    if (!parsedData || !parsedData.full_name.trim()) {
      setError('Candidate name is required.');
      return;
    }

    setIsProcessing(true);
    setProcessingStep('Saving candidate to Supabase database...');

    try {
      const newCandidate = await createAtsCandidate({
        job_id: selectedJobId,
        job_title: targetJob?.title || 'General Staff',
        full_name: parsedData.full_name,
        email: parsedData.email,
        phone: parsedData.phone,
        location: parsedData.location,
        current_company: parsedData.current_company,
        current_role: parsedData.current_role,
        experience_years: parsedData.experience_years || 0,
        skills: parsedData.skills || [],
        education: parsedData.education,
        work_history: parsedData.work_history || [],
        stage: 'APPLIED',
        rating: Math.min(5, Math.max(1, Math.round((parsedData.ai_match_score || 80) / 20))),
        expected_salary: parsedData.expected_salary,
        notice_period: parsedData.notice_period,
        ai_summary: parsedData.ai_summary,
        ai_strengths: parsedData.ai_strengths || [],
        ai_match_score: parsedData.ai_match_score || 85,
        tags: parsedData.tags || ['AI Parsed'],
        source: 'AI Resume Assistant',
        interview_notes: []
      });

      onCandidateAdded(newCandidate);
      handleReset();
      onClose();
    } catch (err: any) {
      console.error('Save candidate error:', err);
      setError('Failed to save candidate to database: ' + (err?.message || ''));
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleReset = () => {
    setFile(null);
    setFileBase64('');
    setRawText('');
    setParsedData(null);
    setIsEditing(false);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-brand-cream border border-brand-stone/40 w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 bg-brand-brown text-brand-cream flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-yellow/20 flex items-center justify-center text-brand-yellow">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-brand-yellow tracking-tight">AI Hiring Assistant</h2>
                <span className="text-[9px] font-black uppercase tracking-wider bg-brand-red text-white px-2 py-0.5 rounded-full">
                  Resume Parser
                </span>
              </div>
              <p className="text-[10px] text-brand-cream/60 font-medium">
                Instant candidate extraction • Resumes are never saved as files
              </p>
            </div>
          </div>

          <button
            onClick={() => { handleReset(); onClose(); }}
            className="w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-700 font-black">✕</button>
            </div>
          )}

          {!isEditing ? (
            <>
              {/* Step 1: Select Target Opening & Branch */}
              <div className="bg-white p-4 rounded-2xl border border-brand-stone/30 shadow-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider">
                    1. Target Job Opening &amp; Branch
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddJobOpen(true)}
                    className="text-xs font-black text-brand-red hover:underline flex items-center gap-1"
                  >
                    <span>+ Create Role for Branch</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="w-full bg-brand-cream border border-brand-stone/40 rounded-xl px-3 py-2.5 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  >
                    {localJobs.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.title} ({job.department} • 📍 {job.branch_name})
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px] text-brand-brown/70 bg-brand-yellow/15 rounded-xl px-3 py-2 flex items-center justify-between">
                    <span>
                      Branch: <strong className="text-brand-brown">{targetJob?.branch_name || 'All Stations'}</strong>
                    </span>
                    <span>
                      Salary: <strong className="text-brand-brown">{targetJob?.salary_range || 'Competitive'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 2: Choose Upload or Paste */}
              <div className="bg-white p-5 rounded-2xl border border-brand-stone/30 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider">
                    2. Provide Candidate Resume
                  </label>
                  <div className="flex bg-brand-cream p-1 rounded-xl border border-brand-stone/30">
                    <button
                      type="button"
                      onClick={() => setInputMode('upload')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        inputMode === 'upload' ? 'bg-brand-brown text-white shadow-sm' : 'text-brand-brown/60 hover:text-brand-brown'
                      }`}
                    >
                      Upload File (PDF / Img)
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('paste')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        inputMode === 'paste' ? 'bg-brand-brown text-white shadow-sm' : 'text-brand-brown/60 hover:text-brand-brown'
                      }`}
                    >
                      Paste Text
                    </button>
                  </div>
                </div>

                {inputMode === 'upload' ? (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      file 
                        ? 'border-emerald-500 bg-emerald-50/50' 
                        : 'border-brand-stone/60 hover:border-brand-brown hover:bg-brand-yellow/5'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {file ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-sm font-black text-brand-brown">{file.name}</p>
                        <p className="text-xs text-brand-brown/50">{(file.size / 1024).toFixed(1)} KB • Click to change file</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-brand-yellow/30 text-brand-brown flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </div>
                        <p className="text-sm font-black text-brand-brown">
                          Drag & drop resume here, or <span className="text-brand-red underline">browse</span>
                        </p>
                        <p className="text-xs text-brand-brown/50">
                          Supports PDF, JPG, PNG, or TXT documents (Max 15MB)
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Paste raw resume text, WhatsApp message, or bio here..."
                      rows={6}
                      className="w-full bg-brand-cream border border-brand-stone/40 rounded-xl p-3 text-xs font-medium text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none resize-none"
                    />
                  </div>
                )}

                {/* Privacy Badge */}
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-900 text-[10.5px]">
                  <span className="text-base">🔒</span>
                  <p className="leading-tight">
                    <strong>Zero File Storage:</strong> Resumes are processed in-memory directly by Gemini AI. The original file is never uploaded to any storage bucket or saved on disk. Only structured candidate profile fields will be placed into your Supabase database.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-brand-stone/50 font-bold text-xs text-brand-brown hover:bg-brand-stone/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessing || (!file && !rawText.trim())}
                  onClick={handleProcessResume}
                  className="px-6 py-2.5 rounded-xl bg-brand-red hover:bg-brand-red/90 disabled:opacity-50 text-white font-black text-xs shadow-lg shadow-brand-red/20 flex items-center gap-2 transition-all active:scale-95"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{processingStep || 'Processing...'}</span>
                    </>
                  ) : (
                    <>
                      <span>✨ Extract with Gemini AI</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Step 3: Interactive Review & Confirm Extracted Data */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-brand-stone/30">
                <div className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  <h3 className="text-base font-black text-brand-brown">Extracted Candidate Profile</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs font-bold text-brand-red hover:underline"
                >
                  ← Re-upload / Reparse
                </button>
              </div>

              {/* Match Score & Summary Banner */}
              <div className="p-4 bg-gradient-to-r from-brand-brown to-brand-brown/90 text-white rounded-2xl flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-yellow">
                      AI Role Match
                    </span>
                    <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full font-bold">
                      {targetJob?.title}
                    </span>
                  </div>
                  <p className="text-xs text-white/90 leading-snug line-clamp-2">
                    {parsedData?.ai_summary}
                  </p>
                </div>
                <div className="flex-shrink-0 text-center bg-white/10 px-4 py-2.5 rounded-2xl border border-white/15">
                  <div className="text-2xl font-black text-brand-yellow">
                    {parsedData?.ai_match_score || 85}%
                  </div>
                  <div className="text-[8px] font-bold uppercase tracking-wider text-white/70">
                    Fit Score
                  </div>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Candidate Full Name *
                  </label>
                  <input
                    type="text"
                    value={parsedData?.full_name || ''}
                    onChange={(e) => setParsedData({ ...parsedData!, full_name: e.target.value })}
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>

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
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  >
                    {localJobs.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.title} (📍 {job.branch_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={parsedData?.email || ''}
                    onChange={(e) => setParsedData({ ...parsedData!, email: e.target.value })}
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Phone / Mobile
                  </label>
                  <input
                    type="tel"
                    value={parsedData?.phone || ''}
                    onChange={(e) => setParsedData({ ...parsedData!, phone: e.target.value })}
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Current Location / City
                  </label>
                  <input
                    type="text"
                    value={parsedData?.location || ''}
                    onChange={(e) => setParsedData({ ...parsedData!, location: e.target.value })}
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Experience (Years)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={parsedData?.experience_years ?? 1}
                    onChange={(e) => setParsedData({ ...parsedData!, experience_years: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Current Company / Employer
                  </label>
                  <input
                    type="text"
                    value={parsedData?.current_company || ''}
                    onChange={(e) => setParsedData({ ...parsedData!, current_company: e.target.value })}
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Education &amp; Qualifications
                  </label>
                  <input
                    type="text"
                    value={parsedData?.education || ''}
                    onChange={(e) => setParsedData({ ...parsedData!, education: e.target.value })}
                    placeholder="e.g. 10th Pass (2024), Burnpur School"
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Expected Salary
                  </label>
                  <input
                    type="text"
                    value={parsedData?.expected_salary || ''}
                    onChange={(e) => setParsedData({ ...parsedData!, expected_salary: e.target.value })}
                    placeholder="e.g. ₹18,000 / month"
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                    Notice Period
                  </label>
                  <input
                    type="text"
                    value={parsedData?.notice_period || ''}
                    onChange={(e) => setParsedData({ ...parsedData!, notice_period: e.target.value })}
                    placeholder="e.g. Immediate"
                    className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                </div>
              </div>

              {/* Skills Tag Cloud */}
              <div className="bg-white p-3.5 rounded-2xl border border-brand-stone/30 space-y-2">
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block">
                  Extracted Skills & Competencies
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(parsedData?.skills || []).map((skill, idx) => (
                    <span
                      key={idx}
                      className="bg-brand-yellow/20 text-brand-brown border border-brand-yellow/40 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(idx)}
                        className="text-brand-brown/50 hover:text-brand-red"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newSkillInput}
                    onChange={(e) => setNewSkillInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSkill(); }}}
                    placeholder="Add additional skill..."
                    className="flex-1 bg-brand-cream border border-brand-stone/40 rounded-xl px-3 py-1.5 text-xs font-medium text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddSkill}
                    className="px-3 py-1.5 bg-brand-brown text-white rounded-xl text-xs font-bold hover:bg-brand-brown/90"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* AI Key Strengths */}
              {parsedData?.ai_strengths && parsedData.ai_strengths.length > 0 && (
                <div className="bg-emerald-50/70 border border-emerald-200/60 p-3 rounded-2xl space-y-1">
                  <p className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">
                    Key Strengths Identified by AI
                  </p>
                  <ul className="text-xs text-emerald-900 space-y-1 list-disc pl-4 font-medium">
                    {parsedData.ai_strengths.map((str, idx) => (
                      <li key={idx}>{str}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Confirm Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-brand-stone/30">
                <span className="text-[11px] text-brand-brown/60">
                  Ready to add to <strong>Applied</strong> pipeline stage
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2.5 rounded-xl border border-brand-stone/50 font-bold text-xs text-brand-brown hover:bg-brand-stone/20"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleSaveToDatabase}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs shadow-lg shadow-emerald-600/20 flex items-center gap-2 active:scale-95 transition-all"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <span>✓ Confirm &amp; Save to Supabase</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddJobModal
        isOpen={isAddJobOpen}
        onClose={() => setIsAddJobOpen(false)}
        onJobAdded={(newJob) => {
          setLocalJobs(prev => [newJob, ...prev]);
          setSelectedJobId(newJob.id);
        }}
      />
    </div>
  );
};
