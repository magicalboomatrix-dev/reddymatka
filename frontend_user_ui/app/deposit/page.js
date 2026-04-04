'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'react-qr-code'
import DepositWithdrawBtns from '../components/DepositWithdrawBtns'
import { autoDepositAPI, userAPI } from '../lib/api'

function getOrderStatusClasses(status) {
  switch (status) {
    case 'matched':
      return 'bg-green-100 text-green-700'
    case 'pending':
      return 'bg-amber-100 text-amber-700'
    case 'expired':
    case 'cancelled':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function getOrderStatusLabel(status) {
  if (status === 'matched') return 'Credited'
  if (status === 'pending') return 'Pending'
  if (status === 'expired') return 'Expired'
  if (status === 'cancelled') return 'Cancelled'
  return status || 'Unknown'
}

const DepositPage = () => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [orderHistory, setOrderHistory] = useState([]);
  const [depositGuidelines, setDepositGuidelines] = useState([]);
  const [depositLimits, setDepositLimits] = useState({ min: 100, max: 50000 });

  // Active order state
  const [activeOrder, setActiveOrder] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const pollAttemptsRef = useRef(0);

  const fetchHistory = async () => {
    try {
      const res = await autoDepositAPI.getMyOrders({ page: 1, limit: 20 });
      setOrderHistory(res.orders || []);
    } catch {}
  };

  useEffect(() => {
    userAPI.getUiConfig().then((res) => {
      setDepositGuidelines(res.deposit_guidelines || []);
      if (res.settings) {
        setDepositLimits({
          min: Number(res.settings.min_deposit) || 100,
          max: Number(res.settings.max_deposit) || 50000,
        });
      }
    }).catch(() => setDepositGuidelines([]));

    // Single fetch for history + pending order check
    autoDepositAPI.getMyOrders({ page: 1, limit: 20 }).then((res) => {
      const orders = res.orders || [];
      setOrderHistory(orders);
      const order = orders.find((item) => item.status === 'pending');
      if (order) {
        const expiresAt = new Date(order.expires_at).getTime();
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        if (remaining > 0) {
          setActiveOrder(order);
          setTimeLeft(remaining);
          setPaymentDetails({
            upi_id: order.upi_id || '',
            payee_name: order.payee_name || '',
            amount: parseFloat(order.amount),
            pay_amount: order.pay_amount ? parseFloat(order.pay_amount) : parseFloat(order.amount),
            order_ref: order.order_ref || null,
            upi_link: order.upi_link || null,
            qr_code: order.qr_code || null,
          });
        }
      }
    }).catch(() => {});

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!activeOrder || timeLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          clearInterval(pollRef.current);
          setActiveOrder(null);
          setPaymentDetails(null);
          setError('Deposit order expired. Please create a new one.');
          fetchHistory();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [activeOrder]);

  // Poll order status (max 24 attempts = 2 minutes at 5 s intervals)
  const startPolling = useCallback((orderId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollAttemptsRef.current = 0;

    pollRef.current = setInterval(async () => {
      pollAttemptsRef.current += 1;
      // Stop after 24 attempts (~2 min) to avoid runaway polling
      if (pollAttemptsRef.current >= 24) {
        clearInterval(pollRef.current);
        return;
      }
      try {
        const res = await autoDepositAPI.getOrderStatus(orderId);
        const order = res.order;
        if (order.status === 'matched') {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          setActiveOrder(null);
          setPaymentDetails(null);
          setSuccess(`Deposit of ₹${parseFloat(order.amount).toLocaleString('en-IN')} has been verified and credited!`);
          fetchHistory();
        } else if (order.status === 'expired' || order.status === 'cancelled') {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          setActiveOrder(null);
          setPaymentDetails(null);
          if (order.status === 'expired') setError('Order expired. Please try again.');
          fetchHistory();
        }
      } catch {}
    }, 5000);
  }, []);

  useEffect(() => {
    if (activeOrder) {
      startPolling(activeOrder.id);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeOrder, startPolling]);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const parsed = parseInt(amount);
    if (!parsed || parsed <= 0) { setError('Enter a valid amount'); return; }

    setLoading(true);
    try {
      const res = await autoDepositAPI.createOrder(parsed);
      setActiveOrder(res.order);
      setPaymentDetails(res.payment_details);
      setTimeLeft(res.order.expires_in_seconds || 600);
      setAmount('');
    } catch (err) {
      if (err.message?.includes('already have a pending')) {
        setError('You already have a pending order for this amount. Please wait or cancel it.');
      } else {
        setError(err.message || 'Failed to create deposit order');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeOrder) return;
    try {
      await autoDepositAPI.cancelOrder(activeOrder.id);
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
      setActiveOrder(null);
      setPaymentDetails(null);
      setTimeLeft(0);
    } catch (err) {
      setError(err.message || 'Failed to cancel order');
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <header className="sticky top-0 z-40 mx-auto flex w-full max-w-107.5 items-center bg-white px-4 py-3 shadow-sm">
        <a href="/home" className="mr-3 inline-flex"><img alt="back" src="/images/back-btn.png" className="h-5 w-5" /></a>
        <h3 className="flex-1 text-center text-sm font-semibold text-[#111]">Deposit</h3>
      </header>

      <div className="bg-white pb-6">
        <DepositWithdrawBtns />

        <div className="mx-auto w-full max-w-107.5">
          <div className="border border-[#d6b774] bg-white p-4 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">

            {error && <div className="mb-2 bg-[#ffe0e0] px-2 py-2 text-xs text-[#c00]">{error}</div>}
            {success && <div className="mb-2 bg-[#e0ffe0] px-2 py-2 text-xs text-[#060]">{success}</div>}

            {/* Active order - show UPI details + countdown */}
            {activeOrder && paymentDetails ? (
              <div className="mt-2">
                <div className="mb-3 border border-[#fdba74] bg-[#fff7ed] p-3.5">
                  <div className="mb-2 text-sm font-bold text-[#9a3412]">Complete Your Payment</div>

                  {paymentDetails.order_ref && (
                    <div className="mb-2 rounded bg-[#fef3c7] border border-[#fcd34d] p-2 text-center">
                      <span className="text-[10px] text-[#92400e]">Order Ref:</span>
                      <span className="ml-1 font-mono text-sm font-bold text-[#9a3412]">{paymentDetails.order_ref}</span>
                    </div>
                  )}

                  <p className="mb-1 text-xs text-[#7c2d12]"><b>Pay Exactly:</b> <span className="text-sm font-bold">₹{(paymentDetails.pay_amount || paymentDetails.amount).toFixed(2)}</span></p>
                  <p className="mb-1 text-xs text-[#7c2d12]"><b>UPI ID:</b> {paymentDetails.upi_id}</p>
                  {paymentDetails.payee_name && <p className="mb-1 text-xs text-[#7c2d12]"><b>Name:</b> {paymentDetails.payee_name}</p>}

                  {/* UPI QR Code */}
                  <div className="my-3 flex justify-center">
                    <div className="rounded-lg bg-white p-3 shadow-md border border-[#e5e7eb]">
                      {paymentDetails.qr_code ? (
                        <img src={paymentDetails.qr_code} alt="UPI QR Code" width={180} height={180} />
                      ) : (
                        <QRCode
                          value={paymentDetails.upi_link || `upi://pay?pa=${encodeURIComponent(paymentDetails.upi_id)}&am=${paymentDetails.pay_amount || paymentDetails.amount}&cu=INR${paymentDetails.order_ref ? `&tn=${encodeURIComponent('Deposit ' + paymentDetails.order_ref)}` : ''}`}
                          size={180}
                          level="M"
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-[#9a3412] mb-2">Scan QR code with any UPI app</p>

                  {paymentDetails.upi_link && (
                    <a
                      href={paymentDetails.upi_link}
                      className="mt-2 block w-full rounded bg-[#f97316] py-2.5 text-center text-sm font-bold text-white"
                    >
                      Pay via UPI App
                    </a>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#f97316]"></span>
                      <span className="text-xs font-semibold text-[#9a3412]">Time remaining: {formatTime(timeLeft)}</span>
                    </div>
                  </div>

                  <div className="mt-3 bg-[#fef3c7] border border-[#fcd34d] p-2 text-[10px] text-[#92400e]">
                    <p>1. Open your UPI app (GPay, PhonePe, Paytm, etc.)</p>
                    <p>2. Send exactly <b>₹{(paymentDetails.pay_amount || paymentDetails.amount).toFixed(2)}</b> to <b>{paymentDetails.upi_id}</b></p>
                    <p>3. The exact paise amount ensures your payment is matched correctly.</p>
                    <p>4. Your deposit will be automatically detected and credited.</p>
                    <p>5. Do NOT close this page until payment is confirmed.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-[#6b7280]">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
                  Waiting for payment confirmation...
                </div>

                <button
                  type="button"
                  onClick={handleCancel}
                  className="mt-3 h-10 w-full border border-[#d1d5db] bg-white text-xs font-semibold text-[#6b7280] hover:bg-[#f9fafb]"
                >
                  Cancel Order
                </button>
              </div>
            ) : (
              /* Amount input form */
              <div className="mt-4">
                <form onSubmit={handleCreateOrder}>
                  <label className="mb-1 block text-sm"><b>Amount</b></label>
                  <div>
                    <input
                      className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm"
                      type="number"
                      placeholder={`Enter amount (min ₹${depositLimits.min})`}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min={depositLimits.min}
                      max={depositLimits.max}
                    />
                  </div>
                  <button
                    className="mt-4 h-11 w-full bg-[#111] text-sm font-semibold text-white"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? 'Creating...' : 'Deposit'}
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="mt-4 border border-[#d6b774] bg-white shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
            <div className="px-3 py-3 text-left text-[10px] font-medium text-red-600">
              {(depositGuidelines.length > 0 ? depositGuidelines : [
                `Minimum deposit amount is ₹${depositLimits.min}.`,
                `Maximum deposit amount is ₹${depositLimits.max.toLocaleString('en-IN')}.`,
                'Send the exact amount via UPI to the given UPI ID.',
                'Your deposit will be auto-detected within 1-2 minutes.',
                'Do not close the page while waiting for confirmation.',
              ]).map((rule, index) => (
                <p key={index}>{index + 1}. {rule}</p>
              ))}
            </div>
          </div>

          {/* Deposit History */}
          <div className="mt-4 overflow-x-auto border border-[#ead8ab]">
            <table className="w-full border-collapse text-left text-xs text-[#111]">
              <thead>
                <tr>
                  <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Order Ref</th>
                  <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Paid</th>
                  <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Credited</th>
                  <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Status</th>
                  <th className="border-b bg-[#f7f0e3] px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {orderHistory.map((order, i) => (
                  <tr key={order.id || i}>
                    <td className="border-b border-r border-[#f0e3c6] px-3 py-2 font-mono">{order.order_ref || '-'}</td>
                    <td className="border-b border-r border-[#f0e3c6] px-3 py-2">₹{parseFloat(order.pay_amount || order.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="border-b border-r border-[#f0e3c6] px-3 py-2">₹{parseFloat(order.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="border-b border-r border-[#f0e3c6] px-3 py-2">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${getOrderStatusClasses(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="border-b px-3 py-2">{order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</td>
                  </tr>
                ))}
                {orderHistory.length === 0 && <tr><td className="px-3 py-6 text-center" colSpan="5">No deposit orders yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DepositPage
