import React from 'react';
import { 
  GraduationCap, 
  X, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Percent, 
  Award, 
  CheckCircle2,
  UtensilsCrossed
} from 'lucide-react';

export interface StudentSegmentMetrics {
  totalEnrolledStudents: number;
  newStudentEnrolments: number;
  totalPeriodRevenue: number;
  studentRevenue: number;
  studentRevenueShare: number;
  regularRevenue: number;
  studentOrders: number;
  studentPaidOrders: number;
  studentFreePromoOrders: number;
  regularOrders: number;
  studentOrdersShare: number;
  studentAov: number;
  regularAov: number;
  overallAov: number;
  studentGrossProfit: number;
  studentCogs: number;
  studentGrossMargin: number;
  studentRetentionRate: number;
  regularRetentionRate: number;
  repeatStudents: number;
  studentDineInPct: number;
  studentTakeawayPct: number;
  studentDeliveryPct: number;
  topStudentItems: Array<{ name: string; quantity: number; revenue: number }>;
  totalAllCustomers?: number;
  totalRegularCustomers?: number;
}

export interface StudentIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: StudentSegmentMetrics;
  startDate?: string;
  endDate?: string;
  segmentFilter?: 'ALL' | 'STUDENT' | 'REGULAR';
  onSetSegmentFilter?: (filter: 'ALL' | 'STUDENT' | 'REGULAR') => void;
  onSelectSegment?: (filter: 'ALL' | 'STUDENT' | 'REGULAR') => void;
}

export const StudentIntelligenceModal: React.FC<StudentIntelligenceModalProps> = ({
  isOpen,
  onClose,
  metrics,
  startDate = '',
  endDate = '',
  segmentFilter = 'ALL',
  onSetSegmentFilter,
  onSelectSegment
}) => {
  if (!isOpen) return null;

  const handleFilterChange = (filter: 'ALL' | 'STUDENT' | 'REGULAR') => {
    if (onSelectSegment) onSelectSegment(filter);
    if (onSetSegmentFilter) onSetSegmentFilter(filter);
  };

  const isFilteredToStudents = segmentFilter === 'STUDENT';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 lg:p-10 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={onClose} />

      <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-8 lg:p-10 border-4 border-brand-brown shadow-2xl relative z-10 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-brand-stone">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-black text-brand-brown uppercase italic tracking-tighter">
                  Student <span className="text-emerald-700">Intelligence Hub</span>
                </h3>
                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border border-emerald-300">
                  Segment Analytics
                </span>
              </div>
              <p className="text-[10px] font-bold text-brand-brown/50 uppercase tracking-widest mt-0.5">
                Cohort &amp; Behavior Analysis for {startDate} &rarr; {endDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => {
                handleFilterChange(isFilteredToStudents ? 'ALL' : 'STUDENT');
              }}
              className={`px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm cursor-pointer ${
                isFilteredToStudents
                  ? 'bg-emerald-800 text-white ring-2 ring-emerald-400'
                  : 'bg-brand-brown text-brand-yellow hover:bg-brand-brown/90'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>{isFilteredToStudents ? 'Dashboard: Students Only (Active)' : 'Filter Dashboard to Students'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2.5 rounded-full hover:bg-brand-stone/30 text-brand-brown/60 hover:text-brand-brown transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 pt-6 pb-2">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Revenue */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100/60 p-5 rounded-[2rem] border border-amber-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase text-amber-900/60 tracking-wider">Student Revenue</span>
                <DollarSign className="w-4 h-4 text-amber-700" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-amber-950 tracking-tight">
                ₹{metrics.studentRevenue.toLocaleString()}
              </p>
              <p className="text-[9px] font-bold text-amber-800/70 mt-1">
                {metrics.studentRevenueShare.toFixed(1)}% of total period revenue
              </p>
            </div>

            {/* New Enrolments */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-5 rounded-[2rem] border border-emerald-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase text-emerald-900/60 tracking-wider">New Enrolments</span>
                <Users className="w-4 h-4 text-emerald-700" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-emerald-950 tracking-tight">
                +{metrics.newStudentEnrolments}
              </p>
              <p className="text-[9px] font-bold text-emerald-800/70 mt-1">
                {metrics.totalEnrolledStudents} total registered students
              </p>
            </div>

            {/* Student AOV */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/60 p-5 rounded-[2rem] border border-indigo-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase text-indigo-900/60 tracking-wider">Student AOV</span>
                <TrendingUp className="w-4 h-4 text-indigo-700" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-indigo-950 tracking-tight">
                ₹{metrics.studentAov}
              </p>
              <p className="text-[9px] font-bold text-indigo-800/70 mt-1">
                vs ₹{metrics.regularAov} regular customer AOV
              </p>
            </div>

            {/* Student Retention */}
            <div className="bg-gradient-to-br from-rose-50 to-rose-100/60 p-5 rounded-[2rem] border border-rose-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase text-rose-900/60 tracking-wider">Student Retention</span>
                <Percent className="w-4 h-4 text-rose-700" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-rose-950 tracking-tight">
                {metrics.studentRetentionRate.toFixed(1)}%
              </p>
              <p className="text-[9px] font-bold text-rose-800/70 mt-1">
                {metrics.repeatStudents} repeat students ({metrics.regularRetentionRate.toFixed(1)}% regular)
              </p>
            </div>
          </div>

          {/* Segment Comparison Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Financial Performance Table */}
            <div className="lg:col-span-2 bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black uppercase text-brand-brown tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-brand-red" />
                  Side-By-Side Parameter Comparison
                </h4>
                <span className="text-[9px] font-bold text-brand-brown/40 uppercase">
                  Students vs Regular Customers
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-brand-stone text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">
                      <th className="py-2.5 px-3">Metric Parameter</th>
                      <th className="py-2.5 px-3 text-emerald-800 bg-emerald-50/50 rounded-t-xl">🎓 Student Segment</th>
                      <th className="py-2.5 px-3 text-brand-brown/70">👤 Regular Segment</th>
                      <th className="py-2.5 px-3 text-brand-brown font-black">Overall Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-stone/60 font-medium text-brand-brown">
                    <tr>
                      <td className="py-2.5 px-3 font-black text-[11px]">Period Revenue</td>
                      <td className="py-2.5 px-3 font-black text-emerald-800 bg-emerald-50/30">
                        ₹{metrics.studentRevenue.toLocaleString()} ({metrics.studentRevenueShare.toFixed(1)}%)
                      </td>
                      <td className="py-2.5 px-3">₹{metrics.regularRevenue.toLocaleString()}</td>
                      <td className="py-2.5 px-3 font-bold">₹{metrics.totalPeriodRevenue.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-black text-[11px]">Total Orders</td>
                      <td className="py-2.5 px-3 font-black text-emerald-800 bg-emerald-50/30">
                        {metrics.studentOrders} ({metrics.studentPaidOrders} paid + {metrics.studentFreePromoOrders} promos)
                      </td>
                      <td className="py-2.5 px-3">{metrics.regularOrders} orders</td>
                      <td className="py-2.5 px-3 font-bold">{metrics.studentOrders + metrics.regularOrders} orders</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-black text-[11px]">Average Order Value (AOV)</td>
                      <td className="py-2.5 px-3 font-black text-emerald-800 bg-emerald-50/30">
                        ₹{metrics.studentAov}
                      </td>
                      <td className="py-2.5 px-3">₹{metrics.regularAov}</td>
                      <td className="py-2.5 px-3 font-bold">₹{metrics.overallAov}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-black text-[11px]">Cost of Goods (COGS)</td>
                      <td className="py-2.5 px-3 font-black text-emerald-800 bg-emerald-50/30">
                        ₹{metrics.studentCogs.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">-</td>
                      <td className="py-2.5 px-3 font-bold">-</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-black text-[11px]">Gross Profit &amp; Margin</td>
                      <td className="py-2.5 px-3 font-black text-emerald-800 bg-emerald-50/30">
                        ₹{metrics.studentGrossProfit.toLocaleString()} ({metrics.studentGrossMargin.toFixed(1)}%)
                      </td>
                      <td className="py-2.5 px-3">-</td>
                      <td className="py-2.5 px-3 font-bold">-</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-black text-[11px]">Retention Rate</td>
                      <td className="py-2.5 px-3 font-black text-emerald-800 bg-emerald-50/30">
                        {metrics.studentRetentionRate.toFixed(1)}% ({metrics.repeatStudents} repeat)
                      </td>
                      <td className="py-2.5 px-3">{metrics.regularRetentionRate.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 font-bold">-</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-black text-[11px]">New Enrolments in Period</td>
                      <td className="py-2.5 px-3 font-black text-emerald-800 bg-emerald-50/30">
                        +{metrics.newStudentEnrolments} students
                      </td>
                      <td className="py-2.5 px-3">-</td>
                      <td className="py-2.5 px-3 font-bold">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dining Channel Breakdown */}
            <div className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black uppercase text-brand-brown tracking-wider mb-4 flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
                  Student Order Preferences
                </h4>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                      <span className="text-brand-brown">Dine-In Orders</span>
                      <span className="text-emerald-800">{metrics.studentDineInPct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-brand-stone/40 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-emerald-600 h-full rounded-full transition-all"
                        style={{ width: `${metrics.studentDineInPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                      <span className="text-brand-brown">Takeaway Orders</span>
                      <span className="text-indigo-800">{metrics.studentTakeawayPct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-brand-stone/40 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-full rounded-full transition-all"
                        style={{ width: `${metrics.studentTakeawayPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                      <span className="text-brand-brown">Delivery Orders</span>
                      <span className="text-rose-800">{metrics.studentDeliveryPct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-brand-stone/40 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-rose-500 h-full rounded-full transition-all"
                        style={{ width: `${metrics.studentDeliveryPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-brand-stone/60">
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-[10px] text-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    Students predominantly choose <strong>{metrics.studentDineInPct >= metrics.studentTakeawayPct ? 'Dine-In' : 'Takeaway'}</strong> dining.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Top 5 Favorite Student Items */}
          {metrics.topStudentItems && metrics.topStudentItems.length > 0 && (
            <div className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black uppercase text-brand-brown tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-600" />
                  Top 5 Favorite Menu Items Among Students
                </h4>
                <span className="text-[9px] font-bold text-brand-brown/40 uppercase">
                  Ranked by student volume
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {metrics.topStudentItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-brand-cream/40 border border-brand-stone/80 flex flex-col justify-between"
                  >
                    <div>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded-md">
                        #{idx + 1} Best Seller
                      </span>
                      <p className="text-xs font-black text-brand-brown mt-2 line-clamp-2 uppercase">
                        {item.name}
                      </p>
                    </div>
                    <div className="mt-4 pt-2 border-t border-brand-stone/60 flex items-center justify-between">
                      <span className="text-[10px] font-black text-emerald-800">
                        {item.quantity} sold
                      </span>
                      <span className="text-[10px] font-black text-brand-brown">
                        ₹{item.revenue.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-brand-stone flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] font-bold text-brand-brown/50 uppercase">
            {isFilteredToStudents
              ? 'Dashboard is actively filtered to Student behavior.'
              : 'Click "Filter Dashboard to Students" to inspect charts and reports exclusively for students.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                handleFilterChange('ALL');
                onClose();
              }}
              className="px-4 py-2 bg-brand-stone/40 hover:bg-brand-stone/60 text-brand-brown rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
            >
              Reset to All
            </button>
            <button
              onClick={() => {
                handleFilterChange('STUDENT');
                onClose();
              }}
              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Apply Student View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
