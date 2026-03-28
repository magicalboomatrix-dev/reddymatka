
'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import DepositWithdrawBtns from '../components/DepositWithdrawBtns'
import { depositAPI, userAPI } from '../lib/api'
import { formatApprovalRole, formatStatusLabel } from '../lib/formatters'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const BACKEND_BASE = API_BASE.replace(/\/api\/?$/, '');

function formatApprovalLabel(deposit) {
  if (!deposit?.approved_by_role || !deposit?.approved_by_name) {
    return '-';
  }

  const roleLabel = formatApprovalRole(deposit.approved_by_role);
  const actionLabel = deposit.status === 'rejected' ? 'Rejected by' : 'Approved by';
  return `${actionLabel}: ${roleLabel} ${deposit.approved_by_name}`;
}

const DipositPage = () => {
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState([]);
  const [scanner, setScanner] = useState(null);
  const [scannerError, setScannerError] = useState('');
  const [depositGuidelines, setDepositGuidelines] = useState([]);

  useEffect(() => {
    if (!screenshot) {
      setScreenshotPreview('');
      return;
    }

    const objectUrl = URL.createObjectURL(screenshot);
    setScreenshotPreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [screenshot]);

  const fetchHistory = async () => {
    try {
      const res = await depositAPI.history({});
      setHistory(res.deposits || []);
    } catch {}
  };

  const fetchScanner = async () => {
    try {
      const res = await depositAPI.scanner();
      setScanner(res);
      setScannerError('');
    } catch (err) {
      setScanner(null);
      setScannerError(err.message || 'Deposit scanner is not assigned yet.');
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchScanner();
    userAPI.getUiConfig().then((res) => setDepositGuidelines(res.deposit_guidelines || [])).catch(() => setDepositGuidelines([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!amount || parseInt(amount) <= 0) { setError('Enter valid amount'); return; }
    if (!utr) { setError('Enter UTR / transaction reference'); return; }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('amount', amount);
      formData.append('utr_number', utr);
      if (screenshot) formData.append('screenshot', screenshot);

      await depositAPI.request(formData);
      setSuccess('Deposit request submitted!');
      setAmount(''); setUtr(''); setScreenshot(null);
      fetchHistory();
    } catch (err) {
      setError(err.message || 'Failed to submit deposit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="sticky top-0 z-40 mx-auto flex w-full max-w-[430px] items-center bg-white px-4 py-3 shadow-sm">
        <a href="/home" className="mr-3 inline-flex"><img alt="back" src="/images/back-btn.png" className="h-5 w-5" /></a>
        <h3 className="flex-1 text-center text-sm font-semibold text-[#111]">Deposit</h3>
      </header>

        <div className='bg-white pb-6'>
            
            <DepositWithdrawBtns></DepositWithdrawBtns>
            
             <div className='mx-auto w-full max-w-[430px] '>    
                
            <div className="border border-[#d6b774] bg-white p-4 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">

              <div className="mb-4 border border-[#fdba74] bg-[#fff7ed] p-3.5">
                    <div className="mb-2 text-sm font-bold text-[#9a3412]">Assigned Moderator Payment Scanner</div>
                    {scanner ? (
                      <>
                        <p className="mb-1.5 text-xs text-[#7c2d12]"><b>Label:</b> {scanner.scanner_label || 'Moderator Scanner'}</p>
                        <p className="mb-3 text-xs text-[#7c2d12]"><b>UPI ID:</b> {scanner.upi_id || '-'}</p>
                        {(scanner.qr_code_image || scanner.qr_image) && (
                          <img
                            src={scanner.qr_code_image_url || scanner.qr_image_url || `${BACKEND_BASE}/uploads/${scanner.qr_code_image || scanner.qr_image}`}
                            alt={scanner.scanner_label || 'Moderator QR code'}
                            className="mx-auto block w-full max-w-[280px] border border-[#fed7aa] bg-white p-2"
                          />
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[#9a3412]">{scannerError || 'Scanner not assigned yet.'}</p>
                    )}
                </div>

                {error && <div className="mb-2 bg-[#ffe0e0] px-2 py-2 text-xs text-[#c00]">{error}</div>}
                {success && <div className="mb-2 bg-[#e0ffe0] px-2 py-2 text-xs text-[#060]">{success}</div>}

                <div className='mt-4'>
                    <form onSubmit={handleSubmit}>
                    <label className="mb-1 block text-sm"><b>Amount</b></label>
                    <div><input className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm" type='number' placeholder='Enter amount' value={amount} onChange={e => setAmount(e.target.value)} min="1" /></div>
                    <label className="mb-1 mt-2.5 block text-sm"><b>UTR / Transaction ID</b></label>
                    <div><input className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm" type='text' placeholder='Enter UTR number' value={utr} onChange={e => setUtr(e.target.value)} /></div>
                    <label className="mb-1 mt-2.5 block text-sm"><b>Screenshot (optional)</b></label>
                    <div>
                      <input className="w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 py-3 text-sm" type='file' accept='image/*' onChange={e => setScreenshot(e.target.files[0] || null)} />
                    </div>
                    {screenshot && (
                      <div className="mt-2.5 border border-[#e5e7eb] bg-[#fafafa] p-2.5">
                        <div className="mb-2 text-xs font-semibold text-[#111827]">
                          Selected screenshot: {screenshot.name}
                        </div>
                        {screenshotPreview && (
                          <img
                            src={screenshotPreview}
                            alt="Selected deposit screenshot"
                            className="max-h-[220px] max-w-full object-contain"
                          />
                        )}
                      </div>
                    )}
                    <button className="mt-4 h-11 w-full bg-[#111] text-sm font-semibold text-white" type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit'}</button>
                    </form>
                </div>
            </div>

                <div className='mt-4 border border-[#d6b774] bg-white shadow-[0_12px_28px_rgba(79,52,10,0.08)]'>
                <div>
                <div className="px-3 py-3 text-left text-[10px] font-medium text-red-600">
                    {(depositGuidelines.length > 0 ? depositGuidelines : ['Deposit instructions are currently unavailable.']).map((rule, index) => (
                      <p key={`${rule}-${index}`}>{index + 1}. {rule}</p>
                    ))}
                </div>
            </div>
            </div>           

            <div className="mt-4 overflow-x-auto border border-[#ead8ab]">
                <div>
                <table className="w-full border-collapse text-left text-xs text-[#111]">
                    <thead>
                        <tr>
                            <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">UTR</th>
                            <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Amount</th>
                          <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Receipt</th>
                            <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Status</th>
                          <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Review</th>
                          <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Reason</th>
                            <th className="border-b bg-[#f7f0e3] px-3 py-2">Date</th>
                        </tr>
                        </thead>

                        <tbody>
                            {history.map((d, i) => (
                            <tr key={d.id || i}>
                                <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{d.utr_number || '-'}</td>
                                <td className="border-b border-r border-[#f0e3c6] px-3 py-2">₹{d.amount}</td>
                            <td className="border-b border-r border-[#f0e3c6] px-3 py-2">
                              {d.receipt_image ? (
                              <a href={`${BACKEND_BASE}/uploads/${d.receipt_image}`} target="_blank" rel="noreferrer">View</a>
                              ) : '-'}
                            </td>
                                <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{formatStatusLabel(d.status)}</td>
                            <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{formatApprovalLabel(d)}</td>
                            <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{d.reject_reason || '-'}</td>
                                <td className="border-b px-3 py-2">{d.created_at ? new Date(d.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</td>
                            </tr>
                            ))}
                          {history.length === 0 && <tr><td className="px-3 py-6 text-center" colSpan="7">No deposits yet</td></tr>}
                        </tbody>
                </table>
                </div>
            </div>

            </div>

        </div>

    </div>
  )
}

export default DipositPage
