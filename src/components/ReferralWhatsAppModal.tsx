import React, { useState } from 'react';
import { Customer } from '../types';
import { getWhatsAppReferralShareUrl, getReferralShareMessage, markReferralCodeAsSent } from '../utils/referralStorage';

interface ReferralWhatsAppModalProps {
  isOpen: boolean;
  customer: Customer;
  onClose: (sent?: boolean) => void;
}

export const ReferralWhatsAppModal: React.FC<ReferralWhatsAppModalProps> = ({
  isOpen,
  customer,
  onClose
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !customer.referralCode) return null;

  const referralCode = customer.referralCode.toUpperCase();
  const shareMessage = getReferralShareMessage(referralCode);
  const whatsappUrl = getWhatsAppReferralShareUrl(
    customer.phone,
    customer.name || 'Valued Customer',
    referralCode
  );

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
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
      await markReferralCodeAsSent(customer.phone);
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      onClose(true);
    } catch (e) {
      console.warn("Failed marking referral as sent:", e);
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      onClose(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkAsAlreadySent = async () => {
    setIsProcessing(true);
    try {
      await markReferralCodeAsSent(customer.phone);
      onClose(true);
    } catch (e) {
      console.warn("Failed marking referral as sent:", e);
      onClose(true);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/90 backdrop-blur-lg p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-gradient-to-b from-stone-900 to-zinc-950 border-2 border-brand-yellow/60 rounded-3xl p-5 sm:p-8 max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl relative text-white ring-1 ring-brand-yellow/30">
        {/* Top Gold Shimmer Bar */}
        <div className="sticky -top-5 sm:-top-8 -mx-5 sm:-mx-8 mb-4 h-3 bg-gradient-to-r from-amber-400 via-yellow-300 via-amber-500 to-yellow-300"></div>

        {/* Priority Banner */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-widest shadow-sm">
            <span className="animate-ping h-2 w-2 rounded-full bg-amber-400"></span>
            <span>Prospective VIP Member Visit</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
            Total Spent: ₹{Math.round(customer.totalSpent || 0)} • Orders: {customer.totalOrders || 0}
          </span>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-400/20 text-brand-yellow border-2 border-brand-yellow/40 mb-3 shadow-xl shadow-yellow-900/30">
            <span className="text-3xl">👑</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black italic uppercase tracking-tight text-white leading-tight">
            VIP Referral Code <span className="text-brand-yellow">Ready to Send!</span>
          </h2>
          <p className="text-xs sm:text-sm font-bold text-zinc-300 mt-2 max-w-lg mx-auto leading-relaxed">
            Customer <strong className="text-white underline decoration-brand-yellow decoration-2 font-black">{customer.name || 'VIP Guest'}</strong> ({customer.phone}) has qualified for the VIP Referral Club. Send them their referral code now.
          </p>
        </div>

        {/* Big Unique Referral Code Card */}
        <div className="bg-black/50 border-2 border-brand-yellow/40 rounded-2xl p-4 sm:p-5 mb-4 text-center relative group shadow-inner">
          <span className="text-[10px] font-black uppercase text-amber-400 tracking-[0.25em] block mb-2">
            Their Permanent Unique VIP Referral Code
          </span>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span className="text-3xl sm:text-4xl font-mono font-black text-brand-yellow tracking-widest px-4 py-1 rounded-xl bg-amber-400/10 border border-amber-400/30 select-all">
              {referralCode}
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

        {/* Shareable WhatsApp Message Preview (Direct Forwardable by Customer) */}
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 mb-4 shadow-inner text-left">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">💬</span>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
                WhatsApp Message (Ready to forward to friends):
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyMessage}
              className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider transition-all border border-emerald-400/30 active:scale-95 cursor-pointer"
            >
              {copiedMessage ? '✅ Message Copied' : '📋 Copy Message'}
            </button>
          </div>
          <div className="bg-black/60 p-3.5 rounded-xl border border-emerald-500/20 font-sans text-xs text-emerald-100/90 whitespace-pre-wrap leading-relaxed select-all">
            {shareMessage}
          </div>
          <p className="text-[10px] text-zinc-400 mt-2 font-medium flex items-center gap-1.5">
            <span>✨</span>
            <span>The customer can directly forward this message to their friends, groups &amp; family.</span>
          </p>
        </div>

        {/* Cashier Verbal Instructions */}
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 mb-5 shadow-inner">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">📢</span>
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-400">
              Cashier Script (Say this to the customer):
            </span>
          </div>
          <p className="text-xs text-amber-100 font-medium leading-relaxed italic bg-black/40 p-3 rounded-xl border border-amber-500/20">
            &ldquo;Congratulations {customer.name || 'Sir/Ma\'am'}! Because of your loyalty at MinMomos, you&apos;ve unlocked our <strong className="text-brand-yellow font-black">VIP Referral Club</strong>! I am sending your referral invite to your WhatsApp right now. You can directly share it with friends—they get <strong className="text-emerald-400 font-black">50% OFF (up to ₹100)</strong>, and you get the <strong className="text-brand-yellow font-black">exact same discount credited as MinCoins</strong>!&rdquo;
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleSendWhatsApp}
            disabled={isProcessing}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-3 transition-all cursor-pointer border border-emerald-400/40"
          >
            <span className="text-2xl">📲</span>
            <span>Send Referral Code on WhatsApp & Mark as Sent</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={handleMarkAsAlreadySent}
              disabled={isProcessing}
              className="py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase text-[10px] tracking-wider transition-all border border-zinc-700 hover:text-white"
            >
              ✅ Mark Sent (Already Told Customer)
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
          Once marked as sent, this VIP notification will never pop up again for this customer.
        </p>
      </div>
    </div>
  );
};
