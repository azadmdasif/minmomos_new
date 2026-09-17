
import React, { useState, useEffect } from 'react';
import { MenuItem, PreparationType, Size, CentralMaterial, RecipeRequirement, MenuSection } from '../types';
import { 
  fetchMenuItems, 
  upsertMenuItem, 
  deleteMenuItem, 
  getCentralInventory, 
  seedStandardInventory,
  fetchMenuSections,
  upsertMenuSection,
  deleteMenuSection,
  getLocalMenuSections
} from '../utils/storage';
import { MENU_ITEMS, DEFAULT_MENU_SECTIONS } from '../constants';
import { supabase } from '../utils/supabase';

const PREP_TYPES: PreparationType[] = ['steamed', 'fried', 'normal', 'peri-peri', 'pan-fried'];
const SIZES: Size[] = ['small', 'medium', 'large'];

const POPULAR_EMOJIS = ['♨️', '🍔', '🥗', '🥤', '🍱', '🍰', '🥟', '🍜', '🍟', '🍕', '🍗', '🌶️', '🧋', '☕', '🍦', '🌮', '🍙', '🍩', '🌯', '🥪'];

const SUPABASE_SQL_SCRIPT = `-- ==========================================================
-- MENU SECTIONS & DYNAMIC CATEGORIES MIGRATION FOR MINMOMOS
-- ==========================================================

-- 1. Create the menu_sections table to store dynamic menu categories
CREATE TABLE IF NOT EXISTS menu_sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🍽️',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE menu_sections ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies for read/write access
CREATE POLICY "Allow public read access on menu_sections"
ON menu_sections FOR SELECT
USING (true);

CREATE POLICY "Allow all modifications on menu_sections"
ON menu_sections FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Seed the initial/default menu sections
INSERT INTO menu_sections (id, name, icon, display_order, is_active)
VALUES
    ('momo', 'Momos', '♨️', 1, true),
    ('moburg', 'Moburg', '🍔', 2, true),
    ('side', 'Sides', '🥗', 3, true),
    ('drink', 'Drinks', '🥤', 4, true),
    ('combo', 'Combos', '🍱', 5, true)
ON CONFLICT (id) DO UPDATE
SET 
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order;

-- 5. Ensure category column in menu_items accepts any text value
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'menu_items' AND column_name = 'category'
    ) THEN
        ALTER TABLE menu_items ALTER COLUMN category TYPE TEXT;
    END IF;

    -- Ensure is_hidden column exists for POS/billing visibility control
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'menu_items' AND column_name = 'is_hidden'
    ) THEN
        ALTER TABLE menu_items ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 6. Helpful indexes for optimal query speeds
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items (category);
CREATE INDEX IF NOT EXISTS idx_menu_sections_order ON menu_sections (display_order);
`;

