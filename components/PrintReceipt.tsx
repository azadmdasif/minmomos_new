
import React from 'react';
import { OrderItem, PaymentMethod, OrderType } from '../types';

interface PrintReceiptProps {
  orderItems: OrderItem[];
  billNumber?: number | null;
  paymentMethod?: PaymentMethod | null;
  branchName?: string | null;
  date?: string | Date | null;
  orderType?: OrderType;
  customerPhone?: string;
  customerCoins?: number;
  customerInitialBalance?: number;
  customerFinalBalance?: number;
  earnedCoinsValue?: number;
  nextOrderCoupon?: { code: string, discount: string, forOrder: number } | null;
  totalValue?: number;
  manualDiscount?: number;
}

const PrintReceipt: React.FC<PrintReceiptProps> = ({ 
  orderItems, 
  billNumber, 
  paymentMethod, 
  branchName, 
  date,
  orderType,
  customerPhone,
  customerCoins,
  customerInitialBalance,
  customerFinalBalance,
  earnedCoinsValue,
  nextOrderCoupon,
  totalValue,
  manualDiscount
}) => {
  const calculatedTotal = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const total = totalValue !== undefined ? totalValue : calculatedTotal;
  
  // Calculate discount to show: either explicit manualDiscount or derivation if totalValue was used
  const displayDiscount = manualDiscount !== undefined 
    ? manualDiscount 
    : (totalValue !== undefined && totalValue < calculatedTotal ? calculatedTotal - totalValue : 0);
  const coinsRequired = orderItems.reduce((acc, item) => acc + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0);
  
  // If specific balances are provided (e.g. from historical view), use them.
  // Otherwise calculate based on Base Camp (8%) logic (for new orders or fallback).
  let initialBalance = customerInitialBalance !== undefined ? customerInitialBalance : (customerCoins || 0);
  let finalBalance = customerFinalBalance !== undefined ? customerFinalBalance : (Math.max(0, initialBalance - coinsRequired) + Math.floor(total * 0.08));
  let earnedCoins = earnedCoinsValue !== undefined 
    ? earnedCoinsValue 
    : (customerFinalBalance !== undefined && customerInitialBalance !== undefined 
        ? (customerFinalBalance - (customerInitialBalance - coinsRequired))
        : Math.floor(total * 0.08));
  
  // Use Intl.DateTimeFormat to ensure consistent IST display regardless of environment timezone
  const istFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const parts = istFormatter.formatToParts(date ? new Date(date) : new Date());
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  
  const dateStr = `${getPart('day')}/${getPart('month')}/${getPart('year')}`;
  const timeStr = `${getPart('hour')}:${getPart('minute')} ${getPart('dayPeriod')}`;

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      fontFamily: "monospace",
      color: '#000000',
      backgroundColor: '#ffffff',
      padding: '2mm',
      fontSize: '10pt',
      width: '100%',
      boxSizing: 'border-box'
    },
    center: { textAlign: 'center' },
    brand: { fontWeight: 'bold', fontSize: '14pt' },
    tagline: { fontSize: '8pt', textTransform: 'uppercase' },
    divider: { borderTop: '1px dashed #000000', margin: '4px 0' },
    table: { width: '100%', fontSize: '9pt', borderCollapse: 'collapse' },
    th: { textAlign: 'left', fontWeight: 'bold', borderBottom: '1px solid #000000' },
    totalRow: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12pt', marginTop: '4px' },
    footer: { marginTop: '10px', fontSize: '8pt', textAlign: 'center' },
    metaRow: { display: 'flex', justifyContent: 'space-between', fontSize: '8pt' }
  };

  return (
    <div style={styles.container} id="printable-receipt">
      <div style={styles.center}>
        <div style={styles.brand}>minmomos</div>
        <div style={styles.tagline}>the ultimate momo station</div>
        {branchName && <div style={{fontWeight: 'bold', fontSize: '8pt'}}>{branchName}</div>}
      </div>
      
      <div style={styles.divider}></div>
      
      <div style={{fontSize: '8pt', fontWeight: 'bold', textAlign: 'center'}}>
        *** {orderType?.replace('_', ' ') || 'ORDER'} ***
      </div>

      <div style={styles.metaRow}>
        <span>BILL: #{billNumber || '----'}</span>
        <span>{dateStr}</span>
      </div>
      <div style={styles.metaRow}>
        <span>TIME: {timeStr}</span>
      </div>
      {customerPhone && <div style={styles.metaRow}><span>CUST: {customerPhone}</span></div>}
      {paymentMethod && <div style={styles.metaRow}><span>PAY: {paymentMethod}</span></div>}
      
      <div style={styles.divider}></div>
      
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{...styles.th, textAlign: 'left'}}>ITEM</th>
            <th style={{...styles.th, textAlign: 'center'}}>QTY</th>
            <th style={{...styles.th, textAlign: 'right'}}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {orderItems.map((item) => (
            <tr key={item.id}>
              <td style={{padding: '2px 0', textAlign: 'left'}}>{item.name}</td>
              <td style={{padding: '2px 0', textAlign: 'center'}}>{item.quantity}</td>
              <td style={{padding: '2px 0', textAlign: 'right'}}>
                {item.paidWithCoins ? 'FREE' : (item.price * item.quantity).toFixed(0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div style={styles.divider}></div>
      
      {displayDiscount > 0 && (
        <div style={{...styles.metaRow, fontSize: '9pt', marginBottom: '2px'}}>
          <span>SUBTOTAL</span>
          <span>₹{calculatedTotal.toFixed(0)}</span>
        </div>
      )}
      
      {displayDiscount > 0 && (
        <div style={{...styles.metaRow, fontSize: '9pt', color: '#d00', marginBottom: '2px'}}>
          <span>DISCOUNT</span>
          <span>-₹{displayDiscount.toFixed(0)}</span>
        </div>
      )}

      <div style={styles.totalRow}>
        <span>TOTAL</span>
        <span>₹{total.toFixed(0)}</span>
      </div>
      
      {customerPhone && (
        <>
          <div style={styles.divider}></div>
          <div style={{...styles.center, fontWeight: 'bold', fontSize: '8pt'}}>LOYALTY REWARDS</div>
          <div style={styles.metaRow}>
            <span>INITIAL BALANCE</span>
            <span>{initialBalance}</span>
          </div>
          <div style={styles.metaRow}>
            <span>EARNED COINS</span>
            <span>+{earnedCoins}</span>
          </div>
          {coinsRequired > 0 && (
            <div style={styles.metaRow}>
              <span>REDEEMED COINS</span>
              <span>-{coinsRequired}</span>
            </div>
          )}
          <div style={{...styles.metaRow, fontWeight: 'bold', borderTop: '1px solid #000000', marginTop: '2px', paddingTop: '2px'}}>
            <span>TOTAL MINCOINS</span>
            <span>{finalBalance}</span>
          </div>
        </>
      )}
      
      <div style={styles.divider}></div>
      
      {nextOrderCoupon && (
        <div style={{...styles.footer, border: '2px solid #000', padding: '6px', margin: '10px 0'}}>
          <div style={{fontWeight: 'bold', fontSize: '9pt'}}>{nextOrderCoupon.discount} OFF NEXT VISIT!</div>
          <div style={{fontSize: '11pt', fontWeight: 'bold', letterSpacing: '2px'}}>{nextOrderCoupon.code}</div>
          <div style={{fontSize: '7pt', marginTop: '2px'}}>Redeem on your {nextOrderCoupon.forOrder}{nextOrderCoupon.forOrder === 2 ? 'nd' : nextOrderCoupon.forOrder === 3 ? 'rd' : 'th'} visit</div>
        </div>
      )}
      
      <div style={styles.footer}>
        <div>Fresh from the Himalayan Peaks</div>
        <div style={{fontWeight: 'bold', marginTop: '4px'}}>THANK YOU! VISIT AGAIN!</div>
      </div>
    </div>
  );
};

export default PrintReceipt;
