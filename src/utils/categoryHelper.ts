import { MenuItem, MenuSection } from '../types';

/**
 * Resolves the display Category Name for an order item dynamically based on
 * the current menu items and menu sections configured in the store.
 */
export function resolveCategoryName(
  item: { name?: string; menuItemId?: string; menu_item_id?: string; id?: string },
  menuItems: MenuItem[],
  menuSections: MenuSection[]
): string {
  const rawName = (item.name || '').trim();
  const rawId = item.id || '';
  const menuItemId = item.menuItemId || item.menu_item_id || '';

  // 1. By menuItemId in dynamic menuItems
  if (menuItemId) {
    const matched = menuItems.find(m => m.id === menuItemId);
    if (matched && matched.category) {
      const sec = menuSections.find(
        s => s.id.toLowerCase() === matched.category.toLowerCase() ||
             s.name.toLowerCase() === matched.category.toLowerCase()
      );
      if (sec) return sec.name;
      return matched.category.charAt(0).toUpperCase() + matched.category.slice(1);
    }
  }

  // 2. Extract clean name (strip size, prep methods, tags)
  const cleanName = rawName
    .replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+/gu, '')
    .replace(/\s*\(?(Small|Medium|Large|Regular|Full|Half|Extra|Premium|\d+\s*Pcs)\)?\s*/gi, '')
    .replace(/\s*-\s*(Small|Medium|Large|Regular|Full|Half|Extra|Premium)/gi, '')
    .replace(/^(Steamed|Fried|Pan Fried|Pan-Fried|Peri-Peri|Normal|Tandoori|Kurkure)\s+/i, '')
    .trim()
    .toLowerCase();

  // Match against menu items by name
  if (cleanName) {
    const matched = menuItems.find(m => {
      const mName = m.name.toLowerCase();
      return mName === cleanName || cleanName.includes(mName) || mName.includes(cleanName);
    });

    if (matched && matched.category) {
      const sec = menuSections.find(
        s => s.id.toLowerCase() === matched.category.toLowerCase() ||
             s.name.toLowerCase() === matched.category.toLowerCase()
      );
      if (sec) return sec.name;
      return matched.category.charAt(0).toUpperCase() + matched.category.slice(1);
    }
  }

  // 3. Match against dynamic menu sections directly
  const lowerName = rawName.toLowerCase();
  for (const sec of menuSections) {
    if (lowerName.includes(sec.name.toLowerCase())) {
      return sec.name;
    }
    if (sec.id.length > 3 && lowerName.includes(sec.id.toLowerCase())) {
      return sec.name;
    }
  }

  // 4. Keyword fallbacks mapped to known section definitions
  if (lowerName.includes('momo')) {
    const sec = menuSections.find(s => s.id === 'momo' || s.name.toLowerCase().includes('momo'));
    return sec ? sec.name : 'Momos';
  }
  if (lowerName.includes('burger') || lowerName.includes('moburg') || rawId.includes('moburg')) {
    const sec = menuSections.find(s => s.id === 'moburg' || s.name.toLowerCase().includes('burger') || s.name.toLowerCase().includes('moburg'));
    return sec ? sec.name : 'Burgers';
  }
  if (lowerName.includes('fries') || lowerName.includes('garlic bread') || lowerName.includes('side')) {
    const sec = menuSections.find(s => s.id === 'side' || s.name.toLowerCase().includes('side'));
    return sec ? sec.name : 'Sides';
  }
  if (lowerName.includes('cola') || lowerName.includes('water') || lowerName.includes('mojito') || lowerName.includes('drink') || lowerName.includes('beverage') || lowerName.includes('shake')) {
    const sec = menuSections.find(s => s.id === 'drink' || s.name.toLowerCase().includes('drink'));
    return sec ? sec.name : 'Drinks';
  }
  if (lowerName.includes('combo') || lowerName.includes('platter')) {
    const sec = menuSections.find(s => s.id === 'combo' || s.name.toLowerCase().includes('combo'));
    return sec ? sec.name : 'Combos';
  }
  if (lowerName.includes('summit') || lowerName.includes('meal')) {
    const sec = menuSections.find(s => s.id === 'summit-meals' || s.name.toLowerCase().includes('meal'));
    return sec ? sec.name : 'Summit Meals';
  }
  if (lowerName.includes('chicken')) {
    const sec = menuSections.find(s => s.id === 'chicken' || s.name.toLowerCase().includes('chicken'));
    if (sec) return sec.name;
  }

  // 5. Promotional & Discounts
  if (lowerName.includes('loyalty') || lowerName.includes('discount') || lowerName.includes('offer') || rawId.includes('discount') || rawId.includes('loyalty')) {
    return 'Loyalty & Offers';
  }

  return 'Other';
}
