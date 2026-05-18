
import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, PreparationType, Size } from '../types';

interface VariantSelectionModalProps {
  item: MenuItem | null;
  onClose: () => void;
  onAddItem: (items: OrderItem[]) => void;
  customerPhone?: string;
}

const formatPrepName = (prep: string) => {
  return prep.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const VariantSelectionModal: React.FC<VariantSelectionModalProps> = ({ item, onClose, onAddItem }) => {
  const [selectedPrep, setSelectedPrep] = useState<PreparationType>('steamed');
  const [selectedSize, setSelectedSize] = useState<Size>('medium');
  const [quantity, setQuantity] = useState(1);

  const { isSingleVariant, availablePreps } = useMemo(() => {
    if (!item) return { isSingleVariant: false, availablePreps: [] };

    const prices = new Set<number>();
    const preps: PreparationType[] = [];

    const PREP_ORDER: PreparationType[] = ['steamed', 'fried', 'pan-fried', 'peri-peri', 'normal'];

    for (const prep in item.preparations) {
      const prepKey = prep as PreparationType;
      const prepData = item.preparations[prepKey];
      
      if (prepData) {
        let hasAnyValidPrice = false;
        for (const size in prepData) {
          const sizeKey = size as Size;
          const price = prepData[sizeKey];
          if (price !== undefined && price !== -1 && price > 0) {
            prices.add(price);
            hasAnyValidPrice = true;
          }
        }
        if (hasAnyValidPrice) {
          preps.push(prepKey);
        }
      }
    }
    
    return {
      isSingleVariant: prices.size === 1,
      availablePreps: [...new Set(preps)].sort((a, b) => {
        const indexA = PREP_ORDER.indexOf(a);
        const indexB = PREP_ORDER.indexOf(b);
        return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
      })
    };
  }, [item]);

  const availableSizes = useMemo(() => {
    if (!item) return [];
    const sizes: Size[] = [];
    const SIZE_ORDER: Size[] = ['small', 'medium', 'large'];
    const prepData = item.preparations[selectedPrep];
    
    if (prepData) {
      for (const size in prepData) {
        const sizeKey = size as Size;
        const price = prepData[sizeKey];
        if (price !== undefined && price !== -1 && price > 0) {
          sizes.push(sizeKey);
        }
      }
    }
    
    return sizes.sort((a, b) => {
      return SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b);
    });
  }, [item, selectedPrep]);


  // Reset state when a new item is selected or prep changes
  useEffect(() => {
    if (item) {
      if (!availablePreps.includes(selectedPrep) && availablePreps.length > 0) {
        setSelectedPrep(availablePreps[0]);
      }
    }
  }, [item, availablePreps, selectedPrep]);

  useEffect(() => {
    if (item && availableSizes.length > 0) {
      if (!availableSizes.includes(selectedSize)) {
        // Try to select medium if available, otherwise first available
        setSelectedSize(availableSizes.includes('medium') ? 'medium' : availableSizes[0]);
      }
    }
  }, [item, availableSizes, selectedSize]);
  
  useEffect(() => {
    if (item) {
      setQuantity(1);
    }
  }, [item]);
  
  const currentPrice = useMemo(() => {
    if (!item) return 0;
    return item.preparations[selectedPrep]?.[selectedSize] ?? 0;
  }, [item, selectedPrep, selectedSize]);

  // FIX: Calculate the cost for the selected item variant.
  const currentCost = useMemo(() => {
    if (!item || !item.costs) return 0;
    return item.costs[selectedPrep]?.[selectedSize] ?? 0;
  }, [item, selectedPrep, selectedSize]);

  const minCoinsPrice = useMemo(() => {
    if (!item || !item.minCoinsPrices) {
      return 0;
    }
    
    const pricesObj: any = item.minCoinsPrices;
    const prepPrices = pricesObj[selectedPrep];
    
    if (!prepPrices) {
      return 0;
    }
    
    const price = prepPrices[selectedSize];
    return typeof price === 'number' ? price : 0;
  }, [item, selectedPrep, selectedSize]);

  if (!item) return null;

  const handleAddItem = () => {
    let name = item.name;
    // If there are multiple variants, construct a descriptive name
    if (!isSingleVariant) {
        const sizeText = selectedSize.charAt(0).toUpperCase() + selectedSize.slice(1);
        // Only add preparation to the name if there's more than one option
        if (availablePreps.length > 1) {
            const prepText = formatPrepName(selectedPrep);
            name = `${prepText} ${item.name} (${sizeText})`;
        } else {
            // Don't add "Normal" to the name for items like Tandoori
             name = `${item.name} (${sizeText})`;
        }
    }

    const momoOrderItem: OrderItem = {
      id: isSingleVariant ? item.id : `${item.id}-${selectedPrep}-${selectedSize}-sale`,
      menuItemId: item.id,
      name: name,
      price: currentPrice,
      cost: currentCost,
      quantity: quantity,
      paidWithCoins: false,
      coinsPrice: minCoinsPrice || 0
    };
    
    onAddItem([momoOrderItem]);
    onClose();
  };

  const handleQuantityChange = (amount: number) => {
    setQuantity(prev => Math.max(1, prev + amount));
  };

  const totalItemPrice = currentPrice * quantity;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="bg-brand-cream rounded-lg shadow-2xl w-full max-w-md text-brand-brown overflow-hidden"
        onClick={e => e.stopPropagation()} // Prevent closing modal when clicking inside
      >
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-2">{item.name}</h2>
          <img src={item.image} alt={item.name} className="w-full h-48 object-cover rounded-md mb-4"/>

          {!isSingleVariant && (
            <>
              {availablePreps.length > 1 && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Preparation</h3>
                  <div className="flex gap-2">
                    {availablePreps.map(prep => (
                      <button
                        key={prep}
                        onClick={() => setSelectedPrep(prep)}
                        className={`flex-1 py-2 rounded-lg transition-colors font-semibold ${selectedPrep === prep ? 'bg-brand-red text-white border border-brand-red' : 'bg-white text-brand-brown border border-brand-brown/30 hover:bg-brand-brown/5'}`}
                      >
                        {formatPrepName(prep)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <h3 className="font-semibold mb-2">Size</h3>
                <div className="flex gap-2">
                  {availableSizes.map(size => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`flex-1 py-2 rounded-lg transition-colors font-semibold ${selectedSize === size ? 'bg-brand-red text-white border border-brand-red' : 'bg-white text-brand-brown border border-brand-brown/30 hover:bg-brand-brown/5'}`}
                    >
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="mb-6">
            <h3 className="font-semibold mb-2 text-center">Quantity</h3>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => handleQuantityChange(-1)}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
                className="w-12 h-12 text-2xl font-bold bg-brand-brown/10 hover:bg-brand-brown/20 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
              >
                -
              </button>
              <span className="text-3xl font-bold w-16 text-center" aria-live="polite">{quantity}</span>
              <button
                onClick={() => handleQuantityChange(1)}
                aria-label="Increase quantity"
                className="w-12 h-12 text-2xl font-bold bg-brand-brown/10 hover:bg-brand-brown/20 rounded-full flex items-center justify-center transition-colors"
              >
                +
              </button>
            </div>
          </div>
          
          <div className="flex justify-between items-center border-t border-brand-brown/10 pt-4">
            <div>
              <p className="text-sm text-brand-brown/70">Total Price</p>
              <span className="text-3xl font-bold text-brand-red">
                ₹{totalItemPrice.toFixed(2)}
              </span>
            </div>
            <button 
              onClick={handleAddItem}
              className="bg-brand-red hover:bg-brand-red/90 text-white font-bold py-3 px-6 rounded-lg transition-colors text-lg"
            >
              Add to Bill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VariantSelectionModal;
