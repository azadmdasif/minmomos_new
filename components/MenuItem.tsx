
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-peak-amber">{item.category}</p>
          <h3 className="font-bold text-sm lg:text-base leading-tight drop-shadow-md">{item.name}</h3>
        </div>
      </div>
      <div className="p-3 flex justify-between items-center bg-white">
        <span className="text-mountain-green font-black text-lg">₹{minPrice}</span>
        <div className="w-8 h-8 rounded-full bg-mist-stone flex items-center justify-center group-hover:bg-mountain-green group-hover:text-white transition-colors">
          <span className="text-xl font-bold">+</span>
        </div>
      </div>
    </button>
  );
};

export default MenuItem;
