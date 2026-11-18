import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
  LabelList
} from 'recharts';
import {
  Calendar,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Share2,
  Check,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Table2,
  Grid,
  Flame,
  LayoutGrid
} from 'lucide-react';
import { BucketDefinition } from './OrderValueHistogram';
import {
  CompareChannel,
  CompareMetric,
  CompareValueMode,
  CompareViewTab,
  ComparePeriodConfig,
  CompareUrlState,
  ExtendedChannelKey,
  ServerPeriodAggregation,
  PeriodComputedData,
  BucketMetricValues,
  DeltaResult,
  PERIOD_FIXED_COLORS,
  COMPARE_METRIC_LABELS,
  CHANNEL_LABELS,
  getISTTodayString,
  addDaysIST,
  getEffectiveRange,
  buildDefaultComparePeriods,
  buildPresetPeriods,
  findOverlappingPeriodPairs,
  fetchTicketBucketPeriod,
  computePeriodMetrics,
  computeDelta,
  formatSignedPct,
  formatSignedDelta,
  formatMetricValue,
  getMetricValue,
  writeCompareStateToUrl
} from '../utils/ticketBucketCompare';

interface TicketBucketCompareProps {
  activeBuckets: BucketDefinition[];
  dashboardStartDate: string;
  dashboardEndDate: string;
  branchName: string;
  segmentFilter: 'ALL' | 'STUDENT' | 'REGULAR';
  onSelectAllBuckets: () => void;
  initialUrlState?: CompareUrlState | null;
}

const CHANNEL_ORDER: CompareChannel[] = [
  'ALL',
  'DINE_IN',
  'TAKEAWAY',
  'DELIVERY',
  'DELIVERY_MINMOMOS',
  'DELIVERY_MINCHICKEN'
];
const EXPANDABLE_SUBCHANNELS: ExtendedChannelKey[] = [
  'DINE_IN',
  'TAKEAWAY',
  'DELIVERY',
  'DELIVERY_MINMOMOS',
  'DELIVERY_MINCHICKEN'
];
const CORE_MOVER_CHANNELS: ExtendedChannelKey[] = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'];
const BRAND_SPLIT_MOVER_CHANNELS: ExtendedChannelKey[] = [
  'DINE_IN',
  'TAKEAWAY',
  'DELIVERY_MINMOMOS',
  'DELIVERY_MINCHICKEN'
];
const ALL_METRICS: CompareMetric[] = [
  'orders',
  'revenue',
  'ordersPerDay',
  'revenuePerDay',
  'avgTicket',
  'orderShare',
  'revenueShare'
];

function defaultTwoMonths(): { monthA: string; monthB: string } {
  const today = getISTTodayString();
  const [y, m] = today.split('-').map(Number);
  const currYm = `${y}-${String(m).padStart(2, '0')}`;
  const prevDt = new Date(Date.UTC(y, m - 2, 1));
  const prevYm = `${prevDt.getUTCFullYear()}-${String(prevDt.getUTCMonth() + 1).padStart(2, '0')}`;
  return { monthA: currYm, monthB: prevYm };
}

function defaultPivotDate(): string {
  return addDaysIST(getISTTodayString(), -14);
}

function getHeatmapCellStyle(pctChange: number | null, status: DeltaResult['status'], isSmallBase: boolean): React.CSSProperties {
  const opacityMult = isSmallBase ? 0.55 : 1;
  if (status === 'both_zero') {
    return { backgroundColor: '#FAF8F5', color: '#8C7A75' };
  }
  if (status === 'new') {
    return {
      backgroundColor: `rgba(16, 185, 129, ${(0.22 * opacityMult).toFixed(2)})`,
      color: '#065F46'
    };
  }
  if (pctChange === null || pctChange === 0) {
    return { backgroundColor: '#FAF8F5', color: '#4A2C2A' };
  }
  const intensity = Math.min(1, Math.abs(pctChange) / 100);
  const alpha = (0.1 + intensity * 0.38) * opacityMult;
  if (pctChange > 0) {
    return {
      backgroundColor: `rgba(16, 185, 129, ${alpha.toFixed(2)})`,
      color: '#064E3B'
    };
  }
  return {
    backgroundColor: `rgba(220, 38, 38, ${alpha.toFixed(2)})`,
    color: '#7F1D1D'
  };
}

export const TicketBucketCompare: React.FC<TicketBucketCompareProps> = ({
  activeBuckets,
  dashboardStartDate,
  dashboardEndDate,
  branchName,
  segmentFilter,
  onSelectAllBuckets,
  initialUrlState
}) => {
  // Period Builder State
  const [periods, setPeriods] = useState<ComparePeriodConfig[]>(() => {
    if (initialUrlState?.periods && initialUrlState.periods.length >= 2) {
      return initialUrlState.periods;
    }
    return buildDefaultComparePeriods(dashboardStartDate, dashboardEndDate);
  });

  const [baselineId, setBaselineId] = useState<string>(() => {
    const initial = initialUrlState?.baselineId || 'P1';
    return initial;
  });

  const [excludeToday, setExcludeToday] = useState<boolean>(() => {
    return initialUrlState?.excludeToday ?? true;
  });

  const [countActiveDays, setCountActiveDays] = useState<boolean>(() => {
    return initialUrlState?.countActiveDays ?? false;
  });

  // Controls State
  const [channel, setChannel] = useState<CompareChannel>(() => initialUrlState?.channel || 'ALL');
  const [metric, setMetric] = useState<CompareMetric>(() => initialUrlState?.metric || 'orders');
  const [valueMode, setValueMode] = useState<CompareValueMode>(() => initialUrlState?.valueMode || 'absolute');
  const [activeTab, setActiveTab] = useState<CompareViewTab>(() => initialUrlState?.tab || 'summary');
  const [heatmapPeriodId, setHeatmapPeriodId] = useState<string>(() => initialUrlState?.heatmapPeriodId || '');
  const [moversPeriodId, setMoversPeriodId] = useState<string>('');
  const [moversSplitBrands, setMoversSplitBrands] = useState<boolean>(false);

  // Preset inline forms
  const [presetPanel, setPresetPanel] = useState<'none' | 'two_months' | 'last_n' | 'before_after'>('none');
  const initMonths = useMemo(() => defaultTwoMonths(), []);
  const [monthA, setMonthA] = useState<string>(initMonths.monthA);
  const [monthB, setMonthB] = useState<string>(initMonths.monthB);
  const [customNDays, setCustomNDays] = useState<number>(14);
  const [pivotDate, setPivotDate] = useState<string>(() => defaultPivotDate());
  const [beforeAfterWindow, setBeforeAfterWindow] = useState<number>(14);

  // Server fetch state
  const [periodAggs, setPeriodAggs] = useState<Record<string, ServerPeriodAggregation>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // Table expandable rows & copy share link feedback
  const [expandedBucketIds, setExpandedBucketIds] = useState<Record<string, boolean>>({});
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Keep baselineId valid if periods change
  const validBaselineId = useMemo(() => {
    return periods.some(p => p.id === baselineId) ? baselineId : periods[0]?.id || 'P1';
  }, [periods, baselineId]);

  const comparisonPeriods = useMemo(() => {
    return periods.filter(p => p.id !== validBaselineId);
  }, [periods, validBaselineId]);

  const activeHeatmapPeriodId = useMemo(() => {
    if (comparisonPeriods.some(p => p.id === heatmapPeriodId)) return heatmapPeriodId;
    return comparisonPeriods[0]?.id || validBaselineId;
  }, [comparisonPeriods, heatmapPeriodId, validBaselineId]);

  const activeMoversPeriodId = useMemo(() => {
    if (comparisonPeriods.some(p => p.id === moversPeriodId)) return moversPeriodId;
    return comparisonPeriods[0]?.id || validBaselineId;
  }, [comparisonPeriods, moversPeriodId, validBaselineId]);

  // Persist URL query parameters whenever compare state updates
  useEffect(() => {
    writeCompareStateToUrl({
      mode: 'compare',
      periods,
      baselineId: validBaselineId,
      excludeToday,
      countActiveDays,
      channel,
      metric,
      valueMode,
      tab: activeTab,
      heatmapPeriodId: activeHeatmapPeriodId,
      selectedBucketIds: activeBuckets.map(b => b.id)
    });
  }, [
    periods,
    validBaselineId,
    excludeToday,
    countActiveDays,
    channel,
    metric,
    valueMode,
    activeTab,
    activeHeatmapPeriodId,
    activeBuckets
  ]);

  // Fetch server-aggregated bucket metrics (one RPC/API query per period; cached server+client)
  useEffect(() => {
    let cancelled = false;
    if (activeBuckets.length === 0) {
      setPeriodAggs({});
      return;
    }

    const loadAllPeriods = async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const results = await Promise.all(
          periods.map(async p => {
            const agg = await fetchTicketBucketPeriod({
              startDate: p.startDate,
              endDate: p.endDate,
              branchName,
              segmentFilter,
              excludeToday,
              buckets: activeBuckets,
              forceRefresh: refreshNonce > 0
            });
            return { id: p.id, agg };
          })
        );
        if (cancelled) return;
        const map: Record<string, ServerPeriodAggregation> = {};
        for (const r of results) {
          map[r.id] = r.agg;
        }
        setPeriodAggs(map);
      } catch (err: any) {
        if (!cancelled) {
          setFetchError(err?.message || 'Failed to load comparison data from server.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadAllPeriods();
    return () => {
      cancelled = true;
    };
  }, [periods, branchName, segmentFilter, excludeToday, activeBuckets, refreshNonce]);

  // Compute structured period metrics
  const computedByPeriod = useMemo(() => {
    const out: Record<string, PeriodComputedData> = {};
    for (const p of periods) {
      out[p.id] = computePeriodMetrics(
        p,
        periodAggs[p.id],
        activeBuckets,
        channel,
        countActiveDays
      );
    }
    return out;
  }, [periods, periodAggs, activeBuckets, channel, countActiveDays]);

  const baselineData = computedByPeriod[validBaselineId];

  // Warnings & edge case diagnostics
  const overlaps = useMemo(() => {
    return findOverlappingPeriodPairs(periods, excludeToday);
  }, [periods, excludeToday]);

  const todayIST = getISTTodayString();
  const excludedToEmptyPeriods = useMemo(() => {
    if (!excludeToday) return [];
    return periods.filter(p => {
      const r = getEffectiveRange(p.startDate, p.endDate, true);
      return r.calendarDays === 0 && p.startDate >= todayIST;
    });
  }, [periods, excludeToday, todayIST]);

  const hasUnequalLengths = useMemo(() => {
    const lengths = periods
      .map(p => computedByPeriod[p.id]?.days ?? 0)
      .filter(d => d > 0);
    return new Set(lengths).size > 1;
  }, [periods, computedByPeriod]);

  // Period Builder Actions
  const handleAddPeriod = () => {
    if (periods.length >= 5) return;
    const last = periods[periods.length - 1];
    const len = Math.max(1, getEffectiveRange(last.startDate, last.endDate, false).calendarDays || 7);
    const newEnd = addDaysIST(last.startDate, -1);
    const newStart = addDaysIST(newEnd, -(len - 1));
    const idx = periods.length;
    setPeriods(prev => [
      ...prev,
      {
        id: `P${idx + 1}`,
        label: `Period ${idx + 1}`,
        startDate: newStart,
        endDate: newEnd,
        color: PERIOD_FIXED_COLORS[idx] || PERIOD_FIXED_COLORS[0]
      }
    ]);
  };

  const handleRemovePeriod = (idToRemove: string) => {
    if (periods.length <= 2) return;
    const oldBaselineIdx = periods.findIndex(p => p.id === validBaselineId);
    const removedIdx = periods.findIndex(p => p.id === idToRemove);
    const remaining = periods.filter(p => p.id !== idToRemove);
    const reindexed = remaining.map((p, idx) => ({
      ...p,
      id: `P${idx + 1}`,
      color: PERIOD_FIXED_COLORS[idx] || PERIOD_FIXED_COLORS[0]
    }));
    setPeriods(reindexed);
    if (idToRemove === validBaselineId) {
      setBaselineId('P1');
    } else if (oldBaselineIdx > removedIdx) {
      setBaselineId(`P${oldBaselineIdx}`);
    }
  };

  const updatePeriodField = (id: string, patch: Partial<ComparePeriodConfig>) => {
    setPeriods(prev =>
      prev.map(p => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (next.endDate < next.startDate) {
          if (patch.startDate) next.endDate = patch.startDate;
          else if (patch.endDate) next.startDate = patch.endDate;
        }
        return next;
      })
    );
  };

  const applyPreset = (newPeriods: ComparePeriodConfig[]) => {
    setPeriods(newPeriods);
    setBaselineId('P1');
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard blocked in sandboxed iframe — state is still in window.location.search
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // CSV Export for Table View
  const handleExportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const headers: string[] = ['Bucket', 'Channel'];
    for (const p of periods) {
      headers.push(
        `${p.label} Orders`,
        `${p.label} Revenue`,
        `${p.label} Orders/day`,
        `${p.label} Revenue/day`,
        `${p.label} Avg Ticket`
      );
    }
    for (const cp of comparisonPeriods) {
      const mLabel = COMPARE_METRIC_LABELS[metric];
      headers.push(
        `${cp.label} vs ${baselineData?.period.label || validBaselineId} (${mLabel} Delta)`,
        `${cp.label} vs ${baselineData?.period.label || validBaselineId} (${mLabel} % Delta)`
      );
    }

    const csvRows: string[] = [headers.map(esc).join(',')];

    const pushMetricRow = (
      bucketLabel: string,
      channelLabel: string,
      getMetricObj: (pd: PeriodComputedData) => BucketMetricValues
    ) => {
      const row: (string | number)[] = [bucketLabel, channelLabel];
      for (const p of periods) {
        const pd = computedByPeriod[p.id];
        const m = getMetricObj(pd);
        row.push(
          m.orders,
          m.revenue,
          m.ordersPerDay.toFixed(2),
          m.revenuePerDay.toFixed(2),
          m.avgTicket
        );
      }
      const baseVal = baselineData ? getMetricValue(getMetricObj(baselineData), metric) : 0;
      for (const cp of comparisonPeriods) {
        const compPd = computedByPeriod[cp.id];
        const compVal = compPd ? getMetricValue(getMetricObj(compPd), metric) : 0;
        const d = computeDelta(baseVal, compVal);
        row.push(formatSignedDelta(d, metric), formatSignedPct(d));
      }
      csvRows.push(row.map(esc).join(','));
    };

    for (const b of activeBuckets) {
      pushMetricRow(b.label, CHANNEL_LABELS[channel], pd => pd.byBucket[b.id]);
      for (const ch of EXPANDABLE_SUBCHANNELS) {
        pushMetricRow(b.label, CHANNEL_LABELS[ch], pd => pd.byBucketAndChannel[b.id][ch]);
      }
    }
    pushMetricRow('TOTAL SELECTED', CHANNEL_LABELS[channel], pd => pd.totals);

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-size-compare-${validBaselineId}-${getISTTodayString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Chart Data Preparation (Buckets View)
  // ---------------------------------------------------------------------------
  const groupedChartData = useMemo(() => {
    return activeBuckets.map(b => {
      const row: Record<string, any> = {
        id: b.id,
        range: b.label
      };
      const baseMetrics = baselineData?.byBucket[b.id];
      const baseVal = baseMetrics ? getMetricValue(baseMetrics, metric) : 0;

      for (const p of periods) {
        const pd = computedByPeriod[p.id];
        const m = pd?.byBucket[b.id];
        const val = m ? getMetricValue(m, metric) : 0;
        const delta = computeDelta(baseVal, val);

        row[`abs_${p.id}`] = val;
        row[`delta_${p.id}`] = delta.delta;
        row[`pct_${p.id}`] =
          delta.status === 'new'
            ? 150
            : delta.pctChange !== null
            ? Number(delta.pctChange.toFixed(1))
            : 0;
        row[`meta_${p.id}`] = {
          metrics: m,
          value: val,
          delta,
          isSmallBase: (baseMetrics?.ordersPerDay ?? 0) < 1
        };

        // Main bar plotting field based on valueMode
        if (valueMode === 'absolute') {
          row[p.id] = val;
        } else if (valueMode === 'delta') {
          row[p.id] = delta.delta;
        } else {
          // pctDelta: clamp extreme spikes cleanly on grouped chart if needed, or actual finite %
          row[p.id] = delta.status === 'new' ? 100 : delta.pctChange ?? 0;
        }
      }
      return row;
    });
  }, [activeBuckets, periods, computedByPeriod, baselineData, metric, valueMode]);

  const barsToRenderInGrouped = useMemo(() => {
    return valueMode === 'absolute' ? periods : comparisonPeriods;
  }, [valueMode, periods, comparisonPeriods]);

  // Diverging Horizontal Chart Data per comparison period
  const divergingByPeriod = useMemo(() => {
    const out: Record<
      string,
      Array<{
        id: string;
        range: string;
        clampedPct: number;
        truePctText: string;
        delta: DeltaResult;
        baseVal: number;
        compVal: number;
        baseOrdersPerDay: number;
        isSmallBase: boolean;
        isClamped: boolean;
      }>
    > = {};

    for (const cp of comparisonPeriods) {
      const cpData = computedByPeriod[cp.id];
      out[cp.id] = activeBuckets.map(b => {
        const baseBucket = baselineData?.byBucket[b.id];
        const compBucket = cpData?.byBucket[b.id];
        const baseVal = baseBucket ? getMetricValue(baseBucket, metric) : 0;
        const compVal = compBucket ? getMetricValue(compBucket, metric) : 0;
        const delta = computeDelta(baseVal, compVal);
        const baseOrdersPerDay = baseBucket?.ordersPerDay ?? 0;
        const isSmallBase = baseOrdersPerDay < 1;

        let clampedPct = 0;
        let isClamped = false;
        if (delta.status === 'new') {
          clampedPct = 150;
          isClamped = true;
        } else if (delta.pctChange !== null && Number.isFinite(delta.pctChange)) {
          if (delta.pctChange > 150) {
            clampedPct = 150;
            isClamped = true;
          } else if (delta.pctChange < -150) {
            clampedPct = -150;
            isClamped = true;
          } else {
            clampedPct = Number(delta.pctChange.toFixed(1));
          }
        }

        return {
          id: b.id,
          range: b.label,
          clampedPct,
          truePctText: formatSignedPct(delta),
          delta,
          baseVal,
          compVal,
          baseOrdersPerDay,
          isSmallBase,
          isClamped
        };
      });
    }
    return out;
  }, [comparisonPeriods, computedByPeriod, baselineData, activeBuckets, metric]);

  // Movers Data (Top 5 Gains & Losses by delta/day across channel x bucket, excluding ALL)
  const moversData = useMemo(() => {
    const compPd = computedByPeriod[activeMoversPeriodId];
    if (!baselineData || !compPd) {
      return {
        ordersGains: [] as any[],
        ordersLosses: [] as any[],
        revGains: [] as any[],
        revLosses: [] as any[]
      };
    }

    interface MoverItem {
      key: string;
      channel: ExtendedChannelKey;
      channelLabel: string;
      bucketId: string;
      bucketLabel: string;
      basePerDay: number;
      compPerDay: number;
      delta: DeltaResult;
      isSmallBase: boolean;
    }

    const orderItems: MoverItem[] = [];
    const revItems: MoverItem[] = [];
    const moverChannels = moversSplitBrands ? BRAND_SPLIT_MOVER_CHANNELS : CORE_MOVER_CHANNELS;

    for (const b of activeBuckets) {
      for (const ch of moverChannels) {
        const baseM = baselineData.byBucketAndChannel[b.id]?.[ch];
        const compM = compPd.byBucketAndChannel[b.id]?.[ch];
        if (!baseM || !compM) continue;

        const isSmallBase = baseM.ordersPerDay < 1;
        const ordDelta = computeDelta(baseM.ordersPerDay, compM.ordersPerDay);
        const revDelta = computeDelta(baseM.revenuePerDay, compM.revenuePerDay);

        orderItems.push({
          key: `${b.id}_${ch}`,
          channel: ch,
          channelLabel: CHANNEL_LABELS[ch],
          bucketId: b.id,
          bucketLabel: b.label,
          basePerDay: baseM.ordersPerDay,
          compPerDay: compM.ordersPerDay,
          delta: ordDelta,
          isSmallBase
        });

        revItems.push({
          key: `${b.id}_${ch}`,
          channel: ch,
          channelLabel: CHANNEL_LABELS[ch],
          bucketId: b.id,
          bucketLabel: b.label,
          basePerDay: baseM.revenuePerDay,
          compPerDay: compM.revenuePerDay,
          delta: revDelta,
          isSmallBase
        });
      }
    }

    return {
      ordersGains: orderItems
        .filter(i => i.delta.delta > 0.0001)
        .sort((a, b) => b.delta.delta - a.delta.delta)
        .slice(0, 5),
      ordersLosses: orderItems
        .filter(i => i.delta.delta < -0.0001)
        .sort((a, b) => a.delta.delta - b.delta.delta)
        .slice(0, 5),
      revGains: revItems
        .filter(i => i.delta.delta > 0.0001)
        .sort((a, b) => b.delta.delta - a.delta.delta)
        .slice(0, 5),
      revLosses: revItems
        .filter(i => i.delta.delta < -0.0001)
        .sort((a, b) => a.delta.delta - b.delta.delta)
        .slice(0, 5)
    };
  }, [activeBuckets, baselineData, computedByPeriod, activeMoversPeriodId, moversSplitBrands]);

  // Empty buckets state check
  if (activeBuckets.length === 0) {
    return (
      <div className="h-[280px] flex flex-col items-center justify-center bg-brand-cream/30 rounded-3xl border border-dashed border-brand-stone p-6 text-center">
        <p className="text-sm font-black uppercase tracking-wider text-brand-brown">No Ranges Selected</p>
        <p className="text-xs text-brand-brown/50 mt-1">
          Select one or more order value ranges in Customize Ranges above to run comparison analytics.
        </p>
        <button
          onClick={onSelectAllBuckets}
          className="mt-4 px-4 py-2 bg-brand-brown text-brand-yellow rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90"
        >
          Select All Ranges
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* =====================================================================
          1. PERIOD BUILDER PANEL
         ===================================================================== */}
      <div className="bg-brand-cream/60 border border-brand-brown/15 rounded-3xl p-4 lg:p-5 space-y-4">
        {/* Preset Toolbar & Toggles */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-brand-brown/10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-brand-brown/50 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Presets:
            </span>
            <button
              onClick={() => {
                setPresetPanel('none');
                applyPreset(buildDefaultComparePeriods(dashboardStartDate, dashboardEndDate));
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-brand-stone text-[9px] font-black uppercase tracking-wider text-brand-brown hover:bg-brand-brown hover:text-brand-yellow transition-colors"
            >
              Dashboard vs Prev
            </button>
            <button
              onClick={() => {
                setPresetPanel('none');
                applyPreset(buildPresetPeriods({ type: 'this_vs_last_week' }, excludeToday));
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-brand-stone text-[9px] font-black uppercase tracking-wider text-brand-brown hover:bg-brand-brown hover:text-brand-yellow transition-colors"
            >
              This Week vs Last Week
            </button>
            <button
              onClick={() => {
                setPresetPanel('none');
                applyPreset(buildPresetPeriods({ type: 'this_vs_last_month' }, excludeToday));
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-brand-stone text-[9px] font-black uppercase tracking-wider text-brand-brown hover:bg-brand-brown hover:text-brand-yellow transition-colors"
            >
              This Month vs Last Month
            </button>
            <button
              onClick={() => {
                setPresetPanel('none');
                applyPreset(buildPresetPeriods({ type: 'last_n_vs_prev_n', days: 7 }, excludeToday));
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-brand-stone text-[9px] font-black uppercase tracking-wider text-brand-brown hover:bg-brand-brown hover:text-brand-yellow transition-colors"
            >
              Last 7d vs Prev 7d
            </button>
            <button
              onClick={() => setPresetPanel(prev => (prev === 'last_n' ? 'none' : 'last_n'))}
              className={`px-2.5 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-colors ${
                presetPanel === 'last_n'
                  ? 'bg-brand-brown text-brand-yellow border-brand-brown'
                  : 'bg-white border-brand-stone text-brand-brown hover:bg-brand-brown/5'
              }`}
            >
              Last N Days...
            </button>
            <button
              onClick={() => setPresetPanel(prev => (prev === 'two_months' ? 'none' : 'two_months'))}
              className={`px-2.5 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-colors ${
                presetPanel === 'two_months'
                  ? 'bg-brand-brown text-brand-yellow border-brand-brown'
                  : 'bg-white border-brand-stone text-brand-brown hover:bg-brand-brown/5'
              }`}
            >
              Two Months...
            </button>
            <button
              onClick={() => setPresetPanel(prev => (prev === 'before_after' ? 'none' : 'before_after'))}
              className={`px-2.5 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-colors ${
                presetPanel === 'before_after'
                  ? 'bg-brand-brown text-brand-yellow border-brand-brown'
                  : 'bg-white border-brand-stone text-brand-brown hover:bg-brand-brown/5'
              }`}
            >
              Before vs After Date...
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none bg-white px-2.5 py-1.5 rounded-xl border border-brand-stone">
              <input
                type="checkbox"
                checked={excludeToday}
                onChange={e => setExcludeToday(e.target.checked)}
                className="rounded border-brand-stone text-brand-brown focus:ring-0"
              />
              <span className="text-[9px] font-black uppercase tracking-wider text-brand-brown">
                Exclude today (incomplete)
              </span>
            </label>

            <label
              className="flex items-center gap-1.5 cursor-pointer select-none bg-white px-2.5 py-1.5 rounded-xl border border-brand-stone"
              title="Default uses calendar days in period. Check to divide per-day metrics only by days that had at least 1 order."
            >
              <input
                type="checkbox"
                checked={countActiveDays}
                onChange={e => setCountActiveDays(e.target.checked)}
                className="rounded border-brand-stone text-brand-brown focus:ring-0"
              />
              <span className="text-[9px] font-black uppercase tracking-wider text-brand-brown">
                Only active days (≥1 order)
              </span>
            </label>

            <button
              onClick={() => setRefreshNonce(n => n + 1)}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-brand-stone text-[9px] font-black uppercase tracking-wider text-brand-brown hover:bg-brand-brown/5 flex items-center gap-1 disabled:opacity-50"
              title="Refresh server cache"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleCopyShareLink}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-brand-stone text-[9px] font-black uppercase tracking-wider text-brand-brown hover:bg-brand-brown/5 flex items-center gap-1"
              title="Copy shareable comparison URL"
            >
              {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Share2 className="w-3 h-3" />}
              <span>{copiedLink ? 'Link Copied' : 'Share Link'}</span>
            </button>
          </div>
        </div>

        {/* Inline Preset Sub-Panels */}
        {presetPanel === 'last_n' && (
          <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-brand-stone">
            <span className="text-[10px] font-black uppercase tracking-wider text-brand-brown">
              Last N vs Previous N Days:
            </span>
            {[7, 14, 30, 60, 90].map(n => (
              <button
                key={n}
                onClick={() => {
                  setCustomNDays(n);
                  applyPreset(buildPresetPeriods({ type: 'last_n_vs_prev_n', days: n }, excludeToday));
                  setPresetPanel('none');
                }}
                className="px-2.5 py-1 rounded-lg bg-brand-cream border border-brand-stone text-[10px] font-black text-brand-brown hover:bg-brand-brown hover:text-brand-yellow"
              >
                {n}d
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={365}
                value={customNDays}
                onChange={e => setCustomNDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 px-2.5 py-1 rounded-lg border border-brand-stone text-xs font-bold text-brand-brown"
              />
              <button
                onClick={() => {
                  applyPreset(buildPresetPeriods({ type: 'last_n_vs_prev_n', days: customNDays }, excludeToday));
                  setPresetPanel('none');
                }}
                className="px-3 py-1 rounded-lg bg-brand-red text-white text-[10px] font-black uppercase tracking-wider"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {presetPanel === 'two_months' && (
          <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-brand-stone">
            <span className="text-[10px] font-black uppercase tracking-wider text-brand-brown">
              Compare Calendar Months:
            </span>
            <input
              type="month"
              value={monthA}
              onChange={e => setMonthA(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-brand-stone text-xs font-bold text-brand-brown"
            />
            <span className="text-[10px] font-black text-brand-brown/40">VS</span>
            <input
              type="month"
              value={monthB}
              onChange={e => setMonthB(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-brand-stone text-xs font-bold text-brand-brown"
            />
            <button
              onClick={() => {
                if (monthA && monthB) {
                  applyPreset(buildPresetPeriods({ type: 'two_months', monthA, monthB }, excludeToday));
                  setPresetPanel('none');
                }
              }}
              className="px-3 py-1 rounded-lg bg-brand-red text-white text-[10px] font-black uppercase tracking-wider"
            >
              Apply Months
            </button>
          </div>
        )}

        {presetPanel === 'before_after' && (
          <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-brand-stone">
            <span className="text-[10px] font-black uppercase tracking-wider text-brand-brown">
              Event / Price-Change Date:
            </span>
            <input
              type="date"
              value={pivotDate}
              onChange={e => setPivotDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-brand-stone text-xs font-bold text-brand-brown"
            />
            <span className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60">
              Window (days each side):
            </span>
            <input
              type="number"
              min={1}
              max={180}
              value={beforeAfterWindow}
              onChange={e => setBeforeAfterWindow(Math.max(1, Number(e.target.value) || 7))}
              className="w-20 px-2.5 py-1 rounded-lg border border-brand-stone text-xs font-bold text-brand-brown"
            />
            <button
              onClick={() => {
                if (pivotDate) {
                  applyPreset(
                    buildPresetPeriods(
                      { type: 'before_vs_after', pivotDate, windowDays: beforeAfterWindow },
                      excludeToday
                    )
                  );
                  setPresetPanel('none');
                }
              }}
              className="px-3 py-1 rounded-lg bg-brand-red text-white text-[10px] font-black uppercase tracking-wider"
            >
              Apply Before / After
            </button>
          </div>
        )}

        {/* Period Chips (P1..P5) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {periods.map(p => {
            const isBase = p.id === validBaselineId;
            const eff = getEffectiveRange(p.startDate, p.endDate, excludeToday);
            const pd = computedByPeriod[p.id];
            const displayDays = pd ? pd.days : eff.calendarDays;
            return (
              <div
                key={p.id}
                className={`relative bg-white rounded-2xl border p-3 shadow-sm transition-all ${
                  isBase ? 'border-brand-brown ring-1 ring-brand-brown/20' : 'border-brand-stone'
                }`}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl"
                  style={{ backgroundColor: p.color }}
                />
                <div className="flex items-center justify-between gap-2 pt-1 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="text-[9px] font-black text-white px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.id}
                    </span>
                    <input
                      type="text"
                      value={p.label}
                      onChange={e => updatePeriodField(p.id, { label: e.target.value })}
                      className="text-xs font-black text-brand-brown bg-transparent border-b border-transparent hover:border-brand-stone focus:border-brand-brown outline-none truncate w-full"
                      title="Edit period label"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setBaselineId(p.id)}
                      className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-colors ${
                        isBase
                          ? 'bg-brand-brown text-brand-yellow'
                          : 'bg-brand-stone/50 text-brand-brown/60 hover:bg-brand-brown/10 hover:text-brand-brown'
                      }`}
                      title={isBase ? 'Selected Baseline' : 'Set as Baseline'}
                    >
                      {isBase ? 'Baseline' : 'Set Base'}
                    </button>
                    {periods.length > 2 && (
                      <button
                        onClick={() => handleRemovePeriod(p.id)}
                        className="p-1 rounded-md text-brand-brown/40 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Remove period"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  <div>
                    <label className="text-[7.5px] font-black uppercase tracking-wider text-brand-brown/40 block">
                      From (IST)
                    </label>
                    <input
                      type="date"
                      value={p.startDate}
                      onChange={e => updatePeriodField(p.id, { startDate: e.target.value })}
                      className="w-full px-1.5 py-1 rounded-lg border border-brand-stone text-[10px] font-bold text-brand-brown bg-brand-cream/40"
                    />
                  </div>
                  <div>
                    <label className="text-[7.5px] font-black uppercase tracking-wider text-brand-brown/40 block">
                      To (IST)
                    </label>
                    <input
                      type="date"
                      value={p.endDate}
                      onChange={e => updatePeriodField(p.id, { endDate: e.target.value })}
                      className="w-full px-1.5 py-1 rounded-lg border border-brand-stone text-[10px] font-bold text-brand-brown bg-brand-cream/40"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[8.5px] font-bold text-brand-brown/60">
                  <span>
                    {countActiveDays
                      ? `${displayDays} active d (${eff.calendarDays} cal)`
                      : `${eff.calendarDays} ${eff.calendarDays === 1 ? 'day' : 'days'}`}
                  </span>
                  {eff.excludedToday && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[7.5px] font-black uppercase">
                      excl. today
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {periods.length < 5 && (
            <button
              onClick={handleAddPeriod}
              className="flex flex-col items-center justify-center min-h-[116px] rounded-2xl border-2 border-dashed border-brand-brown/20 text-brand-brown/50 hover:border-brand-brown/50 hover:text-brand-brown hover:bg-white/60 transition-all p-3 gap-1.5"
            >
              <Plus className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-wider">Add Period ({periods.length}/5)</span>
            </button>
          )}
        </div>

        {/* Context & Edge-Case Banners */}
        {excludedToEmptyPeriods.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-amber-900">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Info className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                {excludedToEmptyPeriods.map(p => p.label).join(', ')} only covers today and currently has 0 completed days because "Exclude today (incomplete)" is ON.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setExcludeToday(false)}
                className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[9px] font-black uppercase tracking-wider hover:bg-amber-700"
              >
                Include Today
              </button>
              <button
                onClick={() => applyPreset(buildPresetPeriods({ type: 'last_n_vs_prev_n', days: 7 }, true))}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 text-[9px] font-black uppercase tracking-wider hover:bg-amber-100"
              >
                Last 7d vs Prev 7d
              </button>
            </div>
          </div>
        )}

        {hasUnequalLengths && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-2.5 text-sky-900">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Info className="w-4 h-4 shrink-0 text-sky-600" />
              <span>
                Selected periods have different day lengths. Use a Per Day or % Share metric for an apples-to-apples comparison.
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setMetric('ordersPerDay')}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                  metric === 'ordersPerDay'
                    ? 'bg-sky-700 text-white border-sky-700'
                    : 'bg-white text-sky-900 border-sky-300 hover:bg-sky-100'
                }`}
              >
                Orders/day
              </button>
              <button
                onClick={() => setMetric('revenuePerDay')}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                  metric === 'revenuePerDay'
                    ? 'bg-sky-700 text-white border-sky-700'
                    : 'bg-white text-sky-900 border-sky-300 hover:bg-sky-100'
                }`}
              >
                Revenue/day
              </button>
              <button
                onClick={() => setMetric('orderShare')}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                  metric === 'orderShare'
                    ? 'bg-sky-700 text-white border-sky-700'
                    : 'bg-white text-sky-900 border-sky-300 hover:bg-sky-100'
                }`}
              >
                % Share
              </button>
            </div>
          </div>
        )}

        {overlaps.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50/90 border border-amber-300 rounded-2xl px-4 py-2.5 text-amber-900 text-xs font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              Overlapping periods detected:{' '}
              {overlaps.map(o => `${o.a.id} (${o.a.label}) & ${o.b.id} (${o.b.label}) share ${o.overlapDays}d`).join('; ')}.
            </span>
          </div>
        )}
      </div>

      {/* =====================================================================
          2. CONTROLS BAR (Channel, Metric, Value Mode) & SUB-VIEW TABS
         ===================================================================== */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Channel Filter */}
          <div className="flex flex-wrap items-center bg-brand-brown/5 p-1 rounded-2xl border border-brand-brown/10 gap-0.5">
            {CHANNEL_ORDER.map(ch => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all ${
                  channel === ch
                    ? 'bg-brand-brown text-brand-yellow shadow-sm'
                    : 'text-brand-brown/50 hover:text-brand-brown hover:bg-brand-brown/5'
                }`}
              >
                {CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>

          {/* Value Mode Toggle */}
          <div className="flex items-center bg-brand-stone/40 p-1 rounded-2xl border border-brand-brown/15">
            {(
              [
                { id: 'absolute', label: 'Absolute' },
                { id: 'delta', label: 'Change (Δ)' },
                { id: 'pctDelta', label: '% Change' }
              ] as Array<{ id: CompareValueMode; label: string }>
            ).map(vm => (
              <button
                key={vm.id}
                onClick={() => setValueMode(vm.id)}
                className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all ${
                  valueMode === vm.id
                    ? 'bg-brand-red text-white shadow-sm'
                    : 'text-brand-brown/60 hover:text-brand-brown hover:bg-white/60'
                }`}
              >
                {vm.label}
              </button>
            ))}
          </div>
        </div>

        {/* Metric Selector + View Tabs */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-brand-cream/70 p-1.5 rounded-2xl border border-brand-stone">
            {ALL_METRICS.map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                  metric === m
                    ? 'bg-brand-brown text-brand-yellow shadow-sm'
                    : 'text-brand-brown/60 hover:text-brand-brown hover:bg-white'
                }`}
              >
                {COMPARE_METRIC_LABELS[m]}
              </button>
            ))}
          </div>

          {/* 5 Sub-View Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-brand-brown/5 p-1.5 rounded-2xl border border-brand-brown/10">
            {(
              [
                { id: 'summary', label: 'Summary', Icon: LayoutGrid },
                { id: 'buckets', label: 'Buckets Chart', Icon: BarChart3 },
                { id: 'table', label: 'Table', Icon: Table2 },
                { id: 'heatmap', label: 'Heatmap', Icon: Grid },
                { id: 'movers', label: 'Movers', Icon: Flame }
              ] as Array<{ id: CompareViewTab; label: string; Icon: React.FC<{ className?: string }> }>
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1.5 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  activeTab === id
                    ? 'bg-brand-red text-white shadow-md'
                    : 'text-brand-brown/60 hover:text-brand-brown hover:bg-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Fetch Status / Error */}
      {fetchError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between">
          <span>{fetchError}</span>
          <button
            onClick={() => setRefreshNonce(n => n + 1)}
            className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase"
          >
            Retry
          </button>
        </div>
      )}

      {isLoading && Object.keys(periodAggs).length === 0 ? (
        <div className="h-[260px] flex flex-col items-center justify-center bg-brand-cream/30 rounded-3xl border border-brand-stone/60 gap-3">
          <RefreshCw className="w-6 h-6 text-brand-brown animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-brand-brown/60">
            Aggregating Server Buckets...
          </p>
        </div>
      ) : (
        <>
          {/* =================================================================
              VIEW 1: SUMMARY
             ================================================================= */}
          {activeTab === 'summary' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {periods.map(p => {
                const pd = computedByPeriod[p.id];
                const isBase = p.id === validBaselineId;
                const t = pd.totals;
                const eff = getEffectiveRange(p.startDate, p.endDate, excludeToday);

                const renderDeltaChip = (baseVal: number, compVal: number, mType: CompareMetric) => {
                  if (isBase) return null;
                  const d = computeDelta(baseVal, compVal);
                  const pctTxt = formatSignedPct(d);
                  const absTxt = formatSignedDelta(d, mType);
                  const tone =
                    d.status === 'new' || d.delta > 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : d.delta < 0
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200';
                  return (
                    <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-black ${tone}`}>
                      {absTxt} ({pctTxt})
                    </span>
                  );
                };

                const baseT = baselineData?.totals;

                return (
                  <div
                    key={p.id}
                    className="relative bg-brand-cream/40 border border-brand-stone rounded-3xl p-5 overflow-hidden shadow-sm"
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-2"
                      style={{ backgroundColor: p.color }}
                    />
                    <div className="flex items-start justify-between gap-2 pt-1 mb-4 pb-3 border-b border-brand-stone/70">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-black text-white px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: p.color }}
                          >
                            {p.id}
                          </span>
                          <h4 className="text-base font-black text-brand-brown uppercase tracking-tight">
                            {p.label}
                          </h4>
                        </div>
                        <p className="text-[10px] font-bold text-brand-brown/50 mt-1">
                          {eff.effectiveStart} → {eff.effectiveEnd >= eff.effectiveStart ? eff.effectiveEnd : '—'} •{' '}
                          {pd.days} {countActiveDays ? 'active' : 'cal'} {pd.days === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-xl text-[8.5px] font-black uppercase tracking-wider shrink-0 ${
                          isBase
                            ? 'bg-brand-brown text-brand-yellow'
                            : 'bg-white border border-brand-stone text-brand-brown/60'
                        }`}
                      >
                        {isBase ? 'Baseline' : `vs ${baselineData?.period.id}`}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[8.5px] font-black uppercase tracking-widest text-brand-brown/40">
                            Orders ({CHANNEL_LABELS[channel]})
                          </p>
                          <p className="text-xl font-black text-brand-brown leading-tight">
                            {t.orders.toLocaleString()}
                          </p>
                        </div>
                        {baseT && renderDeltaChip(baseT.orders, t.orders, 'orders')}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[8.5px] font-black uppercase tracking-widest text-brand-brown/40">
                            Revenue
                          </p>
                          <p className="text-xl font-black text-brand-red leading-tight">
                            ₹{t.revenue.toLocaleString()}
                          </p>
                        </div>
                        {baseT && renderDeltaChip(baseT.revenue, t.revenue, 'revenue')}
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-brand-stone/60">
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-wider text-brand-brown/40">
                            Avg Ticket
                          </p>
                          <p className="text-sm font-black text-brand-brown">₹{t.avgTicket.toLocaleString()}</p>
                          {!isBase && baseT && (
                            <p className="text-[8.5px] font-bold text-brand-brown/70 mt-0.5">
                              {formatSignedDelta(computeDelta(baseT.avgTicket, t.avgTicket), 'avgTicket')} (
                              {formatSignedPct(computeDelta(baseT.avgTicket, t.avgTicket))})
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-wider text-brand-brown/40">
                            Orders / day
                          </p>
                          <p className="text-sm font-black text-brand-brown">{t.ordersPerDay.toFixed(1)}</p>
                          {!isBase && baseT && (
                            <p className="text-[8.5px] font-bold text-brand-brown/70 mt-0.5">
                              {formatSignedDelta(computeDelta(baseT.ordersPerDay, t.ordersPerDay), 'ordersPerDay')} (
                              {formatSignedPct(computeDelta(baseT.ordersPerDay, t.ordersPerDay))})
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-wider text-brand-brown/40">
                            Rev / day
                          </p>
                          <p className="text-sm font-black text-brand-brown">
                            ₹{Math.round(t.revenuePerDay).toLocaleString()}
                          </p>
                          {!isBase && baseT && (
                            <p className="text-[8.5px] font-bold text-brand-brown/70 mt-0.5">
                              {formatSignedDelta(computeDelta(baseT.revenuePerDay, t.revenuePerDay), 'revenuePerDay')} (
                              {formatSignedPct(computeDelta(baseT.revenuePerDay, t.revenuePerDay))})
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* =================================================================
              VIEW 2: BUCKETS CHART + DIVERGING % CHANGE CHARTS
             ================================================================= */}
          {activeTab === 'buckets' && (
            <div className="space-y-8">
              {/* Grouped Bar Chart */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-brown/70">
                    {COMPARE_METRIC_LABELS[metric]} •{' '}
                    {valueMode === 'absolute'
                      ? 'Absolute Values'
                      : valueMode === 'delta'
                      ? `Change (Δ) vs ${baselineData?.period.label || validBaselineId}`
                      : `% Change vs ${baselineData?.period.label || validBaselineId}`}
                  </p>
                  <p className="text-[9px] font-bold text-brand-brown/45">
                    Channel: {CHANNEL_LABELS[channel]}
                  </p>
                </div>

                <div className="h-[340px] lg:h-[400px] w-full bg-brand-cream/20 rounded-3xl border border-brand-stone/60 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={groupedChartData} margin={{ top: 28, right: 16, left: 6, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eae6df" />
                      <XAxis
                        dataKey="range"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
                        interval={0}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
                        tickFormatter={val => {
                          if (valueMode === 'pctDelta') return `${val > 0 ? '+' : ''}${val}%`;
                          const sign = valueMode === 'delta' && val > 0 ? '+' : valueMode === 'delta' && val < 0 ? '-' : '';
                          const abs = Math.abs(val);
                          if (metric === 'revenue' || metric === 'revenuePerDay' || metric === 'avgTicket') {
                            return `${sign}₹${abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs}`;
                          }
                          if (metric === 'orderShare' || metric === 'revenueShare') {
                            return `${sign}${abs.toFixed(0)}%`;
                          }
                          return `${sign}${abs}`;
                        }}
                      />
                      {valueMode !== 'absolute' && (
                        <ReferenceLine y={0} stroke="#4A2C2A" strokeWidth={1.5} strokeDasharray="4 4" />
                      )}
                      <Tooltip
                        cursor={{ fill: 'rgba(60, 42, 33, 0.04)' }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload || !payload.length) return null;
                          const row = payload[0].payload;
                          return (
                            <div className="bg-brand-brown p-4 rounded-2xl shadow-2xl border-2 border-brand-stone min-w-[260px] text-white">
                              <p className="text-brand-yellow text-[11px] font-black uppercase tracking-widest mb-2.5 italic">
                                Range: {label} ({CHANNEL_LABELS[channel]})
                              </p>
                              <div className="space-y-2 text-xs">
                                {periods.map(p => {
                                  const meta = row[`meta_${p.id}`];
                                  if (!meta) return null;
                                  const isBase = p.id === validBaselineId;
                                  return (
                                    <div
                                      key={p.id}
                                      className="flex items-center justify-between gap-4 pb-1.5 border-b border-white/10 last:border-b-0 last:pb-0"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full shrink-0"
                                          style={{ backgroundColor: p.color }}
                                        />
                                        <span className="font-bold text-white/90 text-[11px]">
                                          {p.id}: {p.label}
                                        </span>
                                      </div>
                                      <div className="text-right">
                                        <span className="font-black text-white">
                                          {formatMetricValue(meta.value, metric)}
                                        </span>
                                        {!isBase ? (
                                          <span className="block text-[9.5px] font-bold text-brand-yellow">
                                            {formatSignedDelta(meta.delta, metric)} ({formatSignedPct(meta.delta)})
                                          </span>
                                        ) : (
                                          <span className="block text-[8.5px] uppercase text-white/50 font-black">
                                            Baseline
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ paddingBottom: '10px' }}
                        formatter={value => {
                          const p = periods.find(item => item.id === value);
                          return (
                            <span className="text-[10px] font-black uppercase tracking-wider text-brand-brown">
                              {p ? `${p.id}: ${p.label}` : value}
                            </span>
                          );
                        }}
                      />
                      {barsToRenderInGrouped.map(p => (
                        <Bar
                          key={p.id}
                          dataKey={p.id}
                          name={p.id}
                          fill={p.color}
                          radius={[5, 5, 0, 0]}
                          maxBarSize={32}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Diverging Horizontal "% Change vs Baseline" Charts */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-brand-brown">
                      Diverging % Change vs Baseline ({baselineData?.period.label || validBaselineId})
                    </h4>
                    <p className="text-[10px] font-bold text-brand-brown/50">
                      Metric: {COMPARE_METRIC_LABELS[metric]} • Bars clamped at ±150% with true values printed • Faded bars indicate small base (baseline &lt; 1 order/day)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {comparisonPeriods.map(cp => {
                    const divData = divergingByPeriod[cp.id] || [];
                    const chartHeight = Math.max(260, divData.length * 40 + 50);

                    const renderDivergingLabel = (props: any) => {
                      const { x, y, width, height, value: bucketId } = props;
                      const item = divData.find(d => d.id === bucketId);
                      if (!item) return null;

                      const isNeg = item.clampedPct < 0;
                      const barStartX = Number(x);
                      const barWidth = Number(width);
                      const anchorX = isNeg ? barStartX + barWidth - 6 : barStartX + barWidth + 6;
                      const midY = Number(y) + Number(height) / 2 + 3.5;

                      let fill = '#4A2C2A';
                      if (item.delta.status === 'new' || item.delta.delta > 0) fill = '#047857';
                      else if (item.delta.delta < 0) fill = '#B91C1C';

                      const labelText = `${item.truePctText}${item.isClamped && item.delta.status !== 'new' ? ' (cap)' : ''}${
                        item.isSmallBase && item.delta.status !== 'both_zero' ? ' • small base' : ''
                      }`;

                      return (
                        <text
                          x={anchorX}
                          y={midY}
                          textAnchor={isNeg ? 'end' : 'start'}
                          fill={fill}
                          fontSize={10}
                          fontWeight={900}
                          className="select-none pointer-events-none"
                        >
                          {labelText}
                        </text>
                      );
                    };

                    return (
                      <div
                        key={cp.id}
                        className="bg-brand-cream/30 border border-brand-stone rounded-3xl p-4"
                      >
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-brand-stone/60">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: cp.color }}
                            />
                            <span className="text-xs font-black uppercase tracking-wider text-brand-brown">
                              {cp.id}: {cp.label} vs {baselineData?.period.id}
                            </span>
                          </div>
                          <span className="text-[9px] font-bold text-brand-brown/50">
                            {CHANNEL_LABELS[channel]}
                          </span>
                        </div>

                        <div style={{ height: `${chartHeight}px` }} className="w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={divData}
                              layout="vertical"
                              margin={{ top: 8, right: 125, left: 115, bottom: 8 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eae6df" />
                              <XAxis
                                type="number"
                                domain={[-150, 150]}
                                ticks={[-150, -100, -50, 0, 50, 100, 150]}
                                tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`}
                                tick={{ fill: '#3c2a21', fontSize: 9, fontWeight: '800' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                type="category"
                                dataKey="range"
                                width={85}
                                tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
                                axisLine={false}
                                tickLine={false}
                                interval={0}
                              />
                              <ReferenceLine x={0} stroke="#4A2C2A" strokeWidth={2} />
                              <Tooltip
                                cursor={{ fill: 'rgba(60, 42, 33, 0.04)' }}
                                content={({ active, payload }) => {
                                  if (!active || !payload || !payload.length) return null;
                                  const d = payload[0].payload;
                                  return (
                                    <div className="bg-brand-brown p-3.5 rounded-2xl shadow-xl border border-brand-stone text-white text-xs min-w-[210px]">
                                      <p className="text-brand-yellow font-black uppercase text-[10px] tracking-wider mb-2">
                                        {d.range} • {cp.label} vs {baselineData?.period.label}
                                      </p>
                                      <div className="space-y-1">
                                        <div className="flex justify-between gap-4">
                                          <span className="text-white/60">Baseline:</span>
                                          <span className="font-bold">
                                            {formatMetricValue(d.baseVal, metric)} ({d.baseOrdersPerDay.toFixed(2)} ord/d)
                                          </span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-white/60">Comparison:</span>
                                          <span className="font-bold">{formatMetricValue(d.compVal, metric)}</span>
                                        </div>
                                        <div className="flex justify-between gap-4 pt-1 border-t border-white/10">
                                          <span className="text-white/60">Change:</span>
                                          <span className="font-black text-brand-yellow">
                                            {formatSignedDelta(d.delta, metric)} ({d.truePctText})
                                          </span>
                                        </div>
                                        {d.isSmallBase && (
                                          <p className="text-[9px] text-amber-300 font-bold pt-1">
                                            Small base: baseline &lt; 1 order/day
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              <Bar dataKey="clampedPct" barSize={18} radius={[4, 4, 4, 4]}>
                                {divData.map(entry => {
                                  const fill =
                                    entry.clampedPct > 0
                                      ? '#059669'
                                      : entry.clampedPct < 0
                                      ? '#DC2626'
                                      : '#9CA3AF';
                                  return (
                                    <Cell
                                      key={entry.id}
                                      fill={fill}
                                      fillOpacity={entry.isSmallBase ? 0.35 : 0.88}
                                    />
                                  );
                                })}
                                <LabelList dataKey="id" content={renderDivergingLabel} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              VIEW 3: TABLE (Sticky first col, expandable channels, CSV export)
             ================================================================= */}
          {activeTab === 'table' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] font-bold text-brand-brown/60">
                  Click any bucket row to expand Dine-In / Takeaway / Delivery breakdown. Baseline:{' '}
                  <strong className="text-brand-brown">{baselineData?.period.label || validBaselineId}</strong> • Delta &amp; % Delta metric:{' '}
                  <strong className="text-brand-brown">{COMPARE_METRIC_LABELS[metric]}</strong>.
                </p>
                <button
                  onClick={handleExportCsv}
                  className="px-3.5 py-2 rounded-xl bg-brand-brown text-brand-yellow text-[10px] font-black uppercase tracking-wider hover:opacity-90 flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-brand-stone bg-white">
                <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-brand-cream border-b border-brand-stone text-[9px] font-black uppercase tracking-wider text-brand-brown">
                      <th
                        rowSpan={2}
                        className="sticky left-0 z-20 bg-brand-cream py-3 px-4 border-r border-brand-stone min-w-[160px]"
                      >
                        Order Value Range
                      </th>
                      {periods.map(p => (
                        <th
                          key={p.id}
                          colSpan={5}
                          className="py-2 px-3 text-center border-r border-brand-stone"
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            <span>
                              {p.id}: {p.label}
                            </span>
                            {p.id === validBaselineId && (
                              <span className="px-1.5 py-0.5 rounded bg-brand-brown text-brand-yellow text-[7.5px]">
                                BASE
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                      {comparisonPeriods.map(cp => (
                        <th
                          key={`diff_${cp.id}`}
                          colSpan={2}
                          className="py-2 px-3 text-center border-r border-brand-stone bg-brand-brown/5"
                        >
                          {cp.id} vs {baselineData?.period.id} ({COMPARE_METRIC_LABELS[metric]})
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-brand-brown/5 border-b border-brand-stone text-[8.5px] font-black uppercase tracking-wider text-brand-brown/70">
                      {periods.map(p => (
                        <React.Fragment key={`sub_${p.id}`}>
                          <th className="py-2 px-2.5 text-right">Orders</th>
                          <th className="py-2 px-2.5 text-right">Revenue</th>
                          <th className="py-2 px-2.5 text-right">Ord/d</th>
                          <th className="py-2 px-2.5 text-right">Rev/d</th>
                          <th className="py-2 px-2.5 text-right border-r border-brand-stone">Avg Tkt</th>
                        </React.Fragment>
                      ))}
                      {comparisonPeriods.map(cp => (
                        <React.Fragment key={`sub_diff_${cp.id}`}>
                          <th className="py-2 px-2.5 text-right bg-brand-brown/5">Delta (Δ)</th>
                          <th className="py-2 px-2.5 text-right border-r border-brand-stone bg-brand-brown/5">% Δ</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-stone/50">
                    {activeBuckets.map(b => {
                      const isExpanded = Boolean(expandedBucketIds[b.id]);
                      const baseM = baselineData?.byBucket[b.id];
                      const baseMetricVal = baseM ? getMetricValue(baseM, metric) : 0;

                      return (
                        <React.Fragment key={b.id}>
                          <tr
                            onClick={() =>
                              setExpandedBucketIds(prev => ({ ...prev, [b.id]: !prev[b.id] }))
                            }
                            className="cursor-pointer hover:bg-brand-cream/60 transition-colors"
                          >
                            <td className="sticky left-0 z-10 bg-white py-2.5 px-4 font-black text-brand-brown border-r border-brand-stone">
                              <div className="flex items-center gap-1.5">
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-brand-red shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-brand-brown/50 shrink-0" />
                                )}
                                <span>{b.label}</span>
                              </div>
                            </td>
                            {periods.map(p => {
                              const m = computedByPeriod[p.id]?.byBucket[b.id];
                              return (
                                <React.Fragment key={`${b.id}_${p.id}`}>
                                  <td className="py-2.5 px-2.5 text-right font-bold text-gray-800">
                                    {m ? m.orders.toLocaleString() : '0'}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-bold text-brand-red">
                                    ₹{m ? m.revenue.toLocaleString() : '0'}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right text-gray-700">
                                    {m ? m.ordersPerDay.toFixed(1) : '0.0'}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right text-gray-700">
                                    ₹{m ? Math.round(m.revenuePerDay).toLocaleString() : '0'}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-bold text-brand-brown border-r border-brand-stone">
                                    ₹{m ? m.avgTicket.toLocaleString() : '0'}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                            {comparisonPeriods.map(cp => {
                              const compM = computedByPeriod[cp.id]?.byBucket[b.id];
                              const compVal = compM ? getMetricValue(compM, metric) : 0;
                              const d = computeDelta(baseMetricVal, compVal);
                              const colorCls =
                                d.status === 'new' || d.delta > 0
                                  ? 'text-emerald-700'
                                  : d.delta < 0
                                  ? 'text-rose-700'
                                  : 'text-gray-500';
                              return (
                                <React.Fragment key={`diff_${b.id}_${cp.id}`}>
                                  <td className={`py-2.5 px-2.5 text-right font-black bg-brand-cream/20 ${colorCls}`}>
                                    {formatSignedDelta(d, metric)}
                                  </td>
                                  <td
                                    className={`py-2.5 px-2.5 text-right font-black border-r border-brand-stone bg-brand-cream/20 ${colorCls}`}
                                  >
                                    {formatSignedPct(d)}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>

                          {/* Expanded Dine-In / Takeaway / Delivery + Zomato Brand Split Sub-Rows */}
                          {isExpanded &&
                            EXPANDABLE_SUBCHANNELS.map(ch => {
                              const baseChM = baselineData?.byBucketAndChannel[b.id]?.[ch];
                              const baseChVal = baseChM ? getMetricValue(baseChM, metric) : 0;
                              const isBrandSubRow = ch === 'DELIVERY_MINMOMOS' || ch === 'DELIVERY_MINCHICKEN';
                              return (
                                <tr
                                  key={`${b.id}_${ch}`}
                                  className={`${isBrandSubRow ? 'bg-orange-50/60' : 'bg-brand-cream/35'} text-[11px]`}
                                >
                                  <td
                                    className={`sticky left-0 z-10 py-2 pr-4 font-bold text-brand-brown/75 border-r border-brand-stone ${
                                      isBrandSubRow ? 'bg-[#fdf4ee] pl-12 text-[10.5px]' : 'bg-brand-cream/95 pl-9'
                                    }`}
                                  >
                                    ↳ {CHANNEL_LABELS[ch]}
                                  </td>
                                  {periods.map(p => {
                                    const cm = computedByPeriod[p.id]?.byBucketAndChannel[b.id]?.[ch];
                                    return (
                                      <React.Fragment key={`${b.id}_${ch}_${p.id}`}>
                                        <td className="py-2 px-2.5 text-right text-gray-700">
                                          {cm ? cm.orders.toLocaleString() : '0'}
                                        </td>
                                        <td className="py-2 px-2.5 text-right text-gray-700">
                                          ₹{cm ? cm.revenue.toLocaleString() : '0'}
                                        </td>
                                        <td className="py-2 px-2.5 text-right text-gray-600">
                                          {cm ? cm.ordersPerDay.toFixed(1) : '0.0'}
                                        </td>
                                        <td className="py-2 px-2.5 text-right text-gray-600">
                                          ₹{cm ? Math.round(cm.revenuePerDay).toLocaleString() : '0'}
                                        </td>
                                        <td className="py-2 px-2.5 text-right text-gray-700 border-r border-brand-stone">
                                          ₹{cm ? cm.avgTicket.toLocaleString() : '0'}
                                        </td>
                                      </React.Fragment>
                                    );
                                  })}
                                  {comparisonPeriods.map(cp => {
                                    const compChM = computedByPeriod[cp.id]?.byBucketAndChannel[b.id]?.[ch];
                                    const compChVal = compChM ? getMetricValue(compChM, metric) : 0;
                                    const d = computeDelta(baseChVal, compChVal);
                                    const colorCls =
                                      d.status === 'new' || d.delta > 0
                                        ? 'text-emerald-700'
                                        : d.delta < 0
                                        ? 'text-rose-700'
                                        : 'text-gray-500';
                                    return (
                                      <React.Fragment key={`diff_${b.id}_${ch}_${cp.id}`}>
                                        <td className={`py-2 px-2.5 text-right font-bold ${colorCls}`}>
                                          {formatSignedDelta(d, metric)}
                                        </td>
                                        <td className={`py-2 px-2.5 text-right font-bold border-r border-brand-stone ${colorCls}`}>
                                          {formatSignedPct(d)}
                                        </td>
                                      </React.Fragment>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-brand-brown/10 text-brand-brown font-black border-t-2 border-brand-stone">
                      <td className="sticky left-0 z-10 bg-[#efe9e4] py-3 px-4 uppercase border-r border-brand-stone">
                        Total ({CHANNEL_LABELS[channel]})
                      </td>
                      {periods.map(p => {
                        const tot = computedByPeriod[p.id]?.totals;
                        return (
                          <React.Fragment key={`tot_${p.id}`}>
                            <td className="py-3 px-2.5 text-right">{tot ? tot.orders.toLocaleString() : '0'}</td>
                            <td className="py-3 px-2.5 text-right text-brand-red">
                              ₹{tot ? tot.revenue.toLocaleString() : '0'}
                            </td>
                            <td className="py-3 px-2.5 text-right">{tot ? tot.ordersPerDay.toFixed(1) : '0.0'}</td>
                            <td className="py-3 px-2.5 text-right">
                              ₹{tot ? Math.round(tot.revenuePerDay).toLocaleString() : '0'}
                            </td>
                            <td className="py-3 px-2.5 text-right border-r border-brand-stone">
                              ₹{tot ? tot.avgTicket.toLocaleString() : '0'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {comparisonPeriods.map(cp => {
                        const baseTotVal = baselineData ? getMetricValue(baselineData.totals, metric) : 0;
                        const compTot = computedByPeriod[cp.id]?.totals;
                        const compTotVal = compTot ? getMetricValue(compTot, metric) : 0;
                        const d = computeDelta(baseTotVal, compTotVal);
                        const colorCls =
                          d.status === 'new' || d.delta > 0
                            ? 'text-emerald-700'
                            : d.delta < 0
                            ? 'text-rose-700'
                            : 'text-gray-600';
                        return (
                          <React.Fragment key={`tot_diff_${cp.id}`}>
                            <td className={`py-3 px-2.5 text-right ${colorCls}`}>
                              {formatSignedDelta(d, metric)}
                            </td>
                            <td className={`py-3 px-2.5 text-right border-r border-brand-stone ${colorCls}`}>
                              {formatSignedPct(d)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* =================================================================
              VIEW 4: HEATMAP (Buckets x Channels)
             ================================================================= */}
          {activeTab === 'heatmap' && (() => {
            const compPeriodObj = periods.find(p => p.id === activeHeatmapPeriodId) || comparisonPeriods[0];
            const baseAllPeriod = computePeriodMetrics(
              baselineData.period,
              periodAggs[baselineData.period.id],
              activeBuckets,
              'ALL',
              countActiveDays
            );
            const compAllPeriod = compPeriodObj
              ? computePeriodMetrics(
                  compPeriodObj,
                  periodAggs[compPeriodObj.id],
                  activeBuckets,
                  'ALL',
                  countActiveDays
                )
              : baseAllPeriod;

            return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-brand-brown">
                    Channel × Ticket Bucket Change Heatmap
                  </p>
                  <p className="text-[10px] font-bold text-brand-brown/50">
                    Showing % change and delta/day for <strong className="text-brand-brown">{COMPARE_METRIC_LABELS[metric]}</strong> vs Baseline ({baselineData?.period.label})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-brand-brown/50">
                    Comparison Period:
                  </span>
                  <select
                    value={activeHeatmapPeriodId}
                    onChange={e => setHeatmapPeriodId(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-brand-stone bg-white text-xs font-black text-brand-brown outline-none"
                  >
                    {comparisonPeriods.map(cp => (
                      <option key={cp.id} value={cp.id}>
                        {cp.id}: {cp.label} ({cp.startDate} → {cp.endDate})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-brand-stone bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-cream border-b border-brand-stone text-[9.5px] font-black uppercase tracking-wider text-brand-brown">
                      <th className="py-3 px-4 border-r border-brand-stone">Ticket Bucket</th>
                      {CHANNEL_ORDER.map(ch => (
                        <th key={ch} className="py-3 px-4 text-center border-r border-brand-stone last:border-r-0">
                          {CHANNEL_LABELS[ch]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-stone/60">
                    {activeBuckets.map(b => {
                      const renderCell = (ch: CompareChannel) => {
                        const baseM =
                          ch === 'ALL'
                            ? baseAllPeriod.byBucket[b.id]
                            : baseAllPeriod.byBucketAndChannel[b.id][ch];
                        const compM =
                          ch === 'ALL'
                            ? compAllPeriod.byBucket[b.id]
                            : compAllPeriod.byBucketAndChannel[b.id][ch];

                        const pctDeltaRes = computeDelta(
                          getMetricValue(baseM, metric),
                          getMetricValue(compM, metric)
                        );

                        // Per-day delta aligned with the chosen metric family
                        const perDayMetric: CompareMetric =
                          metric === 'revenue' || metric === 'revenuePerDay'
                            ? 'revenuePerDay'
                            : metric === 'orders' || metric === 'ordersPerDay'
                            ? 'ordersPerDay'
                            : metric;

                        const perDayDeltaRes = computeDelta(
                          getMetricValue(baseM, perDayMetric),
                          getMetricValue(compM, perDayMetric)
                        );

                        const isSmallBase = baseM.ordersPerDay < 1;
                        const style = getHeatmapCellStyle(pctDeltaRes.pctChange, pctDeltaRes.status, isSmallBase);

                        return (
                          <td
                            key={ch}
                            style={style}
                            className="py-3 px-3 text-center border-r border-brand-stone/60 last:border-r-0 transition-colors"
                          >
                            <p className="text-sm font-black leading-none">
                              {formatSignedPct(pctDeltaRes)}
                            </p>
                            <p className="text-[10px] font-bold mt-1 opacity-85">
                              {formatSignedDelta(perDayDeltaRes, perDayMetric)}
                            </p>
                            {isSmallBase && pctDeltaRes.status !== 'both_zero' && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-white/70 text-[7.5px] font-black uppercase tracking-wider">
                                small base
                              </span>
                            )}
                          </td>
                        );
                      };

                      return (
                        <tr key={b.id}>
                          <td className="py-3 px-4 font-black text-xs text-brand-brown border-r border-brand-stone bg-brand-cream/40">
                            {b.label}
                          </td>
                          {CHANNEL_ORDER.map(ch => renderCell(ch))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

          {/* =================================================================
              VIEW 5: MOVERS (Top 5 Gains & Losses by /day across Channel x Bucket)
             ================================================================= */}
          {activeTab === 'movers' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-brand-brown">
                    Biggest Channel × Bucket Movers (Excluding All)
                  </p>
                  <p className="text-[10px] font-bold text-brand-brown/50">
                    Top 5 gains and top 5 losses ranked by change per day vs {baselineData?.period.label}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMoversSplitBrands(prev => !prev)}
                    className={`px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all ${
                      moversSplitBrands
                        ? 'bg-brand-red text-white border-brand-red shadow-sm'
                        : 'bg-white text-brand-brown border-brand-stone hover:bg-brand-brown/5'
                    }`}
                  >
                    {moversSplitBrands ? '✓ Splitting MinMomos & MinChicken' : 'Split Zomato Brands'}
                  </button>
                  <span className="text-[9px] font-black uppercase tracking-wider text-brand-brown/50">
                    Comparison Period:
                  </span>
                  <select
                    value={activeMoversPeriodId}
                    onChange={e => setMoversPeriodId(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-brand-stone bg-white text-xs font-black text-brand-brown outline-none"
                  >
                    {comparisonPeriods.map(cp => (
                      <option key={cp.id} value={cp.id}>
                        {cp.id}: {cp.label} ({cp.startDate} → {cp.endDate})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Orders/day Movers */}
                <div className="bg-brand-cream/35 border border-brand-stone rounded-3xl p-5 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown pb-2 border-b border-brand-stone">
                    Orders / Day Movers
                  </h4>

                  <div className="space-y-2">
                    <p className="text-[9.5px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Top 5 Gains (Orders/day)
                    </p>
                    {moversData.ordersGains.length === 0 ? (
                      <p className="text-xs text-brand-brown/50 py-2">No positive order/day movers.</p>
                    ) : (
                      moversData.ordersGains.map((m, idx) => (
                        <div
                          key={m.key}
                          className="flex items-center justify-between gap-2 bg-white border border-emerald-200/80 rounded-2xl px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[9px] font-black text-emerald-700">#{idx + 1}</span>
                              <span className="text-xs font-black text-brand-brown">{m.channelLabel}</span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-brand-cream border border-brand-stone text-brand-brown">
                                {m.bucketLabel}
                              </span>
                              {m.isSmallBase && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  small base
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-brand-brown/50 mt-0.5">
                              {m.basePerDay.toFixed(2)}/d → {m.compPerDay.toFixed(2)}/d
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-emerald-700">
                              {formatSignedDelta(m.delta, 'ordersPerDay')}
                            </p>
                            <p className="text-[10px] font-bold text-emerald-600">
                              {formatSignedPct(m.delta)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="text-[9.5px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      Top 5 Losses (Orders/day)
                    </p>
                    {moversData.ordersLosses.length === 0 ? (
                      <p className="text-xs text-brand-brown/50 py-2">No negative order/day movers.</p>
                    ) : (
                      moversData.ordersLosses.map((m, idx) => (
                        <div
                          key={m.key}
                          className="flex items-center justify-between gap-2 bg-white border border-rose-200/80 rounded-2xl px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[9px] font-black text-rose-700">#{idx + 1}</span>
                              <span className="text-xs font-black text-brand-brown">{m.channelLabel}</span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-brand-cream border border-brand-stone text-brand-brown">
                                {m.bucketLabel}
                              </span>
                              {m.isSmallBase && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  small base
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-brand-brown/50 mt-0.5">
                              {m.basePerDay.toFixed(2)}/d → {m.compPerDay.toFixed(2)}/d
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-rose-700">
                              {formatSignedDelta(m.delta, 'ordersPerDay')}
                            </p>
                            <p className="text-[10px] font-bold text-rose-600">
                              {formatSignedPct(m.delta)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Revenue/day Movers */}
                <div className="bg-brand-cream/35 border border-brand-stone rounded-3xl p-5 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown pb-2 border-b border-brand-stone">
                    Revenue / Day Movers
                  </h4>

                  <div className="space-y-2">
                    <p className="text-[9.5px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Top 5 Gains (Revenue/day)
                    </p>
                    {moversData.revGains.length === 0 ? (
                      <p className="text-xs text-brand-brown/50 py-2">No positive revenue/day movers.</p>
                    ) : (
                      moversData.revGains.map((m, idx) => (
                        <div
                          key={m.key}
                          className="flex items-center justify-between gap-2 bg-white border border-emerald-200/80 rounded-2xl px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[9px] font-black text-emerald-700">#{idx + 1}</span>
                              <span className="text-xs font-black text-brand-brown">{m.channelLabel}</span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-brand-cream border border-brand-stone text-brand-brown">
                                {m.bucketLabel}
                              </span>
                              {m.isSmallBase && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  small base
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-brand-brown/50 mt-0.5">
                              ₹{Math.round(m.basePerDay).toLocaleString()}/d → ₹{Math.round(m.compPerDay).toLocaleString()}/d
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-emerald-700">
                              {formatSignedDelta(m.delta, 'revenuePerDay')}
                            </p>
                            <p className="text-[10px] font-bold text-emerald-600">
                              {formatSignedPct(m.delta)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="text-[9.5px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      Top 5 Losses (Revenue/day)
                    </p>
                    {moversData.revLosses.length === 0 ? (
                      <p className="text-xs text-brand-brown/50 py-2">No negative revenue/day movers.</p>
                    ) : (
                      moversData.revLosses.map((m, idx) => (
                        <div
                          key={m.key}
                          className="flex items-center justify-between gap-2 bg-white border border-rose-200/80 rounded-2xl px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[9px] font-black text-rose-700">#{idx + 1}</span>
                              <span className="text-xs font-black text-brand-brown">{m.channelLabel}</span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-brand-cream border border-brand-stone text-brand-brown">
                                {m.bucketLabel}
                              </span>
                              {m.isSmallBase && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  small base
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-brand-brown/50 mt-0.5">
                              ₹{Math.round(m.basePerDay).toLocaleString()}/d → ₹{Math.round(m.compPerDay).toLocaleString()}/d
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-black text-rose-700">
                              {formatSignedDelta(m.delta, 'revenuePerDay')}
                            </p>
                            <p className="text-[10px] font-bold text-rose-600">
                              {formatSignedPct(m.delta)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TicketBucketCompare;
