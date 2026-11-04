import React, { useState } from 'react';
import { Customer } from '../types';
import { getWhatsAppGangCouponUrl, getGangCouponShareMessage, markGangCouponAsSent } from '../utils/referralStorage';

interface StudentGangWhatsAppModalProps {
  isOpen: boolean;
  customer: Customer;
  onClose: (sent?: boolean) => void;
}

export const StudentGangWhatsAppModal: React.FC<StudentGangWhatsAppModalProps> = ({
  isOpen,
  customer,
  onClose
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !customer.gangCouponCode) return null;

  const gangCouponCode = customer.gangCouponCode.toUpperCase();
  const studentName = customer.name || 'Student';
  const collegeName = customer.note?.startsWith('STUDENT|') 
    ? (customer.note.split('|')[1] || '').trim() 
    : '';

  const shareMessage = getGangCouponShareMessage(gangCouponCode, studentName);
  const whatsappUrl = getWhatsAppGangCouponUrl(
    customer.phone,
    studentName,
    gangCouponCode
  );

  const handleCopyCode = () => {
    navigator.clipboard.writeText(gangCouponCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(shareMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const handleSendWhatsApp = async () => {
    setIsProcessing(true);
    try {
      await markGangCouponAsSent(customer.phone);
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      onClose(true);
    } catch (e) {
      console.warn("Failed marking gang coupon as sent:", e);
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      onClose(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkAsAlreadySent = async () => {
    setIsProcessing(true);
    try {
      await markGangCouponAsSent(customer.phone);
      onClose(true);
    } catch (e) {
      console.warn("Failed marking gang coupon as sent:", e);
      onClose(true);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/90 backdrop-blur-lg p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-gradient-to-b from-stone-900 via-zinc-950 to-stone-950 border-2 border-teal-400/60 rounded-3xl p-5 sm:p-8 max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl relative text-white ring-1 ring-teal-400/30">
        {/* Top Teal Shimmer Bar */}
        <div className="sticky -top-5 sm:-top-8 -mx-5 sm:-mx-8 mb-4 h-3 bg-gradient-to-r from-teal-400 via-emerald-300 via-cyan-400 to-teal-300"></div>

        {/* Priority Banner: First Priority for Students */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/50 text-teal-300 text-[10px] font-black uppercase tracking-widest shadow-sm">
            <span className="animate-ping h-2 w-2 rounded-full bg-teal-400"></span>
            <span>⭐ First Priority: Student Gang Offer</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
            {collegeName ? `🎓 ${collegeName}` : '🎓 Verified Student'} • Visit #{customer.totalOrders + 1 || 1}
          </span>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-400/20 text-teal-300 border-2 border-teal-400/40 mb-3 shadow-xl shadow-teal-950/40">
            <span className="text-3xl">👥</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black italic uppercase tracking-tight text-white leading-tight">
            Student Gang Coupon <span className="text-teal-400">Ready to Send!</span>
          </h2>
          <p className="text-xs sm:text-sm font-bold text-zinc-300 mt-2 max-w-lg mx-auto leading-relaxed">
            Student <strong className="text-white underline decoration-teal-400 decoration-2 font-black">{studentName}</strong> ({customer.phone}) is eligible for the <span className="text-teal-300 font-bold">Bring Your Gang Offer</span> (Flat 50% OFF up to ₹200 for 3+ students). Send them their Gang Coupon now!
          </p>
        </div>

        {/* Big Unique Gang Coupon Code Card */}
        <div className="bg-black/50 border-2 border-teal-400/40 rounded-2xl p-4 sm:p-5 mb-4 text-center relative group shadow-inner">
          <span className="text-[10px] font-black uppercase text-teal-400 tracking-[0.25em] block mb-2">
            Their Unique Student Gang Coupon Code
          </span>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span className="text-3xl sm:text-4xl font-mono font-black text-teal-300 tracking-widest px-4 py-1 rounded-xl bg-teal-400/10 border border-teal-400/30 select-all">
              {gangCouponCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-wider transition-all border border-white/20 active:scale-95 cursor-pointer"
            >
              {copiedCode ? '✅ Copied' : '📋 Copy Code'}
            </button>
          </div>
        </div>

        {/* Shareable WhatsApp Message Preview */}
        <div className="bg-teal-950/40 border border-teal-500/40 rounded-2xl p-4 mb-4 shadow-inner text-left">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">💬</span>
              <span className="text-[11px] font-black uppercase tracking-widest text-teal-300">
                WhatsApp Message (Ready to forward to gang / college groups):
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyMessage}
              className="px-3 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-[10px] font-black uppercase tracking-wider transition-all border border-teal-400/30 active:scale-95 cursor-pointer"
            >
              {copiedMessage ? '✅ Message Copied' : '📋 Copy Message'}
            </button>
          </div>
          <div className="bg-black/60 p-3.5 rounded-xl border border-teal-500/20 font-sans text-xs text-teal-100/90 whitespace-pre-wrap leading-relaxed select-all">
            {shareMessage}
          </div>
          <p className="text-[10px] text-zinc-400 mt-2 font-medium flex items-center gap-1.5">
            <span>✨</span>
            <span>Pre-formatted so the student can directly share this into college WhatsApp groups.</span>
          </p>
        </div>

        {/* Cashier Verbal Instructions */}
        <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-2xl p-4 mb-5 shadow-inner">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">📢</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-cyan-400">
              Cashier Script (Say this to the student):
            </span>
          </div>
          <p className="text-xs text-cyan-100 font-medium leading-relaxed italic bg-black/40 p-3 rounded-xl border border-cyan-500/20">
            &ldquo;Hey {studentName}! Because you are registered as a student at MinMomos, here is your unique <strong className="text-teal-300 font-black">Student Gang Coupon Code: {gangCouponCode}</strong>! Bring a squad of 3 or more student friends to get <strong className="text-emerald-400 font-black">Flat 50% OFF (up to ₹200)</strong>! I am sending it to your WhatsApp right now so you can share it with your college friends!&rdquo;
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleSendWhatsApp}
            disabled={isProcessing}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 active:scale-98 text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-teal-950/50 flex items-center justify-center gap-3 transition-all cursor-pointer border border-teal-400/40"
          >
            <span className="text-2xl">📲</span>
            <span>Send Gang Coupon on WhatsApp & Mark as Sent</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={handleMarkAsAlreadySent}
              disabled={isProcessing}
              className="py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase text-[10px] tracking-wider transition-all border border-zinc-700 hover:text-white"
            >
              ✅ Mark Sent (Already Told Student)
            </button>
            <button
              type="button"
              onClick={() => onClose(false)}
              disabled={isProcessing}
              className="py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold uppercase text-[10px] tracking-wider transition-all border border-zinc-800 hover:text-zinc-200"
            >
              ⏳ Remind Me Next Visit (Keep Unsent)
            </button>
          </div>
        </div>

        <p className="text-[9px] font-bold text-zinc-500 text-center uppercase tracking-wider mt-4">
          Once marked as sent, this Gang Coupon notification will not pop up again for this student.
        </p>
      </div>
    </div>
  );
};
