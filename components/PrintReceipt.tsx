
import React from 'react';
import { OrderItem, PaymentMethod, OrderType } from '../types';

interface PrintReceiptProps {
  orderItems: OrderItem[];
  billNumber?: number | null;
  paymentMethod?: PaymentMethod | null;
  branchName?: string | null;
  date?: string | Date | null;
  orderType?: OrderType;
  tableId?: string;
  customerPhone?: string;
}

const PrintReceipt: React.FC<PrintReceiptProps> = ({ 
  orderItems, 
  billNumber, 
  paymentMethod, 
  branchName, 
  date,
  orderType,
  tableId,
  customerPhone
}) => {
  const total = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const transactionDate = date ? new Date(date) : new Date();
  
  const tableNum = tableId?.split('-')[1];

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
        <span>{transactionDate.toLocaleDateString()}</span>
      </div>
      <div style={styles.metaRow}>
        <span>TIME: {transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        {tableNum && <span>TABLE: {tableNum}</span>}
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
              <td style={{padding: '2px 0', textAlign: 'right'}}>{(item.price * item.quantity).toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div style={styles.divider}></div>
      
      <div style={styles.totalRow}>
        <span>TOTAL</span>
        <span>₹{total.toFixed(0)}</span>
      </div>
      
      <div style={styles.divider}></div>
      
      <div style={styles.footer}>
        <div>Fresh from the Himalayan Peaks</div>
        <div style={{fontWeight: 'bold', marginTop: '4px'}}>THANK YOU! VISIT AGAIN!</div>
      </div>
    </div>
  );
};

export default PrintReceipt;
