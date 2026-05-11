
import React, { useMemo, useState } from 'react';
import { CompletedOrder } from '../types';
import ItemCategoryPieChart from './ItemCategoryPieChart';
import { Truck, Scissors, LayoutGrid, Filter, Utensils, ShoppingBag, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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
  dineInQty: number;
  takeawayQty: number;
  deliveryQty: number;
}

type SortKey = 'name' | 'quantity' | 'revenue' | 'cogs' | 'profit';
type SortDirection = 'ascending' | 'descending';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

const ItemSalesReport: React.FC<ItemSalesReportProps> = ({ orders }) => {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);
  const [isSplit, setIsSplit] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'profit', direction: 'descending' });

  const toggleChannel = (channel: string) => {
    setSelectedChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel) 
        : [...prev, channel]
    );
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => selectedChannels.includes(o.type));
  }, [orders, selectedChannels]);

  const salesData = useMemo<SalesData[]>(() => {
    const itemMap = new Map<string, { 
      name: string; 
      quantity: number; 
      revenue: number; 
      cogs: number;
      dineInQty: number;
      takeawayQty: number;
      deliveryQty: number;
    }>();

    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        const itemRevenue = item.price * item.quantity;
        const itemCogs = (item.cost ?? 0) * item.quantity;
        const existing = itemMap.get(item.name);

        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += itemRevenue;
          existing.cogs += itemCogs;
          if (order.type === 'DINE_IN') existing.dineInQty += item.quantity;
          if (order.type === 'TAKEAWAY') existing.takeawayQty += item.quantity;
          if (order.type === 'DELIVERY') existing.deliveryQty += item.quantity;
        } else {
          itemMap.set(item.name, {
            name: item.name,
            quantity: item.quantity,
            revenue: itemRevenue,
            cogs: itemCogs,
            dineInQty: order.type === 'DINE_IN' ? item.quantity : 0,
            takeawayQty: order.type === 'TAKEAWAY' ? item.quantity : 0,
            deliveryQty: order.type === 'DELIVERY' ? item.quantity : 0,
          });
        }
      });
    });
    
    return Array.from(itemMap.entries()).map(([name, data]) => ({ 
        id: name, // Using name as ID for grouping display
        ...data,
        profit: data.revenue - data.cogs,
    }));
  }, [filteredOrders]);

  const chartData = useMemo(() => {
    return [...salesData].sort((a, b) => b.quantity - a.quantity).slice(0, 15);
  }, [salesData]);

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

  const totalSalesRevenue = useMemo(() => {
    return salesData.reduce((acc, curr) => acc + curr.revenue, 0);
  }, [salesData]);

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-6 bg-white p-6 rounded-[3rem] shadow-xl border border-brand-stone">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => toggleChannel('DINE_IN')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
              selectedChannels.includes('DINE_IN') 
                ? 'bg-[#10B981] text-white border-[#10B981] shadow-lg scale-105' 
                : 'bg-white text-brand-brown/40 border-brand-stone hover:border-[#10B981]/30'
            }`}
          >
            <Utensils className="w-4 h-4" />
            Dine In
          </button>

          <button
            onClick={() => toggleChannel('TAKEAWAY')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
              selectedChannels.includes('TAKEAWAY') 
                ? 'bg-[#3B82F6] text-white border-[#3B82F6] shadow-lg scale-105' 
                : 'bg-white text-brand-brown/40 border-brand-stone hover:border-[#3B82F6]/30'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Takeaway
          </button>

          <button
            onClick={() => toggleChannel('DELIVERY')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
              selectedChannels.includes('DELIVERY') 
                ? 'bg-[#E11D48] text-white border-[#E11D48] shadow-lg scale-105' 
                : 'bg-white text-brand-brown/40 border-brand-stone hover:border-[#E11D48]/30'
            }`}
          >
            <Truck className="w-4 h-4" />
            Delivery
          </button>

          <div className="w-[2px] h-8 bg-brand-stone mx-2" />

          <button
            onClick={() => setIsSplit(!isSplit)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
              isSplit 
                ? 'bg-brand-red text-white border-brand-red shadow-lg' 
                : 'bg-white text-brand-brown/40 border-brand-stone hover:border-brand-brown/30'
            }`}
          >
            {isSplit ? <LayoutGrid className="w-4 h-4" /> : <Scissors className="w-4 h-4" />}
            {isSplit ? 'Unified View' : 'Split Charts'}
          </button>
        </div>

        <div className="flex items-center gap-2 text-brand-brown/30 italic text-[10px] font-bold uppercase tracking-tight">
          <Filter className="w-3 h-3" />
          Analyzing {filteredOrders.length} orders
        </div>
      </div>

      {/* Stacked Quantity Bar Chart */}
      <div className="bg-white rounded-[3rem] shadow-xl p-10 border border-brand-stone">
        <div className="flex items-center gap-3 mb-8">
           <BarChart3 className="w-6 h-6 text-brand-red" />
           <div>
             <h3 className="text-2xl font-black text-brand-brown uppercase italic tracking-tighter">Quantity <span className="text-brand-red">Distribution</span></h3>
             <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">Item sales volume split by channel</p>
           </div>
        </div>
        
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                interval={0}
                height={80}
                tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 900 }}
              />
              <YAxis tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 900 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1A1817', 
                  border: 'none', 
                  borderRadius: '1rem',
                  color: '#fff',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                }}
                itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
                cursor={{ fill: '#F3F4F6' }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" />
              {selectedChannels.includes('DINE_IN') && (
                <Bar dataKey="dineInQty" name="Dine In" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
              )}
              {selectedChannels.includes('TAKEAWAY') && (
                <Bar dataKey="takeawayQty" name="Takeaway" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
              )}
              {selectedChannels.includes('DELIVERY') && (
                <Bar dataKey="deliveryQty" name="Delivery" stackId="a" fill="#E11D48" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Visual Analytics */}
      <div className={`grid gap-12 ${isSplit ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {!isSplit ? (
          <ItemCategoryPieChart orders={filteredOrders} title="Performance Overview" />
        ) : (
          <>
            <ItemCategoryPieChart 
              orders={filteredOrders.filter(o => o.type === 'DINE_IN')} 
              title="Dine In"
              colorTheme="#10B981" 
            />
            <ItemCategoryPieChart 
              orders={filteredOrders.filter(o => o.type === 'TAKEAWAY')} 
              title="Takeaway"
              colorTheme="#3B82F6"
            />
            <ItemCategoryPieChart 
              orders={filteredOrders.filter(o => o.type === 'DELIVERY')} 
              title="Delivery"
              colorTheme="#E11D48"
              disabled={!selectedChannels.includes('DELIVERY')}
            />
          </>
        )}
      </div>

      <div className="bg-white rounded-[3rem] shadow-xl p-10 border border-brand-stone overflow-hidden">
      <h3 className="text-2xl font-black text-brand-brown italic uppercase mb-8 tracking-tighter">Inventory <span className="text-brand-red">Velocity</span></h3>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-brand-brown/5 text-[10px] text-brand-brown/40 font-black uppercase tracking-widest">
            <tr>
              <SortableHeader label="Item Name" sortKey="name" />
              <SortableHeader label="Qty Sold" sortKey="quantity" align="center" />
              <SortableHeader label="Total Rev" sortKey="revenue" align="right" />
              <th scope="col" className="px-4 py-3 text-right border-b-2 border-brand-stone text-brand-brown/40 font-black uppercase tracking-widest text-[10px]">Share %</th>
              <SortableHeader label="Total Cost" sortKey="cogs" align="right" />
              <SortableHeader label="Gross Prof" sortKey="profit" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-stone">
            {sortedSalesData.map(item => (
              <tr key={item.id} className="hover:bg-brand-cream/50 transition-colors">
                <td className="px-4 py-6 font-black text-brand-brown">{item.name}</td>
                <td className="px-4 py-6 text-center font-bold text-brand-brown/60 italic">{item.quantity} units</td>
                <td className="px-4 py-6 text-right font-black text-brand-brown">₹{item.revenue.toFixed(2)}</td>
                <td className="px-4 py-6 text-right font-bold text-brand-red italic text-xs">
                  {totalSalesRevenue > 0 ? ((item.revenue / totalSalesRevenue) * 100).toFixed(1) : 0}%
                </td>
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
    </div>
  );
};

export default ItemSalesReport;
