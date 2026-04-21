import React, { useMemo, useState } from 'react';
import { CompletedOrder } from './types';

interface ItemSalesReportProps {
  orders: CompletedOrder[];
}

interface SalesData {
  id: string;
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
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number; cogs: number }>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const itemRevenue = item.price * item.quantity;
        const itemCogs = (item.cost ?? 0) * item.quantity;
        const existing = itemMap.get(item.id);

        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += itemRevenue;
          existing.cogs += itemCogs;
        } else {
          itemMap.set(item.id, {
            name: item.name,
            quantity: item.quantity,
            revenue: itemRevenue,
            cogs: itemCogs,
          });
        }
      });
    });
    
    return Array.from(itemMap.entries()).map(([id, data]) => ({ 
        id, 
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
  
  const SortableHeader = ({ label, sortKey }: { label: string, sortKey: SortKey }) => {
    const getSortIndicator = () => {
      if (sortConfig.key !== sortKey) return ' ↕';
      return sortConfig.direction === 'descending' ? ' ▼' : ' ▲';
    };
    return (
        <th scope="col" className="px-4 py-3 cursor-pointer select-none" onClick={() => requestSort(sortKey)}>
            {label} {getSortIndicator()}
        </th>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-6 border border-brand-brown/10">
      <h3 className="text-xl font-semibold mb-4 border-b border-brand-brown/10 pb-2">Item Sales & Profit Report</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-brand-brown/5 text-xs text-brand-brown/60 uppercase">
            <tr>
              <SortableHeader label="Item Name" sortKey="name" />
              <th scope="col" className="px-4 py-3 text-center cursor-pointer select-none" onClick={() => requestSort('quantity')}>
                Qty Sold {sortConfig.key === 'quantity' ? (sortConfig.direction === 'descending' ? '▼' : '▲') : '↕'}
              </th>
              <th scope="col" className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => requestSort('revenue')}>
                Total Revenue {sortConfig.key === 'revenue' ? (sortConfig.direction === 'descending' ? '▼' : '▲') : '↕'}
              </th>
              <th scope="col" className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => requestSort('cogs')}>
                Total Cost {sortConfig.key === 'cogs' ? (sortConfig.direction === 'descending' ? '▼' : '▲') : '↕'}
              </th>
              <th scope="col" className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => requestSort('profit')}>
                Gross Profit {sortConfig.key === 'profit' ? (sortConfig.direction === 'descending' ? '▼' : '▲') : '↕'}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedSalesData.map(item => (
              <tr key={item.id} className="border-b border-brand-brown/10 hover:bg-brand-brown/5">
                <td className="px-4 py-3 font-medium text-brand-brown">{item.name}</td>
                <td className="px-4 py-3 text-center">{item.quantity}</td>
                <td className="px-4 py-3 text-right font-semibold">₹{item.revenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold text-brand-red">₹{item.cogs.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-600">₹{item.profit.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedSalesData.length === 0 && <p className="text-center py-8 text-brand-brown/60">No sales data found for this date range.</p>}
      </div>
    </div>
  );
};

export default ItemSalesReport;