
import React from 'react';
import { MenuItem as MenuItemType } from './types';
import MenuItem from './MenuItem';

interface MenuProps {
  menuItems: MenuItemType[];
  onSelectItem: (item: MenuItemType) => void;
}

const Menu: React.FC<MenuProps> = ({ menuItems, onSelectItem }) => {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-brand-brown/90">Menu</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {menuItems.map((item) => (
          <MenuItem key={item.id} item={item} onSelectItem={onSelectItem} />
        ))}
      </div>
    </div>
  );
};

export default Menu;