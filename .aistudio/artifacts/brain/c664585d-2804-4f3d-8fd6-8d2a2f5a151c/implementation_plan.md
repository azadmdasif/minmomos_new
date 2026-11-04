# State-of-the-Art Complementary Add-On Recommendation Engine

A smart, automated menu pairing and upselling intelligence system for MinMomos POS that deactivates discontinued lines (Cheese & Afghani momos) and deploys a multi-dimensional complementary recommendation engine driven by flavor contrast, texture pairing, category affinity, 50/10 price round-offs, and clear perceived rupee savings callouts.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following key decisions have been confirmed and will guide the implementation:

- **Discontinued Items Handling**: Completely remove and hide Cheese Momos (Premium Chicken Cheese Lava, Premium Corn Cheese Lava, Cheese Lovers Combo) and Afghani Momos from both the POS ordering menu and the add-on recommendation pool.
- **Complementary Pairing Strategy**: Execute a unified multi-dimensional pairing scoring matrix combining **all three complementary dimensions**:
  1. *Flavor Contrast*: Pairing spicy items (Peri Peri, Tandoori, Chutneys) with cooling contrast beverages (Mint Mojito, Campa Cola).
  2. *Texture Pairing*: Pairing soft steamed momos with crispy golden textures (Chicken Kurkure, French Fries, Chicken Popcorn).
  3. *Category Affinity*: Pairing momo proteins with signature paired dips (Garlic Mayo, Red Chutney) or pairing snacks with drinks.
- **Perceived Discount Presentation**: Prominently display the **exact rupee savings amount** (e.g. `SAVE ₹15 INSTANTLY` along with the struck-through original price) directly inside the suggested add-on card.

---

## 1. Overview & Core Concept

MinMomos POS will transition from static rule prompts to a real-time **Complementary Affinity & Price Round-Off Engine**:
- **Discontinued Menu Cleanup**: Hides all Cheese Momo variants and Afghani Momo items so cashiers cannot order or upsell out-of-stock items.
- **Intelligent Affinity Scoring**: Analyzes the items currently in the cart and historical preferences, evaluates flavor, texture, and category complements, and selects the highest-scoring add-on that fits the customer's cart value.
- **Pricing & Profit Constraints**:
  - Add-on price stays under 20% of the cart value (with sensible ₹15 floor for small bills).
  - Rounds off the total bill to the nearest multiple of **₹50** (primary) or **₹10**.
  - Enforces minimum margin guardrail: $\text{Offer Price} \ge 1.4 \times \text{Cost Price}$.
  - Special override: Single-item Steamed Chicken Momo Large bill continues to feature the signature `+2 Steamed Momos for ₹15`.
- **High-Impact Perceived Value**: Displays the exact rupee savings callout (`SAVE ₹XX`) and a clear cashier verbal script designed to close the round-off upsell in seconds.

---

## 2. Complementary Pairing Chart & Affinity Matrix

