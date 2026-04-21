import React from 'react';
import { OrderItem, PaymentMethod } from './types';

interface PrintReceiptProps {
  orderItems: OrderItem[];
  billNumber?: number | null;
  paymentMethod?: PaymentMethod | null;
  branchName?: string | null;
}

const PrintReceipt: React.FC<PrintReceiptProps> = ({ orderItems, billNumber, paymentMethod, branchName }) => {
  const total = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const currentDate = new Date();

  return (
    <div className="w-48 mx-auto p-1 bg-white text-black font-mono text-xs print-container">
      <div className="text-center">
        {/* Momo Icon */}
        <svg className="w-10 h-10 mx-auto mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 12.5C18 16.0376 15.3137 19 12 19C8.68629 19 6 16.0376 6 12.5C6 9 12 6.5 12 6.5C12 6.5 18 9 18 12.5Z M12 6.5C11.5 8 10 8.5 9 9.5 M12 6.5C12.5 8 14 8.5 15 9.5 M10 4.5C10.5 3.5 11 3 12 3C13 3 13.5 3.5 14 4.5 M11 2C11.5 1.5 12 1 12 1C12 1 12.5 1.5 13 2" />
        </svg>
        <h1 className="font-bold text-base">Momomaya</h1>
        <p className="text-[10px]">Have Momo, beat FOMO</p>
        {branchName && <p className="text-[10px] font-semibold">{branchName}</p>}
      </div>
      <div className="border-b border-dashed border-black my-1"></div>
      <div className="my-1">
        {billNumber && <p>Bill No: {billNumber}</p>}
        <p>Date: {currentDate.toLocaleDateString()}</p>
        <p>Time: {currentDate.toLocaleTimeString()}</p>
        {paymentMethod && <p>Payment: {paymentMethod}</p>}
      </div>
      <div className="border-b border-dashed border-black my-1"></div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="text-left font-semibold pb-1 w-[45%] text-black">Item</th>
            <th className="text-center font-semibold pb-1 text-black">Qty</th>
            <th className="text-right font-semibold pb-1 text-black">Price</th>
            <th className="text-right font-semibold pb-1 text-black">Total</th>
          </tr>
        </thead>
        <tbody>
          {orderItems.map((item) => (
            <tr key={item.id}>
              <td className="text-left py-1 break-words align-top text-black">{item.name}</td>
              <td className="text-center align-top text-black">{item.quantity}</td>
              <td className="text-right align-top text-black">{item.price.toFixed(2)}</td>
              <td className="text-right align-top text-black">{(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-b border-dashed border-black my-1"></div>
      <div className="mt-1">
        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL:</span>
          <span>₹{total.toFixed(2)}</span>
        </div>
      </div>
      <div className="border-b border-dashed border-black my-1"></div>
      <div className="text-center mt-2 text-[10px]">
        <p>Thank you for your visit!</p>
        <p>Come back soon!</p>
      </div>
    </div>
  );
};

export default PrintReceipt;