
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

interface CelebrationOverlayProps {
  isVisible: boolean;
  tierName: string;
  onClose: () => void;
}

const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({ isVisible, tierName, onClose }) => {
  React.useEffect(() => {
    if (isVisible) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        // since particles fall down, start a bit higher than random
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      const timeout = setTimeout(() => {
        onClose();
      }, 5000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 20 }}
            className="bg-white rounded-[3rem] p-12 text-center max-w-sm w-full shadow-2xl relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-2 bg-brand-yellow"></div>
            
            <div className="mb-6 text-6xl">🏔️</div>
            
            <h2 className="text-3xl font-black text-brand-brown uppercase italic leading-tight mb-2">
              Level <span className="text-brand-red">Up!</span>
            </h2>
            
            <p className="text-stone-400 font-bold uppercase tracking-widest text-[10px] mb-6">
              You've conquered the climb to
            </p>
            
            <div className="bg-brand-brown text-brand-yellow py-4 px-8 rounded-2xl inline-block mb-8 shadow-xl transform -rotate-2">
              <span className="text-2xl font-black uppercase italic">{tierName} Stage</span>
            </div>
            
            <div className="bg-brand-stone p-6 rounded-3xl mb-8">
              <p className="text-brand-brown font-black text-sm mb-2">🎁 Celebratory Gift Added!</p>
              <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">A Free Campa Cola has been added to your order</p>
            </div>
            
            <button 
              onClick={onClose}
              className="w-full bg-mountain-green text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:scale-105 active:scale-95 transition-all"
            >
              Continue the Climb
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CelebrationOverlay;
