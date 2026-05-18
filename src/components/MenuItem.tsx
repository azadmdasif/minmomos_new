
import React, { useMemo } from 'react';
import { MenuItem as MenuItemType } from '../types';

interface MenuItemProps {
  item: MenuItemType;
  onSelectItem: (item: MenuItemType) => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ item, onSelectItem }) => {
  const minPrice = useMemo(() => {
    const prices = Object.values(item.preparations).flatMap(s => Object.values(s)).filter(p => p && p > 0);
    return Math.min(...prices as number[]);
  }, [item]);

  return (
    <button 
      className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 text-left overflow-hidden group border border-stone-200"
      onClick={() => onSelectItem(item)}
    >
      <div className="relative aspect-video overflow-hidden">
        <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
        <div className="absolute top-2 left-2">
          <span className="px-2 py-0.5 rounded-full bg-brand-brown/40 backdrop-blur-sm text-white text-[10px] font-black uppercase tracking-widest">
            {item.category}
          </span>
        </div>
      </div>
      <div className="p-3 flex flex-col flex-grow bg-white">
        <h3 className="font-bold text-sm lg:text-base leading-tight mb-3 text-brand-brown line-clamp-2 min-h-[2.5rem]">
          {item.name}
        </h3>
        <div className="flex justify-between items-center mt-auto">
          <span className="text-mountain-green font-black text-lg">₹{minPrice}</span>
          <div className="w-8 h-8 rounded-full bg-brand-stone flex items-center justify-center group-hover:bg-mountain-green group-hover:text-white transition-colors">
            <span className="text-xl font-bold">+</span>
          </div>
        </div>
      </div>
    </button>
  );
};

export default MenuItem;
