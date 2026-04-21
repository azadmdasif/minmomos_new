
import { CompletedOrder, OrderItem, PaymentMethod } from './types';

const ALL_ORDERS_KEY = 'momo-pos-orders';
const LAST_BILL_NUMBER_KEY = 'momo-pos-last-bill-number';
const SELECTED_BRANCH_KEY = 'momo-pos-selected-branch';

/**
 * Retrieves the currently selected branch from localStorage.
 * @returns The branch name string, or null if not set.
 */
export function getSelectedBranch(): string | null {
  return localStorage.getItem(SELECTED_BRANCH_KEY);
}

/**
 * Saves the selected branch to localStorage.
 * @param branchName The name of the branch to save.
 */
export function setSelectedBranch(branchName: string): void {
  try {
    localStorage.setItem(SELECTED_BRANCH_KEY, branchName);
  } catch (error) {
    console.error("Could not save selected branch to localStorage", error);
  }
}

/**
 * Retrieves all completed orders from localStorage.
 * @returns An array of CompletedOrder objects.
 */
export function getAllOrders(): CompletedOrder[] {
  try {
    const data = localStorage.getItem(ALL_ORDERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Could not parse orders from localStorage", error);
    return [];
  }
}

/**
 * Gets the next bill number without incrementing it.
 * @returns The next bill number to be used.
 */
export function peekNextBillNumber(): number {
  const lastBillNumber = localStorage.getItem(LAST_BILL_NUMBER_KEY);
  return lastBillNumber ? parseInt(lastBillNumber, 10) + 1 : 1;
}

/**
 * Saves a new completed order to localStorage with a new bill number.
 * @param orderItems The items in the order.
 * @param total The calculated total.
 * @param paymentMethod The method of payment used.
 * @param branchName The branch where the order was placed.
 */
export function saveCompletedOrder(orderItems: OrderItem[], total: number, paymentMethod: PaymentMethod, branchName: string) {
  const allOrders = getAllOrders();
  const nextBillNumber = peekNextBillNumber();
  
  const newOrder: CompletedOrder = {
    id: Date.now().toString(),
    billNumber: nextBillNumber,
    // Fix: Added missing required properties 'type' and 'status' for CompletedOrder
    type: 'TAKEAWAY',
    status: 'COMPLETED',
    items: orderItems,
    total,
    date: new Date().toISOString(),
    paymentMethod,
    branchName,
  };

  allOrders.push(newOrder);

  try {
    localStorage.setItem(ALL_ORDERS_KEY, JSON.stringify(allOrders));
    localStorage.setItem(LAST_BILL_NUMBER_KEY, nextBillNumber.toString());
  } catch (error) {
    console.error("Could not save order to localStorage", error);
  }
}

/**
 * Retrieves all *active* orders that occurred within a specific date range.
 * @param startDate The start date in 'YYYY-MM-DD' format.
 * @param endDate The end date in 'YYYY-MM-DD' format.
 * @returns An array of CompletedOrder objects for the given date range.
 */
export function getOrdersForDateRange(startDate: string, endDate: string): CompletedOrder[] {
    const allOrders = getAllOrders();
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0); // Set to start of the day
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Set to end of the day

    return allOrders.filter(order => {
        const orderDate = new Date(order.date);
        return !order.deletionInfo && orderDate >= start && orderDate <= end;
    });
}

/**
 * Retrieves all *deleted* orders that occurred within a specific date range.
 * @param startDate The start date in 'YYYY-MM-DD' format (based on original order date).
 * @param endDate The end date in 'YYYY-MM-DD' format (based on original order date).
 * @returns An array of CompletedOrder objects for the given date range.
 */
export function getDeletedOrdersForDateRange(startDate: string, endDate:string): CompletedOrder[] {
  const allOrders = getAllOrders();
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  return allOrders.filter(order => {
    const orderDate = new Date(order.date);
    return !!order.deletionInfo && orderDate >= start && orderDate <= end;
  });
}

/**
 * Finds a single order by its bill number.
 * @param billNumber The bill number to search for.
 * @returns The CompletedOrder object if found, otherwise null.
 */
export function getOrderByBillNumber(billNumber: number): CompletedOrder | null {
  const allOrders = getAllOrders();
  return allOrders.find(order => order.billNumber === billNumber) || null;
}

/**
 * Marks an order as deleted by adding deletion information.
 * @param billNumber The bill number of the order to mark as deleted.
 * @param reason The reason for deletion.
 */
export function deleteOrderByBillNumber(billNumber: number, reason: string): void {
  let allOrders = getAllOrders();
  const orderIndex = allOrders.findIndex(order => order.billNumber === billNumber);

  if (orderIndex > -1) {
    allOrders[orderIndex].deletionInfo = {
      reason,
      date: new Date().toISOString(),
    };
    try {
      localStorage.setItem(ALL_ORDERS_KEY, JSON.stringify(allOrders));
    } catch (error) {
      console.error("Could not update order in localStorage", error);
    }
  }
}
