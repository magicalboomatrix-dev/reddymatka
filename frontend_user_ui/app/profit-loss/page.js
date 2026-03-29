'use client'
import React, { useState, useEffect } from 'react'
import Header from '../components/Header';
import DepositWithdrawBtns from '../components/DepositWithdrawBtns';
import { userAPI } from '../lib/api'
import { formatBetType, formatStatusLabel } from '../lib/formatters';

const ProfitLoss = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const today = new Date().toLocaleDateString('en-CA');
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toLocaleDateString('en-CA');
  const [fromDate, setFromDate] = useState(twoWeeksAgo);
  const [toDate, setToDate] = useState(today);

  const rowsPerPage = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const start = (page - 1) * rowsPerPage;
  const currentRows = rows.slice(start, start + rowsPerPage);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await userAPI.getProfitLoss({ from: fromDate, to: toDate, limit: 200 });
      setRows(res.records || res.bets || res.profitLoss || res.data || []);
      setPage(1);
    } catch {} finally { setLoading(false); }
  };

  const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  useEffect(() => { fetchData(); }, []);

  return (
    <div>
        <Header></Header>

      <div className='bg-white pb-6'>

        <DepositWithdrawBtns></DepositWithdrawBtns>
        
        <div className='mx-auto w-full max-w-[430px] '>
          <div className="bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-4 py-2.5 text-center text-[#111]"><h2 className="text-sm font-semibold uppercase tracking-[0.08em]"><b>Betting Profit and Loss</b></h2></div>
          <section className='border border-t-0 border-[#d6b774] bg-white  shadow-[0_12px_28px_rgba(79,52,10,0.08)]'>
                    
                    <div className="grid grid-cols-2 gap-1 m-2">
                        <div>
                        <label className=" block text-sm font-medium text-[#111]">From Date</label>
                        <input className="h-9 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                        </div>
                        <div>
                        <label className=" block text-sm font-medium text-[#111]">To Date</label>
                        <input className="h-9 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                        </div>
                    </div>
                    <button className="mt-2 h-9 w-full bg-[#111] text-sm font-semibold text-[#ebda8d]" onClick={fetchData} disabled={loading}>{loading ? 'Loading...' : 'SEARCH'}</button>
                   
                   <div className='mt-4 overflow-x-auto border border-[#ead8ab]'>
                    <table className="w-full border-collapse text-left text-xs text-[#111]">
                        <thead>
                        <tr>
                            <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Sr No</th>
                            <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Date</th>
                            <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Game</th>
                            <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Type</th>
                          <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Bet</th>
                          <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Win</th>
                          <th className="border-b border-r border-[#ead8ab] bg-[#f7f0e3] px-3 py-2">Profit/Loss</th>
                          <th className="border-b bg-[#f7f0e3] px-3 py-2">Status</th>
                        </tr>
                        </thead>

                        <tbody>
                        {currentRows.map((row, idx) => (
                            <tr key={row.id || idx}>
                            <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{start + idx + 1}</td>
                            <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{row.created_at ? new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</td>
                          <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{row.event || row.game_name || '-'}</td>
                          <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{formatBetType(row.event_type || row.bet_type || '-')}</td>
                          <td className="border-b border-r border-[#f0e3c6] px-3 py-2">{formatCurrency(row.total_amount)}</td>
                          <td className="border-b border-r border-[#f0e3c6] px-3 py-2 text-[#127a3b]">{formatCurrency(row.win_amount)}</td>
                          <td className={`border-b border-r border-[#f0e3c6] px-3 py-2 ${Number(row.profit_loss) >= 0 ? 'text-[#127a3b]' : 'text-[#b91c1c]'}`}>{formatCurrency(row.profit_loss)}</td>
                          <td className="border-b px-3 py-2">{formatStatusLabel(row.status)}</td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td className="px-3 py-6 text-center" colSpan="8">No data found</td></tr>}
                        </tbody>
                    </table>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                        <button disabled={page === 1} onClick={() => setPage(page - 1)} className="border border-[#111] px-4 py-2 text-xs font-semibold disabled:opacity-40">
                        Prev
                        </button>

                        <span className="text-xs font-medium text-[#111]">
                        Page {page} / {totalPages}
                        </span>

                        <button
                        disabled={page === totalPages}
                        onClick={() => setPage(page + 1)} className="bg-[#111] px-4 py-2 text-xs font-semibold text-[#ebda8d] disabled:opacity-40"
                        >
                        Next
                        </button>
                    </div>

            </section>
        </div>
      </div>

      
    </div>
  )
}

export default ProfitLoss