The recommendation engine leverages a pre-computed complementary relationship graph across active MinMomos categories:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              COMPLEMENTARY PAIRING GRAPH MATRIX                                 │
├──────────────────────────────┬─────────────────────────────┬────────────────────────────────────┤
│ Trigger Cart Items           │ Primary Complement Types    │ Recommended Target Add-Ons         │
├──────────────────────────────┼─────────────────────────────┼────────────────────────────────────┤
│ Steamed Chicken Momos        │ Texture Contrast + Beverage │ Kurkure Momos, Crispy Fries, Mojito│
│ Steamed Veg / Paneer Momos   │ Texture Contrast + Coolers  │ Fried Paneer Momos, Mojito, Dips   │
│ Fried / Kurkure Momos (Crisp)│ Refreshing Beverage + Dips  │ Mint Mojito, Campa Cola, Mayo Dip  │
│ Spicy Peri-Peri / Tandoori   │ Cooling Contrast Beverage   │ Chilled Mojito, Campa Cola         │
│ MoBurg / Burger Meals        │ Classic Side Pairing        │ Salted Fries, Chicken Popcorn      │
│ Popcorn / Strips             │ Beverage & Dip Affinity     │ Cold Drinks, Chutney Dip Combo     │
│ Customer Past Favorites      │ Loyalty Affinity            │ Preferred Protein / Preparation    │
└──────────────────────────────┴─────────────────────────────┴────────────────────────────────────┘
```

### Recommendation Scoring Formula:
$$\text{Score} = w_1 \cdot \text{Affinity}(\text{Cart}, \text{Addon}) + w_2 \cdot \text{RoundOff}(\text{CartTotal}, \text{Price}) + w_3 \cdot \text{Savings}(\text{OrigPrice} - \text{Price}) + w_4 \cdot \text{HistoryBoost}$$

- **Affinity Score (0 to 40 pts)**: Flavor contrast (+15), Texture pairing (+15), Protein/Vegetarian compatibility (+10). Strictly filters out non-veg add-ons if cart is 100% vegetarian.
- **Round-off Score (0 to 30 pts)**: Rounds to next multiple of ₹50 (+30 pts) or next multiple of ₹10 (+15 pts).
- **Perceived Savings Score (0 to 20 pts)**: Higher rupee savings amount delivers higher conversion score.
- **History Boost (0 to 10 pts)**: +10 pts if the item matches items the customer frequently re-orders.

---

## 3. User Experience & Visual Design

```
┌────────────────────────────────────────────────────────────────────────┐
│                      EXCLUSIVE ADD-ON OFFERS!                          │
│         Complete your feast with curated pairings before billing       │
├────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ 🥟 [PAIRING SPECIAL] [DINE IN OFFER]                               │ │
│ │ +2 Crunchy Chicken Kurkure Momos            [  + ADD OFFER (+₹25) ]│ │
│ │ Perfectly crisps up your Steamed Momo order                        │ │
│ │ Original Price: ₹35   ───►  OFFER: ₹25   [ 🔥 SAVE ₹10 INSTANTLY ] │ │
│ │                                                                    │ │
│ │ 📢 Cashier Script: "Round off your bill to ₹200 and get +2 crunchy │ │
│ │    Kurkure momos — you save ₹10 instantly!"                        │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ─────────────── POPULAR SIDES ADD-ONS · ₹39 EACH ────────────────────  │
│ ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐   │
│ │ 🍟 Add Fries  ₹39 │  │ 🍹 Add Mojito ₹39 │  │ 🍗 Chicken Popcorn│   │
│ │ [ + Add (+₹39)  ] │  │ [ + Add (+₹39)  ] │  │ [ + Add (+₹39)  ] │   │
│ └───────────────────┘  └───────────────────┘  └───────────────────┘   │
│                                                                        │
│        [ Done & Continue (1 item · ₹25) ]   [ No thanks, Skip ]       │
└────────────────────────────────────────────────────────────────────────┘
```

- **Visual Badge**: Shows `🔥 SAVE ₹XX INSTANTLY` in a high-contrast emerald and gold highlight chip.
- **Round-off Indicator**: Informs the cashier and customer of the exact neat round bill total (e.g. `Round off to ₹200`).
- **Verbal Cashier Script**: Automatically incorporates the savings and round-off amount so the cashier can pitch it effortlessly in one breath.
- **Zero Discontinued Items**: Cheese momos, Afghani momos, and their variations are completely purged from the suggestion pool and menu grid.

---

## 4. Key Product Decisions & Discontinued Items

1. **Discontinuation of Cheese and Afghani Momos**:
   - `MENU_ITEMS` in `src/constants.ts`: Flag or filter out `premium-chicken-cheese-lava`, `premium-corn-cheese-lava`, and `cheese-lovers-combo`, plus any Afghani variations.
   - `ADDON_TEMPLATES` in `src/utils/suggestedAddonEngine.ts`: Remove `addon-2-cheese-lava` and `addon-2-corn-cheese`. Replace them with high-margin customer favorites: **Peri-Peri Chicken Momos**, **Fried Paneer Momos**, **Chicken Kurkure Packs**, and **Dip Combos**.
2. **Deterministic Round-Off Optimization**:
   - Pre-calculates target gaps that bring the total order to a clean ₹50 or ₹10 multiple while strictly capping the add-on price at $\le 20\%$ of the bill.
3. **Strict Margin Guardrail Enforcement**:
   - Every single template item strictly verifies $\text{Price} \ge 1.4 \times \text{Cost}$, ensuring no loss-leader discounting damages store margins.

---

## 5. Technical Architecture & Component Flow

```
┌──────────────────┐
│ Cashier Clicks   │
│ "Bill & Print"   │
└────────┬─────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ POS.tsx: handleFinalize                                │
│ 1. Evaluates cart items, total amount & customer phone │
│ 2. Calls suggestedAddonEngine                          │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ suggestedAddonEngine.ts                                │
│ 1. Check for single-item Steamed Chicken Large         │
│ 2. Calculate ideal round-off price (₹50 / ₹10)         │
│ 3. Score candidates on Flavor, Texture & Affinity      │
│ 4. Compute exact rupee savings: (Original - Price)     │
│ 5. Generate verbal cashier script with savings hook    │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ CrossSellModal.tsx                                     │
│ - Upper: Dynamic Complementary Card with "SAVE ₹XX"    │
│ - Lower: Fixed 3 Sides (Fries, Mojito, Popcorn ₹39)    │
│ - 1-Click Add & Steppers                               │
└────────┬───────────────────────────────────────────────┘
         │ (Done & Continue or Skip)
         ▼
┌────────────────────────────────────────────────────────┐
│ BillPreviewModal.tsx & Thermal Print Receipt           │
│ - Order includes confirmed add-ons                     │
│ - Recipe deduction auto-consumes raw materials         │
└────────────────────────────────────────────────────────┘
```
