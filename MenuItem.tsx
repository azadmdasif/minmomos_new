
import React, { useMemo } from 'react';
import { MenuItem as MenuItemType } from './types';

interface MenuItemProps {
  item: MenuItemType;
  onSelectItem: (item: MenuItemType) => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ item, onSelectItem }) => {
  const { minPrice, isSinglePrice } = useMemo(() => {
    const validPrices = Object.values(item.preparations)
      .flatMap(sizes => Object.values(sizes))
      .filter(price => price > 0);
      
    if (validPrices.length === 0) {
      return { minPrice: 0, isSinglePrice: true };
    }
    
    const uniquePrices = new Set(validPrices);
    const min = Math.min(...uniquePrices);
    
    return {
      minPrice: min,
      isSinglePrice: uniquePrices.size === 1,
    };
  }, [item]);

  return (
    <div 
      className="bg-white rounded-lg shadow-md cursor-pointer transform hover:scale-105 transition-transform duration-200 flex flex-col overflow-hidden border border-brand-brown/10"
      onClick={() => onSelectItem(item)}
      aria-label={`Select options for ${item.name}`}
    >
      <img src={item.image} alt={item.name} className="w-full h-24 sm:h-32 object-cover" />
      <div className="p-3 flex flex-col flex-grow">
        <h3 className="font-semibold text-sm sm:text-base text-brand-brown flex-grow">{item.name}</h3>
        <p className="text-brand-brown/60 text-xs mt-1">Select options</p>
        <p className="text-brand-red font-bold mt-2">
            {isSinglePrice ? `₹${minPrice.toFixed(2)}` : `From ₹${minPrice.toFixed(2)}`}
        </p>
      </div>
    </div>
  );
};

export default MenuItem;