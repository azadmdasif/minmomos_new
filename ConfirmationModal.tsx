import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, children }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-brand-cream rounded-lg shadow-2xl w-full max-w-md text-brand-brown"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">{title}</h2>
          <div className="text-brand-brown/80">{children}</div>
        </div>
        <div className="bg-brand-brown/5 p-4 flex justify-end gap-4 rounded-b-lg border-t border-brand-brown/10">
          <button onClick={onClose} className="bg-brand-brown/10 hover:bg-brand-brown/20 font-bold py-2 px-4 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;