import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  Check, 
  Tags, 
  RotateCcw,
  Unlink,
  Layers,
  FolderTree
} from 'lucide-react';

export interface StockSubcategoryItem {
  id: string;
  label: string;
  icon: string;
  category: 'PACKET' | 'INGREDIENT' | 'MOMO' | string;
  isCustom?: boolean;
}

interface SubcategoryManagerProps {
  subcategories: StockSubcategoryItem[];
  debitCategories: string[];
  categoryMappings: Record<string, string[]>;
  onUpdateMapping: (subId: string, targetExpenseCat: string, subLabel?: string) => Promise<void>;
  onCreateSubcategory: (item: {
    name: string;
    icon: string;
    parentCategory: 'PACKET' | 'INGREDIENT' | 'MOMO';
    expenseMapping: string;
  }) => Promise<void>;
  onDeleteSubcategory: (subId: string, subLabel: string, isCustom?: boolean) => Promise<void>;
  onSaveEditSubcategory: (sub: {
    id: string;
    label: string;
    icon: string;
    category: string;
    isCustom?: boolean;
  }) => Promise<void>;
  onRestoreDefaultSubcategories?: () => void;
  deletedSubcategoriesCount?: number;
  notification?: string | null;
  onDismissNotification?: () => void;
}

const COMMON_EMOJIS = ['🍗', '🥩', '🧀', '🌶️', '🧈', '🥫', '📦', '🍟', '🥤', '🥬', '🍞', '🧴', '🏷️', '🧹', '🍳', '🧊', '🥟', '🍔', '🍹', '☕'];

