import React from 'react';

interface BranchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBranch: (branchName: string) => void;
  branches: string[];
  isInitialSelection: boolean;
}

const BranchSelectionModal: React.FC<BranchSelectionModalProps> = ({ isOpen, onClose, onSelectBranch, branches, isInitialSelection }) => {
  if (!isOpen) {
    return null;
  }

  const handleOverlayClick = () => {
    if (!isInitialSelection) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-brand-cream rounded-lg shadow-2xl w-full max-w-sm text-brand-brown overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4 text-center">
            {isInitialSelection ? 'Select Your Branch' : 'Change Branch'}
          </h2>
          <p className="text-center text-brand-brown/70 text-sm mb-6">
            {isInitialSelection 
              ? 'Please select the branch you are operating from to continue.' 
              : 'Select a new branch to associate with new orders.'}
          </p>
          <div className="space-y-3">
            {branches.map(branch => (
              <button
                key={branch}
                onClick={() => onSelectBranch(branch)}
                className="w-full bg-brand-red hover:bg-brand-red/90 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                {branch}
              </button>
            ))}
          </div>
        </div>
        {!isInitialSelection && (
          <div className="bg-brand-brown/5 p-4 border-t border-brand-brown/10">
            <button
              onClick={onClose}
              className="w-full bg-brand-brown/10 hover:bg-brand-brown/20 text-brand-brown font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchSelectionModal;