
import { MenuItem, OrderItem, DiningTable } from './types';

export const SIZE_PIECES: Record<string, number> = {
  small: 4,
  medium: 6,
  large: 8,
  normal: 1 
};

export const RAW_MATERIALS_LIST = [
  // Bulk Momos (Units in Pieces)
  { id: 'momo-veg', name: 'Veg Momo (Bulk)', unit: 'pcs', category: 'MOMO' },
  { id: 'momo-chicken', name: 'Chicken Momo (Bulk)', unit: 'pcs', category: 'MOMO' },
  { id: 'momo-paneer', name: 'Paneer Momo (Bulk)', unit: 'pcs', category: 'MOMO' },
  { id: 'momo-chicken-cheese', name: 'Chicken Cheese Momo (Bulk)', unit: 'pcs', category: 'MOMO' },
  { id: 'momo-corn-cheese', name: 'Corn Cheese Momo (Bulk)', unit: 'pcs', category: 'MOMO' },
  { id: 'momo-kurkure', name: 'Kurkure Momo (Bulk)', unit: 'pcs', category: 'MOMO' },
  { id: 'momo-tandoori', name: 'Tandoori Momo (Bulk)', unit: 'pcs', category: 'MOMO' },
  
  // Consumables
  { id: 'pkt-oil', name: 'Refined Cooking Oil', unit: 'ltr', category: 'PACKET' },
  { id: 'pkt-mayo', name: 'Mayonnaise', unit: 'pkt', category: 'PACKET' },
  { id: 'pkt-fries', name: 'French Fries (Bulk)', unit: 'pkt', category: 'PACKET' },
];

export const MENU_ITEMS: MenuItem[] = [
  {
    id: 'platter',
    name: 'Momomaya Must Try Platter',
    image: 'https://images.picxy.com/cache/2021/5/26/f33738dc75574a81b72c0d8c164b4a77.jpg',
    category: 'combo',
    preparations: {
      normal: { small: 70, medium: 85, large: 100 },
      'pan-fried': { small: 80, medium: 95, large: 110 },
    },
    costs: {
      normal: { small: 28, medium: 34, large: 40 },
      'pan-fried': { small: 32, medium: 38, large: 44 },
    },
    recipe: [{ materialId: 'momo-veg', quantity: 1 }] // Default logic
  },
  {
    id: 'chicken-momo',
    name: 'Chicken Momo',
    image: 'https://static.toiimg.com/thumb/60275824.cms?imgsize=1041917&width=800&height=800',
    category: 'momo',
    preparations: {
      steamed: { small: 40, medium: 60, large: 80 },
      fried: { small: 50, medium: 70, large: 90 },
      'pan-fried': { small: 50, medium: 70, large: 90 },
    },
    costs: {
      steamed: { small: 16, medium: 24, large: 32 },
      fried: { small: 20, medium: 30, large: 40 },
      // Fixed: Typo 'Hyde' replaced with 'large'
      'pan-fried': { small: 19, medium: 27, large: 35 },
    },
    recipe: [{ materialId: 'momo-chicken', quantity: 1 }]
  },
  {
    id: 'paneer-momo',
    name: 'Paneer Momo',
    image: 'https://www.mrcoconut.in/img/products/23_10_2021_15_53_506_pm.webp',
    category: 'momo',
    preparations: {
      steamed: { small: 40, medium: 60, large: 80 },
      fried: { small: 50, medium: 70, large: 90 },
      'pan-fried': { small: 50, medium: 70, large: 90 },
    },
    costs: {
      steamed: { small: 16, medium: 24, large: 32 },
      fried: { small: 20, medium: 30, large: 40 },
      'pan-fried': { small: 19, medium: 27, large: 35 },
    },
    recipe: [{ materialId: 'momo-paneer', quantity: 1 }]
  },
  {
    id: 'veg-momo',
    name: 'Veg Momo',
    image: 'https://cdn1.foodviva.com/static-content/food-images/snacks-recipes/veg-momos/veg-momos.jpg',
    category: 'momo',
    preparations: {
      steamed: { small: 30, medium: 45, large: 55 },
      fried: { small: 40, medium: 55, large: 65 },
      'pan-fried': { small: 40, medium: 55, large: 65 },
    },
    costs: {
      steamed: { small: 12, medium: 18, large: 24 },
      fried: { small: 16, medium: 24, large: 32 },
      'pan-fried': { small: 15, medium: 21, large: 27 },
    },
    recipe: [{ materialId: 'momo-veg', quantity: 1 }]
  },
  {
    id: 'chicken-tandoori',
    name: 'Chicken Tandoori Momo',
    image: 'https://jeyporedukaan.in/wp-content/uploads/2024/12/tandoori-momo-scaled.jpg',
    category: 'momo',
    preparations: {
      normal: { small: 60, medium: 85, large: 100 },
      'pan-fried': { small: 70, medium: 95, large: 105 },
    },
    costs: {
      normal: { small: 22, medium: 33, large: 44 },
      'pan-fried': { small: 25, medium: 36, large: 47 },
    },
    recipe: [{ materialId: 'momo-tandoori', quantity: 1 }]
  },
  {
    id: 'kurkure-chicken',
    name: 'Chicken Kurkure Momo',
    image: 'https://cafe21.in/wp-content/uploads/2025/07/1686068321785_SKU-2082_0.jpeg',
    category: 'momo',
    preparations: {
      normal: { small: 60, medium: 85, large: 100 },
      'pan-fried': { small: 70, medium: 95, large: 110 },
    },
    costs: {
      normal: { small: 22, medium: 33, large: 44 },
      'pan-fried': { small: 25, medium: 36, large: 47 },
    },
    recipe: [{ materialId: 'momo-kurkure', quantity: 1 }]
  },
  {
    id: 'cheese-lovers-combo',
    name: 'Cheese Lovers Combo',
    image: 'https://patelcafenrestro.com/wp-content/uploads/2024/08/DM-2024-08-06T163007.734.png',
    category: 'combo',
    preparations: {
      normal: { small: 75, medium: 100, large: 120 },
      'pan-fried': { small: 85, medium: 110, large: 130 },
    },
    costs: {
      normal: { small: 30, medium: 45, large: 60 },
      'pan-fried': { small: 33, medium: 48, large: 63 },
    },
    recipe: [{ materialId: 'momo-chicken-cheese', quantity: 1 }]
  },
  {
    id: 'premium-chicken-cheese-lava',
    name: 'Premium Chicken Cheese Lava Momo',
    image: 'https://img.thecdn.in/17132/1607351667375_SKU-0125_0.jpg',
    category: 'momo',
    preparations: {
      normal: { small: 75, medium: 100, large: 120 },
      'pan-fried': { small: 85, medium: 110, large: 130 },
    },
    costs: {
      normal: { small: 30, medium: 45, large: 60 },
      'pan-fried': { small: 33, medium: 48, large: 63 },
    },
    recipe: [{ materialId: 'momo-chicken-cheese', quantity: 1 }]
  },
  {
    id: 'premium-corn-cheese-lava',
    name: 'Premium Corn Cheese Lava Momo',
    image: 'https://english.cdn.zeenews.com/sites/default/files/2025/05/08/1744609-untitled-design.png',
    category: 'momo',
    preparations: {
      normal: { small: 75, medium: 100, large: 120 },
      'pan-fried': { small: 85, medium: 110, large: 130 },
    },
    costs: {
      normal: { small: 30, medium: 45, large: 60 },
      'pan-fried': { small: 33, medium: 48, large: 63 },
    },
    recipe: [{ materialId: 'momo-corn-cheese', quantity: 1 }]
  },
  {
    id: 'fries',
    name: 'French Fries',
    image: 'https://thecozycook.com/wp-content/uploads/2020/02/Copycat-McDonalds-French-Fries-.jpg',
    category: 'side',
    preparations: {
      normal: { small: 40, medium: 55, large: 65 },
      'pan-fried': { small: 50, medium: -1, large: -1 },
    },
    costs: {
      normal: { small: 10, medium: 15, large: 20 },
      'pan-fried': { small: 13, medium: 18, large: 23 },
    },
    recipe: [{ materialId: 'pkt-fries', quantity: 0.25 }] // Linked to bulk pkt
  },
  {
    id: 'tandoori-mayonnaise',
    name: 'Tandoori Mayonnaise',
    image: 'https://www.nutralite.com/wp-content/uploads/2024/07/Page-7-7.-Page-URL_-https_www.nutralite.com_blog_10-creative-ways-to-use-tandoori-mayonnaise-in-everyday-cooking_-.jpg',
    category: 'side',
    preparations: {
      normal: { small: 10, medium: 10, large: 10 },
    },
    costs: {
      normal: { small: 3, medium: 3, large: 3 },
    },
    recipe: [{ materialId: 'pkt-mayo', quantity: 0.1 }] // Linked to bulk pkt
  }
];

export const BRANCHES = ['Main Station'];

export const TABLES: DiningTable[] = Array.from({ length: 8 }, (_, i) => ({
  id: `table-${i + 1}`,
  number: (i + 1).toString(),
  capacity: 4,
  status: 'AVAILABLE'
}));

export const FRIES_ADD_ON_ITEM: OrderItem = {
  id: 'fries-side',
  menuItemId: 'fries',
  name: 'Extra Fries',
  price: 30,
  cost: 10,
  quantity: 1,
};

export const TANDOORI_MAYO_ORDER_ITEM: OrderItem = {
  id: 'mayo-dip-addon',
  menuItemId: 'tandoori-mayonnaise',
  name: 'Extra Mayo Dip',
  price: 10,
  cost: 2,
  quantity: 1,
};