export const SubcategoryManager: React.FC<SubcategoryManagerProps> = ({
  subcategories,
  debitCategories,
  categoryMappings,
  onUpdateMapping,
  onCreateSubcategory,
  onDeleteSubcategory,
  onSaveEditSubcategory,
  onRestoreDefaultSubcategories,
  deletedSubcategoriesCount = 0,
  notification,
  onDismissNotification,
}) => {
  const [activeTab, setActiveTab] = useState<'subcategories' | 'overview'>('subcategories');

  // Form states for creating new subcategory
  const [newSubcatName, setNewSubcatName] = useState('');
  const [newSubcatIcon, setNewSubcatIcon] = useState('🏷️');
  const [newSubcatParent, setNewSubcatParent] = useState<'PACKET' | 'INGREDIENT' | 'MOMO'>('PACKET');
  const [newSubcatExpenseMapping, setNewSubcatExpenseMapping] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'PACKET' | 'INGREDIENT' | 'MOMO'>('ALL');
  const [mappingFilter, setMappingFilter] = useState<'ALL' | 'MAPPED' | 'UNMAPPED' | 'CUSTOM'>('ALL');

  // Editing state
  const [editingSubcat, setEditingSubcat] = useState<StockSubcategoryItem | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editCategory, setEditCategory] = useState<'PACKET' | 'INGREDIENT' | 'MOMO'>('PACKET');

  // Transient save feedback
  const [savedSubId, setSavedSubId] = useState<string | null>(null);

  // Helper to determine mapped category
  const getMappedCategory = (subId: string): string => {
    if (categoryMappings['__unmapped__']?.includes(subId)) {
      return '';
    }
    for (const [catName, mappedList] of Object.entries(categoryMappings)) {
      if (catName !== '__unmapped__' && Array.isArray(mappedList) && mappedList.includes(subId)) {
        return catName;
      }
    }
    return '';
  };

  // Metrics
  const totalCount = subcategories.length;
  const mappedCount = useMemo(() => {
    return subcategories.filter(s => !!getMappedCategory(s.id)).length;
  }, [subcategories, categoryMappings]);
  const unmappedCount = totalCount - mappedCount;
  const customCount = useMemo(() => {
    return subcategories.filter(s => s.isCustom).length;
  }, [subcategories]);

  // Filtered subcategories
  const filteredList = useMemo(() => {
    return subcategories.filter(sub => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const match = sub.label.toLowerCase().includes(q) || sub.id.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (categoryFilter !== 'ALL' && sub.category !== categoryFilter) {
        return false;
      }
      const mappedCat = getMappedCategory(sub.id);
      if (mappingFilter === 'MAPPED' && !mappedCat) return false;
      if (mappingFilter === 'UNMAPPED' && mappedCat) return false;
      if (mappingFilter === 'CUSTOM' && !sub.isCustom) return false;
      return true;
    });
  }, [subcategories, searchTerm, categoryFilter, mappingFilter, categoryMappings]);

  // Create submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newSubcatName.trim();
    if (!cleanName) {
      alert('Please enter a subcategory name.');
      return;
    }

    setIsCreating(true);
    try {
      await onCreateSubcategory({
        name: cleanName,
        icon: newSubcatIcon.trim() || '🏷️',
        parentCategory: newSubcatParent,
        expenseMapping: newSubcatExpenseMapping,
      });
      setNewSubcatName('');
      setNewSubcatIcon('🏷️');
      setNewSubcatExpenseMapping('');
    } catch (err: any) {
      console.error('Failed to create subcategory:', err);
      alert(`Error creating subcategory: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Mapping change handler
  const handleMappingSelectChange = async (subId: string, newMapping: string, subLabel: string) => {
    await onUpdateMapping(subId, newMapping, subLabel);
    setSavedSubId(subId);
    setTimeout(() => {
      setSavedSubId(prev => (prev === subId ? null : prev));
    }, 2000);
  };

  // Open edit modal
  const handleOpenEdit = (sub: StockSubcategoryItem) => {
    setEditingSubcat(sub);
    setEditLabel(sub.label);
    setEditIcon(sub.icon || '🏷️');
    setEditCategory((sub.category as any) || 'PACKET');
  };

  // Save edit modal
  const handleSaveEdit = async () => {
    if (!editingSubcat) return;
    const cleanName = editLabel.trim();
    if (!cleanName) {
      alert('Subcategory name cannot be empty.');
      return;
    }

    await onSaveEditSubcategory({
      id: editingSubcat.id,
      label: cleanName,
      icon: editIcon.trim() || '🏷️',
      category: editCategory,
      isCustom: editingSubcat.isCustom,
    });
    setEditingSubcat(null);
  };

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner / Notification */}
      {notification && (
        <div className="bg-zinc-900 text-white px-5 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-zinc-300" />
            <span>{notification}</span>
          </div>
          {onDismissNotification && (
            <button
              type="button"
              onClick={onDismissNotification}
              className="text-zinc-400 hover:text-white text-xs font-bold ml-4 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Header & Metric Cards */}
      <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2">
              <Tags className="w-5 h-5 text-zinc-700" />
              <h3 className="text-base font-bold text-zinc-900 uppercase tracking-wide">
                Subcategories &amp; Expense Mappings
              </h3>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Create subcategories, edit expense category mappings, and manage warehouse stock classifications.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {deletedSubcategoriesCount > 0 && onRestoreDefaultSubcategories && (
              <button
                type="button"
                onClick={onRestoreDefaultSubcategories}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-zinc-200"
                title="Restore default built-in subcategories"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore ({deletedSubcategoriesCount}) Deleted</span>
              </button>
            )}

            {/* View Switcher Tabs */}
            <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('subcategories')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'subcategories'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Subcategories ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Expense Categories ({debitCategories.length})
              </button>
            </div>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Total Subcategories</span>
            <div className="font-mono text-xl font-bold text-zinc-900 mt-1">{totalCount}</div>
            <span className="text-[10px] text-zinc-400">Warehouse stock items</span>
          </div>

          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Mapped To Expense</span>
            <div className="font-mono text-xl font-bold text-zinc-900 mt-1">{mappedCount}</div>
            <span className="text-[10px] text-zinc-400">Routes to P&amp;L ledger</span>
          </div>

          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Unmapped Items</span>
            <div className="font-mono text-xl font-bold text-zinc-900 mt-1">{unmappedCount}</div>
            <span className="text-[10px] text-zinc-400">Defaults to OTHERS</span>
          </div>

          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Custom Created</span>
            <div className="font-mono text-xl font-bold text-zinc-900 mt-1">{customCount}</div>
            <span className="text-[10px] text-zinc-400">User-defined items</span>
          </div>
        </div>
      </div>

      {activeTab === 'subcategories' && (
        <>
          {/* SECTION 1: Create New Subcategory */}
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-zinc-100 border border-zinc-200 rounded-lg text-xs">
                  <Plus className="w-4 h-4 text-zinc-700" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                    Create New Subcategory
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Add a new item to warehouse inventory and map it directly to an expense ledger category.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Subcategory Name */}
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block">
                    Subcategory Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Chicken, Paneer, Tissue"
                    value={newSubcatName}
                    onChange={e => setNewSubcatName(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800"
                    required
                  />
                </div>

                {/* Warehouse Section */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block">
                    Warehouse Section *
                  </label>
                  <select
                    value={newSubcatParent}
                    onChange={e => setNewSubcatParent(e.target.value as any)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800"
                  >
                    <option value="PACKET">PACKET (Packaged / Materials)</option>
                    <option value="INGREDIENT">INGREDIENT (Fresh Raw / Meat)</option>
                    <option value="MOMO">MOMO (Momo Products / Drinks)</option>
                  </select>
                </div>

                {/* Expense Mapping */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block">
                    Map to Expense Category
                  </label>
                  <select
                    value={newSubcatExpenseMapping}
                    onChange={e => setNewSubcatExpenseMapping(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800"
                  >
                    <option value="">-- Unmapped (Defaults to OTHERS) --</option>
                    {debitCategories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Emoji / Icon Selector */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                    Icon / Emoji
                  </label>
                  <span className="text-[10px] text-zinc-400">Selected: {newSubcatIcon}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 bg-zinc-50 p-2 rounded-xl border border-zinc-200">
                  <input
                    type="text"
                    value={newSubcatIcon}
                    onChange={e => setNewSubcatIcon(e.target.value)}
                    className="w-12 p-1.5 text-center text-sm bg-white border border-zinc-300 rounded-lg outline-none font-bold"
                    maxLength={3}
                  />
                  <div className="flex flex-wrap gap-1">
                    {COMMON_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewSubcatIcon(emoji)}
                        className={`p-1.5 rounded-lg text-sm hover:scale-110 transition-transform cursor-pointer ${
                          newSubcatIcon === emoji ? 'bg-zinc-200 border border-zinc-400 shadow-xs' : 'hover:bg-white'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isCreating || !newSubcatName.trim()}
                  className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isCreating ? 'Creating...' : 'Create Subcategory & Map'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* SECTION 2: Existing Subcategories Directory & Live Mappings Editing */}
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-3 border-b border-zinc-100">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-zinc-700" />
                  <span>Subcategories Directory &amp; Live Mappings</span>
                </h4>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Select an expense category to re-map in real time, edit subcategory names, or delete items.
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-1 bg-zinc-100 text-zinc-700 rounded-lg border border-zinc-200 self-start sm:self-auto">
                {filteredList.length} of {totalCount} Items
              </span>
            </div>

            {/* Search & Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search subcategory by name, id..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Warehouse Section Filter */}
              <div className="flex rounded-xl bg-zinc-100 p-1 text-[10px] font-bold uppercase tracking-wider gap-0.5 border border-zinc-200">
                {(['ALL', 'PACKET', 'INGREDIENT', 'MOMO'] as const).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-white text-zinc-900 shadow-xs font-bold'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    {cat === 'ALL' ? 'All Sections' : cat}
                  </button>
                ))}
              </div>

              {/* Mapping Status Filter */}
              <div className="flex rounded-xl bg-zinc-100 p-1 text-[10px] font-bold uppercase tracking-wider gap-0.5 border border-zinc-200">
                {(['ALL', 'MAPPED', 'UNMAPPED', 'CUSTOM'] as const).map(filter => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setMappingFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      mappingFilter === filter
                        ? 'bg-white text-zinc-900 shadow-xs font-bold'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Subcategories Table */}
            <div className="border border-zinc-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-4">Subcategory</th>
                      <th className="py-3 px-3">Warehouse Section</th>
                      <th className="py-3 px-3">Origin</th>
                      <th className="py-3 px-3 min-w-[240px]">Mapped Expense Category (Live Edit)</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {filteredList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-xs text-zinc-400 font-semibold">
                          No matching subcategories found. Try clearing filters or create a new subcategory.
                        </td>
                      </tr>
                    ) : (
                      filteredList.map(sub => {
                        const mappedExpense = getMappedCategory(sub.id);
                        const isSaved = savedSubId === sub.id;

                        return (
                          <tr key={`${sub.category}-${sub.id}`} className="hover:bg-zinc-50/80 transition-colors">
                            {/* Label & Icon */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <span className="text-base select-none">{sub.icon || '🏷️'}</span>
                                <div>
                                  <div className="font-bold text-zinc-900 text-xs">
                                    {sub.label}
                                  </div>
                                  <span className="text-[9px] font-mono text-zinc-400 font-normal">
                                    id: {sub.id}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Section */}
                            <td className="py-3 px-3">
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200">
                                {sub.category}
                              </span>
                            </td>

                            {/* Origin */}
                            <td className="py-3 px-3">
                              {sub.isCustom ? (
                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-800">
                                  Custom
                                </span>
                              ) : (
                                <span className="text-[9px] font-normal uppercase px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500">
                                  Default
                                </span>
                              )}
                            </td>

                            {/* Live Mapped Expense Select */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <select
                                  value={mappedExpense || 'unmapped'}
                                  onChange={e => handleMappingSelectChange(sub.id, e.target.value, sub.label)}
                                  className={`text-xs font-semibold py-1.5 px-2.5 rounded-xl border transition-all outline-none cursor-pointer ${
                                    mappedExpense
                                      ? 'bg-zinc-100 border-zinc-300 text-zinc-900 hover:bg-zinc-200/70'
                                      : 'bg-zinc-50 border-zinc-200 text-zinc-400 hover:bg-zinc-100'
                                  }`}
                                >
                                  <option value="unmapped">-- Unmapped (Defaults to OTHERS) --</option>
                                  {debitCategories.map(cat => (
                                    <option key={cat} value={cat}>
                                      {cat.toUpperCase()}
                                    </option>
                                  ))}
                                </select>

                                {isSaved && (
                                  <span className="text-[9px] font-bold text-zinc-800 bg-zinc-200 px-2 py-0.5 rounded-md animate-pulse flex items-center gap-1">
                                    <Check className="w-2.5 h-2.5" /> Saved
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Actions Column */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Unlink quick button */}
                                {mappedExpense && (
                                  <button
                                    type="button"
                                    onClick={() => handleMappingSelectChange(sub.id, 'unmapped', sub.label)}
                                    className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer border border-zinc-200"
                                    title="Unlink expense category mapping"
                                  >
                                    <Unlink className="w-3 h-3" />
                                  </button>
                                )}

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(sub)}
                                  className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-colors cursor-pointer border border-zinc-200 shadow-2xs"
                                  title="Edit subcategory name, icon, or section"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete Button */}
                                <button
                                  type="button"
                                  onClick={() => onDeleteSubcategory(sub.id, sub.label, sub.isCustom)}
                                  className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 hover:text-zinc-900 rounded-lg transition-colors cursor-pointer border border-zinc-200 shadow-2xs"
                                  title="Delete subcategory"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Overview Tab: Ledger Expense Categories and Mapped Subcategories */}
      {activeTab === 'overview' && (
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="pb-3 border-b border-zinc-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-zinc-700" />
              <span>Expense Categories &amp; Mapped Subcategories</span>
            </h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Review how warehouse subcategories are grouped into expense accounts for P&amp;L accounting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {debitCategories.map(cat => {
              const mappedSubcatIds = categoryMappings[cat] || [];
              const mappedSubcatDetails = subcategories.filter(s => mappedSubcatIds.includes(s.id));

              return (
                <div key={cat} className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-bold text-xs uppercase tracking-wide text-zinc-900">
                        {cat}
                      </h5>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {mappedSubcatDetails.length} subcategories linked
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 min-h-[36px]">
                    {mappedSubcatDetails.length === 0 ? (
                      <span className="text-[10px] text-zinc-400 italic">No subcategories mapped</span>
                    ) : (
                      mappedSubcatDetails.map(item => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-[10px] font-semibold text-zinc-800 shadow-2xs"
                        >
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Subcategory Modal */}
      {editingSubcat && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[160] p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5 text-zinc-700" />
                <span>Edit Subcategory</span>
              </h4>
              <button
                type="button"
                onClick={() => setEditingSubcat(null)}
                className="text-zinc-400 hover:text-zinc-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block">
                  Subcategory Name
                </label>
                <input
                  type="text"
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block">
                  Warehouse Section
                </label>
                <select
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value as any)}
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-800"
                >
                  <option value="PACKET">PACKET (Packaged / Materials)</option>
                  <option value="INGREDIENT">INGREDIENT (Fresh Raw / Meat)</option>
                  <option value="MOMO">MOMO (Momo Products / Drinks)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block">
                  Icon / Emoji
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editIcon}
                    onChange={e => setEditIcon(e.target.value)}
                    className="w-12 p-2 text-center text-sm bg-zinc-50 border border-zinc-200 rounded-xl font-bold"
                    maxLength={3}
                  />
                  <div className="flex flex-wrap gap-1">
                    {COMMON_EMOJIS.slice(0, 10).map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setEditIcon(em)}
                        className="p-1.5 rounded-lg text-sm hover:bg-zinc-100 cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setEditingSubcat(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