const formatPrepName = (prep: string) => {
  return prep.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const MenuManager: React.FC = () => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [sections, setSections] = useState<MenuSection[]>(getLocalMenuSections());
  const [centralStock, setCentralStock] = useState<CentralMaterial[]>([]);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Section Management States
  const [selectedFilterSection, setSelectedFilterSection] = useState<string>('ALL');
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Partial<MenuSection> | null>(null);
  const [isManageSectionsOpen, setIsManageSectionsOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSavingSection, setIsSavingSection] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setError(null);
    try {
      const [itemsRes, sectionsRes, centralRes] = await Promise.all([
        fetchMenuItems(),
        fetchMenuSections(),
        getCentralInventory()
      ]);

      if (itemsRes.error) {
        if (itemsRes.error.code === '42P01' || itemsRes.error.message?.includes('does not exist')) {
          setIsTableMissing(true);
        } else {
          setError(itemsRes.error.message);
        }
      } else {
        setItems(itemsRes.data || []);
        setIsTableMissing(false);
      }

      if (sectionsRes.data && sectionsRes.data.length > 0) {
        setSections(sectionsRes.data);
      }

      setCentralStock(centralRes);
    } catch (e: any) {
      console.error("Error loading menu data:", e);
      setIsTableMissing(true);
    }
  };

  const handleSeedMenu = async () => {
    setIsSeeding(true);
    setError(null);
    try {
      // Sync Menu Items from constants
      const { error: seedError } = await supabase.from('menu_items').upsert(MENU_ITEMS);
      if (seedError) throw seedError;
      
      // Sync Default Sections
      try {
        await supabase.from('menu_sections').upsert(DEFAULT_MENU_SECTIONS);
      } catch (secErr) {
        console.warn("Could not upsert sections to Supabase:", secErr);
      }

      // Sync Materials (Bulk Items) from constants
      await seedStandardInventory();

      await loadData();
      alert("SUCCESS: Database perfectly synced with Master Constants List.");
    } catch (e: any) {
      setError(`Seed Failed: ${e.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  // --- ITEM MANAGEMENT ---

  const openAdd = (defaultCategory?: string) => {
    const fallbackCategory = defaultCategory || (sections.length > 0 ? sections[0].id : 'momo');
    setEditingItem({
      id: `item-${Date.now()}`,
      name: '',
      image: '',
      category: fallbackCategory,
      is_hidden: false,
      preparations: { steamed: { small: 0, medium: 0, large: 0 } },
      costs: { steamed: { small: 0, medium: 0, large: 0 } },
      minCoinsPrices: { steamed: { small: 0, medium: 0, large: 0 } },
      recipe: [],
      sizeRecipes: { small: [], medium: [], large: [] }
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (editingItem && editingItem.id && editingItem.name) {
      try {
        const itemToSave = {
          ...editingItem,
          category: editingItem.category || (sections[0]?.id || 'momo'),
          minCoinsPrices: editingItem.minCoinsPrices || {},
          sizeRecipes: editingItem.sizeRecipes || {},
          is_hidden: Boolean(editingItem.is_hidden)
        } as MenuItem;
        
        await upsertMenuItem(itemToSave);
        setIsModalOpen(false);
        await loadData();
      } catch (e: any) {
        alert("Update Error: " + e.message);
      }
    }
  };

  const handleToggleHideItem = async (item: MenuItem) => {
    const updatedHidden = !item.is_hidden;
    try {
      // Optimistic update
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_hidden: updatedHidden } : i));
      await upsertMenuItem({ ...item, is_hidden: updatedHidden });
    } catch (e: any) {
      alert("Failed to update visibility: " + e.message);
      await loadData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this item? This action cannot be undone.')) return;
    setIsDeleting(id);
    try {
      await deleteMenuItem(id);
      await loadData();
    } catch (e: any) {
      console.error("Delete handler error:", e);
      alert(`Delete Failed: ${e.message}\n\nNote: If this item has been ordered before, the database preserves it for history. Consider renaming it or setting its price to 0/marking out of stock instead of deleting.`);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleQuickMoveItem = async (item: MenuItem, newCategory: string) => {
    if (item.category === newCategory) return;
    try {
      // Optimistic update
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, category: newCategory } : i));
      await upsertMenuItem({ ...item, category: newCategory });
    } catch (e: any) {
      alert("Failed to move item: " + e.message);
      await loadData();
    }
  };

  // --- SECTION MANAGEMENT ---

  const openAddSection = () => {
    const nextOrder = sections.length > 0 ? Math.max(...sections.map(s => s.display_order || 0)) + 1 : 1;
    setEditingSection({
      id: '',
      name: '',
      icon: '🍽️',
      display_order: nextOrder,
      is_active: true
    });
    setIsSectionModalOpen(true);
  };

  const openEditSection = (section: MenuSection) => {
    setEditingSection({ ...section });
    setIsSectionModalOpen(true);
  };

  const handleSaveSection = async () => {
    if (!editingSection || !editingSection.name?.trim()) {
      alert("Please enter a valid Section Name.");
      return;
    }

    setIsSavingSection(true);
    try {
      // Generate slug ID if not provided
      let id = editingSection.id?.trim();
      if (!id) {
        id = editingSection.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        if (!id) id = `section-${Date.now()}`;
      }

      const sectionToSave: MenuSection = {
        id,
        name: editingSection.name.trim(),
        icon: editingSection.icon?.trim() || '🍽️',
        display_order: Number(editingSection.display_order) || (sections.length + 1),
        is_active: editingSection.is_active ?? true
      };

      await upsertMenuSection(sectionToSave);
      await loadData();
      setIsSectionModalOpen(false);
      setEditingSection(null);
    } catch (e: any) {
      alert("Error saving section: " + e.message);
    } finally {
      setIsSavingSection(false);
    }
  };

  const handleDeleteSection = async (section: MenuSection) => {
    const itemsInSection = items.filter(i => i.category === section.id);
    
    if (itemsInSection.length > 0) {
      const otherSections = sections.filter(s => s.id !== section.id);
      if (otherSections.length === 0) {
        alert(`Cannot delete the only section while it still contains ${itemsInSection.length} items. Please create another section first.`);
        return;
      }

      const defaultTarget = otherSections[0];
      const shouldReassign = confirm(
        `Section "${section.name}" contains ${itemsInSection.length} menu items.\n\n` +
        `Click OK to move all ${itemsInSection.length} items to "${defaultTarget.name}" and delete "${section.name}".\n` +
        `Click CANCEL to abort.`
      );

      if (!shouldReassign) return;

      // Reassign items to the other section
      try {
        for (const itm of itemsInSection) {
          await upsertMenuItem({ ...itm, category: defaultTarget.id });
        }
      } catch (err: any) {
        alert("Failed to reassign items: " + err.message);
        return;
      }
    } else {
      if (!confirm(`Are you sure you want to delete section "${section.name}"?`)) {
        return;
      }
    }

    try {
      await deleteMenuSection(section.id);
      if (selectedFilterSection === section.id) {
        setSelectedFilterSection('ALL');
      }
      await loadData();
    } catch (e: any) {
      alert("Failed to delete section: " + e.message);
    }
  };

  const handleReorderSection = async (sectionId: string, direction: 'up' | 'down') => {
    const sorted = [...sections].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = sorted.findIndex(s => s.id === sectionId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === sorted.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const currentOrder = sorted[idx].display_order ?? idx;
    const swapOrder = sorted[swapIdx].display_order ?? swapIdx;

    // Invert orders
    sorted[idx].display_order = swapOrder;
    sorted[swapIdx].display_order = currentOrder;

    // Optimistically update
    setSections([...sorted]);

    try {
      await Promise.all([
        upsertMenuSection(sorted[idx]),
        upsertMenuSection(sorted[swapIdx])
      ]);
      await loadData();
    } catch (e: any) {
      console.error("Reorder error:", e);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  // --- ITEM VARIANT / RECIPE EDITING ---

  const togglePrep = (prep: PreparationType) => {
    if (!editingItem) return;
    const newPreps = { ...(editingItem.preparations || {}) };
    const newCosts = { ...(editingItem.costs || {}) };
    const newRedeem = { ...(editingItem.minCoinsPrices || {}) };

    if (newPreps[prep]) {
      delete newPreps[prep];
      delete newCosts[prep];
      delete newRedeem[prep];
    } else {
      newPreps[prep] = { small: 0, medium: 0, large: 0 };
      newCosts[prep] = { small: 0, medium: 0, large: 0 };
      newRedeem[prep] = { small: 0, medium: 0, large: 0 };
    }

    setEditingItem({ ...editingItem, preparations: newPreps, costs: newCosts, minCoinsPrices: newRedeem });
  };

  const updateVal = (type: 'price' | 'cost' | 'redeem', prep: PreparationType, size: Size, val: string) => {
    if (!editingItem) return;
    const numVal = parseFloat(val) || 0;
    const targetMap = {
      price: 'preparations',
      cost: 'costs',
      redeem: 'minCoinsPrices'
    };
    const targetField = targetMap[type] as keyof MenuItem;
    
    const updatedData = { ...(editingItem[targetField] as any) || {} };
    if (!updatedData[prep]) updatedData[prep] = {};
    updatedData[prep][size] = numVal;

    setEditingItem({ ...editingItem, [targetField]: updatedData });
  };

  const addRecipeRow = (size?: Size) => {
    if (!editingItem) return;
    if (size) {
      const sizeRecipes = { ...(editingItem.sizeRecipes || { small: [], medium: [], large: [] }) };
      sizeRecipes[size] = [...(sizeRecipes[size] || []), { materialId: '', quantity: 1 }];
      setEditingItem({ ...editingItem, sizeRecipes });
    } else {
      const recipe = [...(editingItem.recipe || [])];
      recipe.push({ materialId: '', quantity: 1 });
      setEditingItem({ ...editingItem, recipe });
    }
  };

  const updateRecipeRow = (index: number, field: keyof RecipeRequirement, value: string | number, size?: Size) => {
    if (!editingItem) return;
    if (size) {
      const sizeRecipes = { ...(editingItem.sizeRecipes || {}) };
      const currentSizeRecipe = [...(sizeRecipes[size] || [])];
      currentSizeRecipe[index] = { ...currentSizeRecipe[index], [field]: value };
      sizeRecipes[size] = currentSizeRecipe;
      setEditingItem({ ...editingItem, sizeRecipes });
    } else {
      if (!editingItem.recipe) return;
      const recipe = [...editingItem.recipe];
      recipe[index] = { ...recipe[index], [field]: value };
      setEditingItem({ ...editingItem, recipe });
    }
  };

  const removeRecipeRow = (index: number, size?: Size) => {
    if (!editingItem) return;
    if (size) {
      const sizeRecipes = { ...(editingItem.sizeRecipes || {}) };
      sizeRecipes[size] = (sizeRecipes[size] || []).filter((_, i) => i !== index);
      setEditingItem({ ...editingItem, sizeRecipes });
    } else {
      if (!editingItem.recipe) return;
      const recipe = editingItem.recipe.filter((_, i) => i !== index);
      setEditingItem({ ...editingItem, recipe });
    }
  };

  const inputClasses = "w-full p-3 rounded-xl border-2 border-brand-stone bg-white text-brand-brown font-black text-sm focus:border-brand-yellow outline-none transition-all";

  if (isTableMissing) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-center bg-brand-cream overflow-y-auto no-scrollbar">
        <div className="max-w-4xl bg-white p-12 rounded-[3rem] shadow-2xl border-4 border-brand-red">
          <h2 className="text-4xl font-black text-brand-brown mb-4 uppercase italic">Database <span className="text-brand-red">Setup Required</span></h2>
          <p className="text-brand-brown/60 mb-6 font-bold uppercase tracking-widest text-xs">Menu items or sections table needs initialization in Supabase.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button onClick={handleSeedMenu} disabled={isSeeding} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl disabled:opacity-50">
              {isSeeding ? 'Syncing...' : 'Initialize & Sync Master Menu'}
            </button>
            <button onClick={loadData} className="bg-brand-brown text-brand-yellow px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform">
              Reload Station
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderRecipeSection = (rows: RecipeRequirement[], size?: Size) => (
    <div className="grid grid-cols-1 gap-4">
      {rows.map((row, idx) => {
        const mat = centralStock.find(m => m.id === row.materialId);
        return (
          <div key={idx} className="flex flex-col gap-3 bg-brand-stone/5 p-4 rounded-2xl border-2 border-brand-stone hover:border-brand-yellow transition-all">
            <select 
              className="w-full bg-transparent text-[10px] font-black outline-none appearance-none cursor-pointer" 
              value={row.materialId} 
              onChange={e => updateRecipeRow(idx, 'materialId', e.target.value, size)}
            >
              <option value="">Select Material...</option>
              {centralStock.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div className="flex items-center justify-between pt-2 border-t border-brand-stone/50">
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  className="w-16 bg-white rounded-lg p-2 text-center font-black text-[10px]" 
                  value={row.quantity} 
                  onChange={e => updateRecipeRow(idx, 'quantity', parseFloat(e.target.value) || 0, size)} 
                />
                <span className="text-[9px] font-black text-brand-brown/30 uppercase tracking-widest">{mat?.unit || 'qty'}</span>
              </div>
              <button onClick={() => removeRecipeRow(idx, size)} className="text-brand-red p-1.5 hover:bg-red-50 rounded-full transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Filtered sections to display
  const hiddenItemsCount = items.filter(i => i.is_hidden).length;

  const displayedSections = selectedFilterSection === 'ALL'
    ? sections
    : selectedFilterSection === 'HIDDEN'
    ? sections.filter(s => items.some(i => i.category === s.id && i.is_hidden))
    : sections.filter(s => s.id === selectedFilterSection);

  return (
    <div className="p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar">
      {/* Header with Control Toolbar */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="text-5xl font-black text-brand-brown tracking-tighter italic uppercase">MENU <span className="text-brand-yellow">CONTROL</span></h2>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-[0.4em] mt-2">Section Architecture & Pricing Authority</p>
          {error && <p className="text-brand-red text-[10px] font-bold uppercase mt-2">{error}</p>}
        </div>
        
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setIsManageSectionsOpen(true)} 
            className="bg-amber-500/10 border-2 border-amber-500/30 text-amber-900 hover:bg-amber-500 hover:text-white px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:scale-105 transition-all flex items-center gap-2"
          >
            <span>📁</span> Manage Sections ({sections.length})
          </button>

          <button 
            onClick={openAddSection} 
            className="bg-brand-red text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform flex items-center gap-2"
          >
            <span>✨</span> + New Section
          </button>

          <button 
            onClick={() => openAdd()} 
            className="bg-brand-brown text-brand-yellow px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform"
          >
            + Add Item
          </button>

          <button 
            onClick={handleSeedMenu} 
            disabled={isSeeding} 
            className="bg-emerald-600 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform active:scale-95 disabled:opacity-50"
            title="Reset/sync master constants items"
          >
            {isSeeding ? 'Syncing...' : 'Sync Master'}
          </button>
        </div>
      </header>

      {/* Section Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 no-scrollbar">
        <button
          onClick={() => setSelectedFilterSection('ALL')}
          className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0 transition-all border-2 ${
            selectedFilterSection === 'ALL'
              ? 'bg-brand-brown border-brand-brown text-brand-yellow shadow-md'
              : 'bg-white border-brand-stone text-brand-brown/60 hover:border-brand-brown/40'
          }`}
        >
          All Sections ({items.length})
        </button>

        {hiddenItemsCount > 0 && (
          <button
            onClick={() => setSelectedFilterSection('HIDDEN')}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0 transition-all border-2 flex items-center gap-2 ${
              selectedFilterSection === 'HIDDEN'
                ? 'bg-amber-600 border-amber-600 text-white shadow-md'
                : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
            }`}
          >
            <span>🚫</span>
            <span>Hidden from Billing</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${selectedFilterSection === 'HIDDEN' ? 'bg-white/20 text-white' : 'bg-amber-200/80 text-amber-900'}`}>
              {hiddenItemsCount}
            </span>
          </button>
        )}

        {sections.map(sec => {
          const count = items.filter(i => i.category === sec.id).length;
          const isSelected = selectedFilterSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setSelectedFilterSection(sec.id)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0 transition-all border-2 flex items-center gap-2 ${
                isSelected
                  ? 'bg-brand-yellow border-brand-yellow text-brand-brown shadow-md'
                  : 'bg-white border-brand-stone text-brand-brown/60 hover:border-brand-yellow/50'
              }`}
            >
              <span>{sec.icon || '🍽️'}</span>
              <span>{sec.name}</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${isSelected ? 'bg-brand-brown/20 text-brand-brown' : 'bg-brand-stone/30 text-brand-brown/50'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Section-Wise Menu Items */}
      <div className="space-y-16 pb-16">
        {displayedSections.map(sec => {
          const categoryItems = selectedFilterSection === 'HIDDEN'
            ? items.filter(i => i.category === sec.id && i.is_hidden)
            : items.filter(i => i.category === sec.id);
          
          return (
            <div key={sec.id} id={`section-${sec.id}`} className="bg-white/40 border border-brand-stone/50 rounded-[2.5rem] p-6 lg:p-8 backdrop-blur-xs">
              {/* Section Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <span className="text-3xl p-2.5 bg-white rounded-2xl shadow-sm border border-brand-stone/40">{sec.icon || '🍽️'}</span>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-2xl lg:text-3xl font-black text-brand-brown uppercase italic tracking-tighter">{sec.name}</h3>
                      <span className="text-[10px] font-bold text-brand-brown/40 bg-brand-stone/30 px-3 py-1 rounded-full uppercase tracking-widest">
                        {categoryItems.length} {categoryItems.length === 1 ? 'Item' : 'Items'}
                      </span>
                      {!sec.is_active && (
                        <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md uppercase">
                          Hidden
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] font-mono text-brand-brown/30 mt-0.5">Section Key: {sec.id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openAdd(sec.id)}
                    className="px-4 py-2 bg-brand-yellow/20 hover:bg-brand-yellow text-brand-brown font-black text-[9px] uppercase tracking-widest rounded-xl transition-all border border-brand-yellow/40 flex items-center gap-1.5"
                  >
                    <span>+ Add Item to {sec.name}</span>
                  </button>

                  <button
                    onClick={() => openEditSection(sec)}
                    className="p-2 hover:bg-brand-stone/30 text-brand-brown/60 hover:text-brand-brown rounded-xl transition-colors"
                    title="Edit Section"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>

                  <button
                    onClick={() => handleDeleteSection(sec)}
                    className="p-2 hover:bg-rose-100 text-rose-500 hover:text-rose-700 rounded-xl transition-colors"
                    title="Delete Section"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>

              {/* Items in this section */}
              {categoryItems.length === 0 ? (
                <div className="border-2 border-dashed border-brand-stone rounded-3xl p-10 text-center bg-white/60">
                  <span className="text-4xl block mb-2">{sec.icon || '🍽️'}</span>
                  <p className="text-xs font-black text-brand-brown uppercase italic">No items assigned to {sec.name} yet</p>
                  <p className="text-[10px] text-brand-brown/40 uppercase tracking-widest mt-1 mb-4">You can add new items or move existing items into this section</p>
                  <button 
                    onClick={() => openAdd(sec.id)}
                    className="px-6 py-2.5 bg-brand-brown text-brand-yellow rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
                  >
                    + Create First Item in {sec.name}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                  {categoryItems.map(item => (
                    <div key={item.id} className={`bg-white rounded-[2rem] p-4 shadow-sm border transition-all flex flex-col ${item.is_hidden ? 'border-amber-400 bg-amber-50/20 ring-2 ring-amber-400/20' : 'border-brand-stone group hover:shadow-xl'}`}>
                      <div className="aspect-square rounded-[1.5rem] overflow-hidden mb-4 bg-brand-cream border border-brand-stone relative">
                        <img src={item.image && item.image.trim() !== '' ? item.image.trim() : 'https://via.placeholder.com/300?text=No+Image'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-brand-brown/0 group-hover:bg-brand-brown/5 transition-colors" />
                        
                        {/* Current Section badge */}
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-0.5 rounded-full bg-brand-brown/70 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                            <span>{sec.icon || '🍽️'}</span>
                            <span className="truncate max-w-[70px]">{sec.name}</span>
                          </span>
                        </div>

                        {/* Visibility on Billing Badge */}
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-0.5 rounded-full backdrop-blur-md text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm ${
                            item.is_hidden ? 'bg-amber-600 text-white' : 'bg-emerald-600/90 text-white'
                          }`}>
                            {item.is_hidden ? '🚫 Hidden' : '✓ POS'}
                          </span>
                        </div>
                      </div>

                      <div className="mb-3 px-1">
                        <h3 className="text-sm font-black text-brand-brown leading-tight mb-1 truncate" title={item.name}>{item.name}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(item.recipe?.length || 0) > 0 || Object.keys(item.sizeRecipes || {}).length > 0 ? (
                              <span className="text-[7px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                <span className="w-1 h-1 bg-emerald-600 rounded-full animate-pulse" />
                                Tracked
                              </span>
                          ) : (
                            <span className="text-[7px] font-bold text-stone-400 uppercase tracking-widest">
                              Standard
                            </span>
                          )}
                          {item.is_hidden && (
                            <span className="text-[7px] font-bold text-amber-700 uppercase tracking-widest bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-md">
                              Hidden in Billing
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick Move Section Dropdown */}
                      <div className="mb-2 pt-2 border-t border-brand-stone/40">
                        <label className="text-[8px] font-black uppercase tracking-wider text-brand-brown/40 block mb-1">Section</label>
                        <select
                          value={item.category}
                          onChange={e => handleQuickMoveItem(item, e.target.value)}
                          className="w-full text-[9px] font-bold bg-brand-stone/10 border border-brand-stone rounded-lg px-2 py-1 text-brand-brown outline-none cursor-pointer hover:bg-brand-yellow/20"
                        >
                          {sections.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.icon || '🍽️'} {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quick Hide/Show Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleHideItem(item)}
                        className={`w-full py-1.5 px-2 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 mb-2 ${
                          item.is_hidden
                            ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                            : 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200'
                        }`}
                        title={item.is_hidden ? "Click to make visible on Billing Page (POS)" : "Click to hide from Billing Page (POS)"}
                      >
                        <span>{item.is_hidden ? '🚫 Hidden from Billing' : '👁️ Hide from Billing'}</span>
                      </button>

                      <div className="flex gap-2 mt-auto">
                        <button onClick={() => { setEditingItem(item); setIsModalOpen(true); }} className="flex-1 py-2.5 bg-brand-brown text-brand-yellow rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-brown/90 transition-colors">Edit</button>
                        <button 
                          onClick={() => handleDelete(item.id)} 
                          disabled={isDeleting === item.id}
                          className="px-3 py-2.5 rounded-xl bg-red-50 text-brand-red hover:bg-brand-red hover:text-white transition-all disabled:opacity-50"
                          title="Delete Item"
                        >
                          {isDeleting === item.id ? (
                            <div className="w-3 h-3 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* --- MODAL 1: ADD / EDIT MENU ITEM --- */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 bg-brand-brown/95 backdrop-blur-3xl flex items-center justify-center z-110 p-4">
          <div className="bg-brand-cream rounded-[4rem] p-10 w-full max-w-7xl max-h-[95vh] overflow-y-auto border-8 border-brand-yellow shadow-2xl relative no-scrollbar">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-10 right-10 text-brand-red hover:scale-110 transition-transform">
               <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <h3 className="text-4xl font-black text-brand-brown italic mb-10 uppercase tracking-tighter">Edit <span className="text-brand-red">{editingItem.name || 'Master Entry'}</span></h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest ml-4 mb-2 block">Item Name</label>
                  <input className={inputClasses} value={editingItem.name || ''} onChange={e => setEditingItem({...editingItem, name: e.target.value})} placeholder="e.g. Chicken Cheese Combo" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest ml-4 mb-2 block">Image URL</label>
                  <input className={inputClasses} value={editingItem.image || ''} onChange={e => setEditingItem({...editingItem, image: e.target.value})} placeholder="https://..." />
                </div>
                <div>
                  <div className="flex justify-between items-center ml-4 mb-2">
                    <label className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Section / Category</label>
                    <button 
                      type="button" 
                      onClick={() => { openAddSection(); }}
                      className="text-[9px] font-black text-amber-700 hover:text-amber-900 underline uppercase"
                    >
                      + New Section
                    </button>
                  </div>
                  <select 
                    className={inputClasses} 
                    value={editingItem.category || (sections[0]?.id || 'momo')} 
                    onChange={e => setEditingItem({...editingItem, category: e.target.value})}
                  >
                    {sections.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.icon || '🍽️'} {c.name.toUpperCase()} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Billing Page Visibility Control */}
                <div className="bg-brand-stone/20 p-4 rounded-2xl border border-brand-stone/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-wider block">Billing Page (POS)</span>
                      <span className="text-[8px] text-brand-brown/60 font-semibold block">Hide item from cash counter</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingItem({ ...editingItem, is_hidden: !editingItem.is_hidden })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        editingItem.is_hidden ? 'bg-amber-600' : 'bg-stone-300'
                      }`}
                      title={editingItem.is_hidden ? "Hidden from Billing" : "Visible on Billing"}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          editingItem.is_hidden ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="text-[8px] font-black uppercase tracking-wider pt-2 border-t border-brand-stone/40 flex items-center justify-between">
                    {editingItem.is_hidden ? (
                      <span className="text-amber-700 flex items-center gap-1">
                        <span>🚫</span> Hidden from Billing Page
                      </span>
                    ) : (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <span>✓</span> Visible on Billing Page
                      </span>
                    )}
                    <span className="text-[7px] text-brand-brown/40 font-bold">
                      {editingItem.is_hidden ? 'Cashiers cannot see this' : 'Available on POS'}
                    </span>
                  </div>
                </div>

                <div className="pt-4">
                  <button onClick={handleSave} className="w-full py-6 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform active:scale-95">Update Global Data</button>
                </div>
              </div>

              <div className="lg:col-span-3 space-y-10">
                <div className="bg-white rounded-[2.5rem] border-2 border-brand-stone overflow-hidden shadow-sm">
                   <div className="p-6 bg-brand-brown/5 border-b border-brand-stone flex justify-between items-center">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-brown">Variant Pricing Matrix</h4>
                      <div className="flex gap-2">
                        {PREP_TYPES.map(prep => (
                            <button 
                            key={prep} 
                            onClick={() => togglePrep(prep)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${editingItem.preparations?.[prep] ? 'bg-brand-red border-brand-red text-white shadow-md' : 'bg-white border-brand-stone text-brand-brown/40'}`}
                            >
                            {formatPrepName(prep)}
                            </button>
                        ))}
                      </div>
                   </div>
                  <table className="w-full text-left">
                    <thead className="bg-brand-brown/5 text-brand-brown text-[9px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="px-6 py-4">Financial View</th>
                        <th className="px-6 py-4 text-center">S (₹)</th>
                        <th className="px-6 py-4 text-center">M (₹)</th>
                        <th className="px-6 py-4 text-center">L (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-stone">
                      {Object.keys(editingItem.preparations || {}).map(prep => (
                        <React.Fragment key={prep}>
                          <tr className="bg-brand-cream/30">
                            <td className="px-6 py-4 font-black text-brand-brown uppercase italic text-xs">
                              {formatPrepName(prep)} <span className="text-[9px] block font-bold text-brand-red not-italic mt-1">SELLING PRICE</span>
                            </td>
                            {SIZES.map(size => (
                              <td key={size} className="px-4 py-2">
                                <input 
                                  type="number" 
                                  className="w-full bg-white border border-brand-stone p-2 rounded-lg text-center font-black text-sm"
                                  value={editingItem.preparations?.[prep as PreparationType]?.[size] || 0}
                                  onChange={e => updateVal('price', prep as PreparationType, size, e.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                          <tr className="bg-white">
                            <td className="px-6 py-4 font-black text-brand-brown/40 uppercase italic text-xs">
                              <span className="text-[9px] block font-bold not-italic">INTERNAL COST</span>
                            </td>
                            {SIZES.map(size => (
                              <td key={size} className="px-4 py-2">
                                <input 
                                  type="number" 
                                  className="w-full bg-brand-stone/10 border border-brand-stone p-2 rounded-lg text-center font-bold text-sm text-brand-brown/60"
                                  value={editingItem.costs?.[prep as PreparationType]?.[size] || 0}
                                  onChange={e => updateVal('cost', prep as PreparationType, size, e.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                          <tr className="bg-indigo-50/20">
                            <td className="px-6 py-4 font-black text-indigo-600/60 uppercase italic text-xs">
                              <span className="text-[9px] block font-bold not-italic">🪙 MINCOINS (0=OFF)</span>
                            </td>
                            {SIZES.map(size => (
                              <td key={size} className="px-4 py-2">
                                <input 
                                  type="number" 
                                  className="w-full bg-white border border-indigo-200 p-2 rounded-lg text-center font-black text-sm text-indigo-600"
                                  value={editingItem.minCoinsPrices?.[prep as PreparationType]?.[size] || 0}
                                  onChange={e => updateVal('redeem', prep as PreparationType, size, e.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-10 bg-brand-stone/5 rounded-[4rem] border-4 border-white space-y-10">
                   <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border-2 border-brand-stone shadow-sm">
                      <div>
                        <h4 className="text-2xl font-black text-brand-brown italic uppercase tracking-tighter">Stock Deductions</h4>
                        <p className="text-[9px] font-black text-brand-brown/30 uppercase tracking-widest mt-1">Specify ingredients destroyed per order</p>
                      </div>
                      <div className="flex gap-2">
                         <button 
                           onClick={() => setEditingItem({ ...editingItem, sizeRecipes: {} })}
                           className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(!editingItem.sizeRecipes || Object.keys(editingItem.sizeRecipes).length === 0) ? 'bg-emerald-600 text-white shadow-lg' : 'bg-brand-stone/20 text-brand-brown/50'}`}
                         >
                           Global
                         </button>
                         <button 
                           onClick={() => setEditingItem({ ...editingItem, sizeRecipes: { small: [], medium: [], large: [], ...(editingItem.sizeRecipes || {}) } })}
                           className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(editingItem.sizeRecipes && Object.keys(editingItem.sizeRecipes).length > 0) ? 'bg-emerald-600 text-white shadow-lg' : 'bg-brand-stone/20 text-brand-brown/50'}`}
                         >
                           Per Size
                         </button>
                      </div>
                   </div>
                   
                   {(editingItem.sizeRecipes && Object.keys(editingItem.sizeRecipes).length > 0) ? (
                     <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                       {SIZES.map(size => (
                         <div key={size} className="bg-white rounded-[3rem] p-8 border-2 border-brand-stone shadow-sm flex flex-col hover:border-brand-yellow transition-all">
                           <div className="flex justify-between items-center mb-6">
                             <div className="flex items-center gap-2">
                               <span className="w-2 h-2 bg-brand-yellow rounded-full" />
                               <h5 className="text-[10px] font-black uppercase text-brand-brown tracking-widest">{size} Size Recipe</h5>
                             </div>
                             <button onClick={() => addRecipeRow(size)} className="bg-brand-brown text-brand-yellow px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest shadow-md">+ Add</button>
                           </div>
                           <div className="flex-1">
                             {renderRecipeSection(editingItem.sizeRecipes?.[size] || [], size)}
                           </div>
                         </div>
                       ))}
                     </div>
                   ) : (
                     <div className="bg-white rounded-[3rem] p-10 border-2 border-brand-stone shadow-sm hover:border-brand-yellow transition-all">
                        <div className="flex justify-between items-center mb-10">
                           <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-brand-yellow rounded-full" />
                              <h5 className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Global Recipe (All Sizes)</h5>
                           </div>
                           <button onClick={() => addRecipeRow()} className="bg-brand-brown text-brand-yellow px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md">Add Ingredient</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           {renderRecipeSection(editingItem.recipe || [])}
                        </div>
                     </div>
                   )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: CREATE / EDIT SECTION --- */}
      {isSectionModalOpen && editingSection && (
        <div className="fixed inset-0 bg-brand-brown/90 backdrop-blur-md flex items-center justify-center z-120 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-lg border-4 border-brand-yellow shadow-2xl relative">
            <button 
              onClick={() => setIsSectionModalOpen(false)} 
              className="absolute top-6 right-6 text-brand-brown/40 hover:text-brand-red transition-colors"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <span className="text-4xl">{editingSection.icon || '🍽️'}</span>
              <div>
                <h3 className="text-2xl font-black text-brand-brown uppercase italic tracking-tight">
                  {editingSection.id ? 'Edit Section' : 'Create New Section'}
                </h3>
                <p className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-widest">
                  Menu Category Configuration
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Section Name */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-brand-brown/60 block mb-1.5">
                  Section Name *
                </label>
                <input 
                  className={inputClasses}
                  placeholder="e.g. Desserts, Beverages, Snacks..."
                  value={editingSection.name || ''}
                  onChange={e => {
                    const name = e.target.value;
                    // Auto-slugify ID if it's a new section
                    if (!editingSection.id || editingSection.id === '') {
                      const autoSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                      setEditingSection({ ...editingSection, name, id: autoSlug });
                    } else {
                      setEditingSection({ ...editingSection, name });
                    }
                  }}
                />
              </div>

              {/* Section ID / Key */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-brand-brown/60 block mb-1.5">
                  Section Key (Unique ID) *
                </label>
                <input 
                  className={inputClasses}
                  placeholder="e.g. dessert, beverage, sides..."
                  value={editingSection.id || ''}
                  onChange={e => setEditingSection({ ...editingSection, id: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                />
                <p className="text-[8px] text-stone-400 mt-1">Used internally to link menu items to this category.</p>
              </div>

              {/* Icon / Emoji Picker */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-brand-brown/60 block mb-1.5">
                  Icon / Emoji
                </label>
                <div className="flex gap-2 mb-2">
                  <input 
                    className="w-20 p-2.5 rounded-xl border-2 border-brand-stone bg-white text-center text-xl"
                    value={editingSection.icon || '🍽️'}
                    onChange={e => setEditingSection({ ...editingSection, icon: e.target.value })}
                  />
                  <div className="flex-1 text-[9px] text-stone-400 flex items-center font-bold">
                    Pick a quick icon below or paste any emoji/text
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-brand-cream/50 rounded-2xl border border-brand-stone">
                  {POPULAR_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setEditingSection({ ...editingSection, icon: emoji })}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${
                        editingSection.icon === emoji ? 'bg-brand-yellow scale-110 shadow-sm border border-brand-brown' : 'hover:bg-white'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Display Order & Active */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-brand-brown/60 block mb-1.5">
                    Display Order
                  </label>
                  <input 
                    type="number"
                    className={inputClasses}
                    value={editingSection.display_order ?? 1}
                    onChange={e => setEditingSection({ ...editingSection, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-brand-brown/60 block mb-1.5">
                    Visibility
                  </label>
                  <label className="flex items-center gap-2 p-3 bg-brand-cream/50 rounded-xl border-2 border-brand-stone cursor-pointer mt-0.5">
                    <input 
                      type="checkbox"
                      checked={editingSection.is_active !== false}
                      onChange={e => setEditingSection({ ...editingSection, is_active: e.target.checked })}
                      className="w-4 h-4 accent-amber-600 cursor-pointer"
                    />
                    <span className="text-xs font-black uppercase tracking-tight text-brand-brown">
                      {editingSection.is_active !== false ? 'Active' : 'Hidden'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-brand-stone">
                <button
                  type="button"
                  onClick={() => setIsSectionModalOpen(false)}
                  className="flex-1 py-3.5 bg-stone-100 hover:bg-stone-200 text-brand-brown rounded-2xl font-black text-xs uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSection}
                  disabled={isSavingSection}
                  className="flex-1 py-3.5 bg-brand-brown text-brand-yellow rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-transform shadow-xl disabled:opacity-50"
                >
                  {isSavingSection ? 'Saving...' : 'Save Section'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: MANAGE ALL SECTIONS --- */}
      {isManageSectionsOpen && (
        <div className="fixed inset-0 bg-brand-brown/90 backdrop-blur-md flex items-center justify-center z-120 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto border-4 border-brand-yellow shadow-2xl relative no-scrollbar">
            <button 
              onClick={() => setIsManageSectionsOpen(false)} 
              className="absolute top-6 right-6 text-brand-brown/40 hover:text-brand-red transition-colors"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-stone">
              <div>
                <h3 className="text-3xl font-black text-brand-brown uppercase italic tracking-tight">
                  Manage Menu Sections
                </h3>
                <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                  Reorder, rename, or remove categories from POS & Menu
                </p>
              </div>
              <button
                onClick={() => {
                  setIsManageSectionsOpen(false);
                  openAddSection();
                }}
                className="px-5 py-3 bg-brand-yellow text-brand-brown rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 transition-transform"
              >
                + New Section
              </button>
            </div>

            <div className="space-y-3">
              {[...sections].sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((sec, idx, arr) => {
                const itemCount = items.filter(i => i.category === sec.id).length;
                return (
                  <div key={sec.id} className="flex items-center justify-between p-4 bg-brand-cream/30 border-2 border-brand-stone rounded-2xl hover:border-brand-yellow/50 transition-all">
                    <div className="flex items-center gap-4">
                      {/* Reorder Up/Down */}
                      <div className="flex flex-col gap-1">
                        <button
                          disabled={idx === 0}
                          onClick={() => handleReorderSection(sec.id, 'up')}
                          className="p-1 text-brand-brown/40 hover:text-brand-brown disabled:opacity-20 hover:bg-white rounded transition-colors"
                          title="Move Up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button
                          disabled={idx === arr.length - 1}
                          onClick={() => handleReorderSection(sec.id, 'down')}
                          className="p-1 text-brand-brown/40 hover:text-brand-brown disabled:opacity-20 hover:bg-white rounded transition-colors"
                          title="Move Down"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>

                      <span className="text-3xl">{sec.icon || '🍽️'}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-brand-brown text-base uppercase">{sec.name}</h4>
                          <span className="text-[9px] font-mono text-brand-brown/40">({sec.id})</span>
                          {!sec.is_active && (
                            <span className="text-[8px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded uppercase">
                              Hidden
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-brand-brown/50 font-bold">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'} currently assigned
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setIsManageSectionsOpen(false);
                          openEditSection(sec);
                        }}
                        className="px-4 py-2 bg-brand-brown text-brand-yellow rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-brown/90 transition-colors"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDeleteSection(sec)}
                        className="p-2.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Delete Section"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: SUPABASE SQL MIGRATION VIEWER --- */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/90 backdrop-blur-md flex items-center justify-center z-120 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto border-4 border-brand-yellow shadow-2xl relative no-scrollbar">
            <button 
              onClick={() => setIsSqlModalOpen(false)} 
              className="absolute top-6 right-6 text-brand-brown/40 hover:text-brand-red transition-colors"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-3xl font-black text-brand-brown uppercase italic tracking-tight flex items-center gap-3">
                  <span>⚡</span> Supabase SQL Migration
                </h3>
                <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                  Run this in your Supabase SQL Editor to support persistent cloud menu sections
                </p>
              </div>

              <button
                onClick={handleCopySql}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all flex items-center gap-2 shrink-0"
              >
                <span>{copySuccess ? '✓ Copied!' : '📋 Copy SQL Script'}</span>
              </button>
            </div>

            <div className="bg-stone-900 text-stone-100 rounded-2xl p-6 font-mono text-xs overflow-x-auto border-2 border-stone-800 shadow-inner">
              <pre>{SUPABASE_SQL_SCRIPT}</pre>
            </div>

            <div className="mt-6 flex justify-between items-center bg-brand-cream/50 p-4 rounded-2xl border border-brand-stone">
              <p className="text-[10px] font-bold text-brand-brown/70">
                💡 Tip: The app already has a local fallback cache, so you can start creating sections immediately. Running this SQL ensures your sections and items are permanently preserved in Supabase.
              </p>
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="px-5 py-2 bg-brand-brown text-brand-yellow rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0 ml-4"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuManager;
