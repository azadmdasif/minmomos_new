import React, { useState, useEffect } from 'react';
import { AtsJob } from '../../types/ats';
import { createAtsJob } from '../../utils/atsStorage';
import { getStations } from '../../utils/storage';
import { Station } from '../../types';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobAdded: (job: AtsJob) => void;
  initialBranch?: string;
}

const COMMON_ROLE_PRESETS = [
  'Head Momo Chef',
  'Line Cook / Steamer Operator',
  'Counter Cashier & Front of House',
  'Restaurant Store Manager',
  'Food Delivery Coordinator',
  'Kitchen Steward / Dishwasher'
];

export const AddJobModal: React.FC<AddJobModalProps> = ({
  isOpen,
  onClose,
  onJobAdded,
  initialBranch = 'All Stations'
}) => {
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('Kitchen');
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedBranchOption, setSelectedBranchOption] = useState<string>(initialBranch);
  const [customBranchName, setCustomBranchName] = useState('');
  const [isCustomBranch, setIsCustomBranch] = useState(false);
  const [employmentType, setEmploymentType] = useState('Full-time');
  const [salaryRange, setSalaryRange] = useState('₹20,000 - ₹28,000 / month');
  const [description, setDescription] = useState('');
  const [requirementsStr, setRequirementsStr] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getStations().then((fetched) => {
        setStations(fetched || []);
        if (initialBranch && initialBranch !== 'All Stations') {
          const found = (fetched || []).some(s => s.name.toLowerCase() === initialBranch.toLowerCase());
          if (found) {
            setSelectedBranchOption(initialBranch);
            setIsCustomBranch(false);
          } else {
            setSelectedBranchOption('__CUSTOM__');
            setCustomBranchName(initialBranch);
            setIsCustomBranch(true);
          }
        }
      });
    }
  }, [isOpen, initialBranch]);

  if (!isOpen) return null;

  const handleBranchSelect = (val: string) => {
    setSelectedBranchOption(val);
    if (val === '__CUSTOM__') {
      setIsCustomBranch(true);
    } else {
      setIsCustomBranch(false);
    }
  };

  const effectiveBranchName = isCustomBranch
    ? (customBranchName.trim() || 'Custom Branch')
    : selectedBranchOption;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const requirements = requirementsStr
        .split('\n')
        .map(r => r.trim())
        .filter(Boolean);

      const newJob = await createAtsJob({
        title: title.trim(),
        department,
        branch_name: effectiveBranchName,
        employment_type: employmentType,
        salary_range: salaryRange,
        description: description.trim() || `Opening for ${title.trim()} at ${effectiveBranchName}.`,
        requirements: requirements.length > 0 ? requirements : ['Prior food service experience', 'Punctuality & teamwork'],
        status: 'ACTIVE'
      });

      onJobAdded(newJob);
      onClose();
    } catch (err) {
      console.error('Failed to create job opening:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-brand-cream border border-brand-stone/40 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-brand-brown text-brand-cream flex items-center justify-between border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📍</span>
              <h3 className="text-lg font-black text-brand-yellow tracking-tight">Create Job Opening</h3>
            </div>
            <p className="text-[10px] text-brand-cream/60 mt-0.5">
              Define the target role and assign to a specific branch or station
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors font-bold"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* Quick Preset Chips */}
          <div>
            <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1.5">
              Quick Role Suggestions
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_ROLE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTitle(preset)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    title === preset
                      ? 'bg-brand-brown text-brand-yellow shadow-sm'
                      : 'bg-white text-brand-brown/70 hover:bg-brand-stone/20 border border-brand-stone/30'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Job Position Title */}
          <div>
            <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
              Job Position Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Master Momo Chef or Weekend Cashier"
              className="w-full bg-white border border-brand-stone/40 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
            />
          </div>

          {/* Specific Branch / Station Selector */}
          <div className="bg-white p-4 rounded-2xl border border-brand-stone/30 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block">
                Target Branch / Station *
              </label>
              <span className="text-[10px] font-bold text-brand-red bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                {effectiveBranchName}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <select
                  value={selectedBranchOption}
                  onChange={e => handleBranchSelect(e.target.value)}
                  className="w-full bg-brand-cream border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                >
                  <option value="All Stations">All Stations / Chain-wide</option>
                  {stations.map(s => (
                    <option key={s.id} value={s.name}>
                      📍 {s.name} {s.location ? `(${s.location})` : ''}
                    </option>
                  ))}
                  <option value="__CUSTOM__">➕ Enter Custom Branch / Location...</option>
                </select>
              </div>

              {isCustomBranch ? (
                <div>
                  <input
                    type="text"
                    required
                    value={customBranchName}
                    onChange={e => setCustomBranchName(e.target.value)}
                    placeholder="Type custom branch (e.g. Indiranagar Stall #2)"
                    className="w-full bg-brand-cream border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="text-[11px] text-brand-brown/60 flex items-center bg-brand-cream/50 px-3 py-2 rounded-xl">
                  <span>Selected: <strong>{selectedBranchOption}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Department & Employment Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                Department
              </label>
              <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              >
                <option value="Kitchen">Kitchen & Cooking</option>
                <option value="Front of House">Front of House & Cashier</option>
                <option value="Management">Store Management</option>
                <option value="Operations">Operations & Delivery</option>
                <option value="Logistics">Supply & Logistics</option>
                <option value="HR & Admin">HR & Staff Training</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
                Employment Type
              </label>
              <select
                value={employmentType}
                onChange={e => setEmploymentType(e.target.value)}
                className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Shift-based">Shift-based</option>
                <option value="Apprenticeship">Apprenticeship</option>
              </select>
            </div>
          </div>

          {/* Salary Range */}
          <div>
            <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
              Salary / Compensation Range
            </label>
            <input
              type="text"
              value={salaryRange}
              onChange={e => setSalaryRange(e.target.value)}
              placeholder="e.g. ₹20,000 - ₹28,000 / month"
              className="w-full bg-white border border-brand-stone/40 rounded-xl px-3 py-2 text-xs font-bold text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none"
            />
          </div>

          {/* Role Description */}
          <div>
            <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
              Role Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Primary duties and station expectations..."
              className="w-full bg-white border border-brand-stone/40 rounded-xl p-3 text-xs font-medium text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none resize-none"
            />
          </div>

          {/* Key Requirements */}
          <div>
            <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">
              Key Requirements (one per line)
            </label>
            <textarea
              rows={2}
              value={requirementsStr}
              onChange={e => setRequirementsStr(e.target.value)}
              placeholder="e.g.&#10;2+ years momo preparation&#10;Speed under peak lunch hours&#10;Food hygiene knowledge"
              className="w-full bg-white border border-brand-stone/40 rounded-xl p-3 text-xs font-medium text-brand-brown focus:ring-2 focus:ring-brand-yellow outline-none resize-none"
            />
          </div>

          {/* Footer Actions */}
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
              disabled={isSaving || !title.trim()}
              className="px-6 py-2.5 rounded-xl bg-brand-brown hover:bg-brand-brown/90 disabled:opacity-50 text-brand-yellow font-black shadow-md flex items-center gap-2 transition-all active:scale-95"
            >
              {isSaving ? 'Creating...' : '✓ Publish Role for Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
