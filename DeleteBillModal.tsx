import React, { useState, useEffect } from 'react';

interface DeleteBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  billNumber: number | null;
}

const DeleteBillModal: React.FC<DeleteBillModalProps> = ({ isOpen, onClose, onConfirm, billNumber }) => {
  const [reason, setReason] = useState('');

  // Reset reason when modal opens for a new bill
  useEffect(() => {
    if (isOpen) {
      setReason('');
    }
  }, [isOpen]);

  if (!isOpen || billNumber === null) return null;

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
    }
  };

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
          <h2 className="text-xl font-bold mb-4">Delete Bill #{billNumber}</h2>
          <div className="text-brand-brown/80 mb-4">
            <label htmlFor="delete-reason" className="block text-sm font-medium mb-2">Please provide a reason for deleting this bill:</label>
            <textarea
              id="delete-reason"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full bg-brand-brown/5 text-brand-brown rounded-md p-2 border border-brand-brown/20 focus:outline-none focus:ring-2 focus:ring-brand-red"
              placeholder="e.g., Customer cancelled, wrong items added..."
            />
          </div>
        </div>
        <div className="bg-brand-brown/5 p-4 flex justify-end gap-4 rounded-b-lg border-t border-brand-brown/10">
          <button onClick={onClose} className="bg-brand-brown/10 hover:bg-brand-brown/20 font-bold py-2 px-4 rounded-lg transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleConfirm} 
            disabled={!reason.trim()}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-red-300 disabled:cursor-not-allowed"
          >
            Confirm Deletion
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteBillModal;