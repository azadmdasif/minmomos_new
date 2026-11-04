import React, { useState } from 'react';
import { Customer, OrderItem } from '../types';
import { registerStudentGang, validateGangCoupon } from '../utils/referralStorage';
import { normalizePhone } from '../utils/storage';

interface StudentGangModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
  customerPhone?: string;
  subtotal: number;
  initialCouponCode?: string;
  onApplyGangDiscount: (gangItem: OrderItem) => void;
}

export const StudentGangModal: React.FC<StudentGangModalProps> = ({
  isOpen,
  onClose,
  customer,
  customerPhone = '',
  subtotal,
  initialCouponCode = '',
  onApplyGangDiscount
}) => {
  const currentSchool = customer?.note?.startsWith('STUDENT|') 
    ? (customer.note.split('|')[1] || '') 
    : '';

  const activePhone = customer?.phone || customerPhone || '';

  const [couponCode, setCouponCode] = useState(
    initialCouponCode || customer?.gangCouponCode || ''
  );
  const [college, setCollege] = useState(currentSchool || '');
  const [members, setMembers] = useState([
    { name: customer?.name || 'Lead Student', phone: activePhone },
    { name: '', phone: '' },
    { name: '', phone: '' }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (initialCouponCode) {
      setCouponCode(initialCouponCode.trim().toUpperCase());
    } else if (customer?.gangCouponCode) {
      setCouponCode(customer.gangCouponCode.trim().toUpperCase());
    }
  }, [initialCouponCode, customer?.gangCouponCode, isOpen]);

  if (!isOpen) return null;

  // Flat 50% OFF up to ₹200
  const discountAmount = Math.min(200, Math.round(subtotal * 0.50));

  const handleMemberChange = (index: number, field: 'name' | 'phone', val: string) => {
    setMembers(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
    setError(null);
  };

  const handleAddMember = () => {
    setMembers(prev => [...prev, { name: '', phone: '' }]);
  };

  const handleRemoveMember = (index: number) => {
    if (members.length <= 3) return;
    setMembers(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCoupon = couponCode.trim().toUpperCase();
    if (!cleanCoupon) {
      setError('Please enter a valid Gang Coupon Code to redeem.');
      return;
    }

    if (!college.trim()) {
      setError('Please enter the College / University / School name.');
      return;
    }

    if (members.length < 3) {
      setError('Student Gang offer requires enlisting at least 3 members (bring 3 or more students).');
      return;
    }

    // Validate all members
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m.name.trim()) {
        setError(`Please enter the name for Member #${i + 1}.`);
        return;
      }
      const normPhone = normalizePhone(m.phone);
      if (!normPhone || normPhone.length !== 10) {
        setError(`Member #${i + 1} (${m.name}) needs a valid 10-digit mobile number.`);
        return;
      }
    }

    // Check unique phones
    const phoneSet = new Set(members.map(m => normalizePhone(m.phone)));
    if (phoneSet.size !== members.length) {
      setError('All gang members must have distinct, unique mobile numbers.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Validate coupon code
      const validation = await validateGangCoupon(cleanCoupon);
      if (!validation.valid) {
        setError(validation.error || 'Invalid student gang coupon.');
        setIsSubmitting(false);
        return;
      }

      // Register all members in database/storage
      const leadPhone = members[0].phone;
      const result = await registerStudentGang(
        cleanCoupon,
        leadPhone,
        college,
        members
      );

      if (!result.success) {
        setError(result.error || 'Failed to register student gang');
        setIsSubmitting(false);
        return;
      }

      // Add Flat 50% OFF (up to ₹200) discount item to cart
      const gangDiscountItem: OrderItem = {
        id: 'student-gang-discount',
        menuItemId: 'discount',
        name: `🎒 Student Gang 50% Off (Max ₹200) [Code: ${cleanCoupon}]`,
        price: -discountAmount,
        quantity: 1,
        cost: 0
      };

      onApplyGangDiscount(gangDiscountItem);
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Error registering student gang. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden text-white flex flex-col max-h-[90vh]">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600"></div>

        {/* Header */}
        <div className="text-center mb-5 shrink-0">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-2 shadow-lg">
            <span className="text-2xl">👥</span>
          </div>
          <h3 className="text-2xl font-black italic uppercase tracking-tight text-white leading-tight">
            Redeem <span className="text-emerald-400">Gang Coupon</span>
          </h3>
          <p className="text-[11px] font-bold text-emerald-200/80 mt-1 uppercase tracking-wider">
            Flat 50% OFF (Up to ₹200) on bringing 3 or more students!
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold shrink-0">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1 no-scrollbar">
          {/* Coupon Code Input */}
          <div className="bg-white/5 border border-emerald-500/30 rounded-2xl p-3">
            <label className="text-[9px] font-black uppercase text-emerald-400 tracking-widest block mb-1">
              Student Gang Coupon Code *
            </label>
            <input
              type="text"
              required
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="e.g. GANG-8492-X4"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white uppercase outline-none focus:border-emerald-400"
            />
          </div>

          {/* College Name */}
          <div>
            <label className="text-[9px] font-black uppercase text-zinc-300 tracking-widest block mb-1">
              College / University / School Name *
            </label>
            <input
              type="text"
              required
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              placeholder="e.g. Delhi University, Bennett, Amity, IIT..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs font-bold text-white outline-none focus:border-emerald-400 focus:bg-white/10 transition-all placeholder:text-zinc-600"
            />
          </div>

          {/* Enlist 3 or more members */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">
                Enlisted Members ({members.length} Total • Min 3 Required)
              </label>
              <button
                type="button"
                onClick={handleAddMember}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
              >
                <span>➕</span> Add More Member
              </button>
            </div>

            <div className="space-y-2.5">
              {members.map((member, idx) => (
                <div key={idx} className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">
                      {idx === 0 ? '👑 Member 1 (Lead Student)' : `🎒 Member ${idx + 1}`}
                    </span>
                    {idx >= 3 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(idx)}
                        className="text-[9px] text-rose-400 hover:text-rose-300 font-bold uppercase"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Student Full Name"
                      value={member.name}
                      onChange={(e) => handleMemberChange(idx, 'name', e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-emerald-400"
                    />
                    <input
                      type="tel"
                      required
                      placeholder="10-digit Phone"
                      value={member.phone}
                      onChange={(e) => handleMemberChange(idx, 'phone', e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Discount Summary Card */}
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏷️</span>
              <div>
                <div className="text-[10px] font-black uppercase text-emerald-400">Flat 50% OFF Gang Discount</div>
                <div className="text-[11px] font-bold text-zinc-300">
                  Subtotal: ₹{Math.round(subtotal)} • Capped at ₹200 max
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-base font-black text-emerald-400">-₹{discountAmount}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-1/3 py-3 rounded-xl bg-zinc-800 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:bg-zinc-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-2/3 py-3 rounded-xl bg-emerald-500 text-zinc-950 font-black uppercase text-xs tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? 'Verifying & Registering...' : `Redeem Gang Coupon (-₹${discountAmount})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
