
import React from 'react';
import { MenuItem as MenuItemType } from '../types';
import MenuItem from './MenuItem';

interface MenuProps {
  menuItems: MenuItemType[];
  onSelectItem: (item: MenuItemType) => void;
}

const Menu: React.FC<MenuProps> = ({ menuItems, onSelectItem }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-6">
      {menuItems.map((item) => (
        <MenuItem key={item.id} item={item} onSelectItem={onSelectItem} />
      ))}
    </div>
  );
};

export default Menu;
