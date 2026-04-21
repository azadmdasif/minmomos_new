
import React, { useMemo, useState } from 'react';
import { CompletedOrder } from '../types';

interface ItemSalesReportProps {
  orders: CompletedOrder[];
}

interface SalesData {
  id: string; // Grouping identifier (usually menuItemId or Name)
  name: string;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
}

type SortKey = 'name' | 'quantity' | 'revenue' | 'cogs' | 'profit';
type SortDirection = 'ascending' | 'descending';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

const ItemSalesReport: React.FC<ItemSalesReportProps> = ({ orders }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'profit', direction: 'descending' });

  const salesData = useMemo<SalesData[]>(() => {
    // FIX: Group by name so that variant sales and add-ons are aggregated correctly
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number; cogs: number }>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const itemRevenue = item.price * item.quantity;
        const itemCogs = (item.cost ?? 0) * item.quantity;
        // Grouping by name ensures that "Chicken Momo (Large)" across all bills is summed together
        const existing = itemMap.get(item.name);

        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += itemRevenue;
          existing.cogs += itemCogs;
        } else {
          itemMap.set(item.name, {
            name: item.name,
            quantity: item.quantity,
            revenue: itemRevenue,
            cogs: itemCogs,
          });
        }
      });
    });
    
    return Array.from(itemMap.entries()).map(([name, data]) => ({ 
        id: name, // Using name as ID for grouping display
        ...data,
        profit: data.revenue - data.cogs,
    }));
  }, [orders]);

  const sortedSalesData = useMemo(() => {
    let sortableItems = [...salesData];
    sortableItems.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
    return sortableItems;
  }, [salesData, sortConfig]);
  
  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    } else if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) {
        return ' ↕';
    }
    return sortConfig.direction === 'descending' ? ' ▼' : ' ▲';
  };

  const SortableHeader = ({ label, sortKey, align = 'left' }: { label: string; sortKey: SortKey, align?: 'left' | 'center' | 'right' }) => (
    <th
      scope="col"
      className={`px-4 py-3 cursor-pointer select-none text-${align} border-b-2 border-brand-stone transition-colors hover:bg-brand-brown/5`}
      onClick={() => requestSort(sortKey)}
    >
      {label} {getSortIndicator(sortKey)}
    </th>
  );

  return (
    <div className="bg-white rounded-[3rem] shadow-xl p-10 mt-6 border border-brand-stone overflow-hidden">
      <h3 className="text-2xl font-black text-brand-brown italic uppercase mb-8 tracking-tighter">Inventory <span className="text-brand-red">Velocity</span></h3>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-brand-brown/5 text-[10px] text-brand-brown/40 font-black uppercase tracking-widest">
            <tr>
              <SortableHeader label="Item Name" sortKey="name" />
              <SortableHeader label="Qty Sold" sortKey="quantity" align="center" />
              <SortableHeader label="Total Revenue" sortKey="revenue" align="right" />
              <SortableHeader label="Total Cost" sortKey="cogs" align="right" />
              <SortableHeader label="Gross Profit" sortKey="profit" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-stone">
            {sortedSalesData.map(item => (
              <tr key={item.id} className="hover:bg-brand-cream/50 transition-colors">
                <td className="px-4 py-6 font-black text-brand-brown">{item.name}</td>
                <td className="px-4 py-6 text-center font-bold text-brand-brown/60 italic">{item.quantity} units</td>
                <td className="px-4 py-6 text-right font-black text-brand-brown">₹{item.revenue.toFixed(2)}</td>
                <td className="px-4 py-6 text-right font-bold text-brand-red/60">₹{item.cogs.toFixed(2)}</td>
                <td className="px-4 py-6 text-right font-black text-emerald-600 text-lg">₹{item.profit.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedSalesData.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-brand-brown/20 font-black uppercase text-xs tracking-widest">No Sales Data for this Peak</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemSalesReport;
