import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface NewCustomerModalProps {
  isOpen: boolean;
  phone: string;
  isExisting?: boolean;
  onRegister: (name: string) => void;
  onCancel: () => void;
}

const NewCustomerModal: React.FC<NewCustomerModalProps> = ({ isOpen, phone, isExisting, onRegister, onCancel }) => {
  const [name, setName] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onRegister(name.trim());
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-zinc-900 border border-white/10 rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl overflow-hidden relative"
          >
            {/* Background Accent */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 rounded-full ${isExisting ? 'bg-mountain-green' : 'bg-brand-yellow'}`}></div>

            <div className="text-center mb-8">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${isExisting ? 'bg-mountain-green/10' : 'bg-brand-yellow/10'}`}>
                <span className="text-3xl">{isExisting ? '👤' : '🎯'}</span>
              </div>
              <h2 className="text-2xl font-black text-white italic uppercase tracking-tight">
                {isExisting ? 'Complete ' : 'New '}<span className={isExisting ? 'text-mountain-green' : 'text-brand-yellow'}>{isExisting ? 'Profile' : 'Discovery!'}</span>
              </h2>
              <p className="text-zinc-500 font-bold uppercase tracking-widest text-[9px] mt-2">
                {isExisting ? 'This explorer is known but lacks a name' : 'This number is reaching the peak for the first time'}
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 text-center">
              <p className={`font-black text-xl mb-1 ${isExisting ? 'text-mountain-green' : 'text-brand-yellow'}`}>{phone}</p>
              {!isExisting && (
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                  A <span className="text-white">Welcome Campa Cola</span> will be gifted <br />to this explorer!
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Explorer's Name</label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter Name..."
                  className="w-full bg-white/10 border border-white/10 rounded-2xl p-4 text-white font-bold placeholder:text-zinc-700 outline-none focus:border-brand-yellow transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="py-4 rounded-2xl bg-zinc-800 text-zinc-500 font-black uppercase tracking-widest text-[10px] hover:bg-zinc-700 transition-colors"
                >
                  Skip Now
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className={`py-4 rounded-2xl text-brand-brown font-black uppercase tracking-widest text-[10px] shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 ${isExisting ? 'bg-mountain-green shadow-green-900/10' : 'bg-brand-yellow shadow-yellow-900/10'}`}
                >
                  {isExisting ? 'Update Profile' : 'Register Explorer'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NewCustomerModal;
