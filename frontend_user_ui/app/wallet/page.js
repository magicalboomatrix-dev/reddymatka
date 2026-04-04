'use client'

import Link from 'next/link';
import Header from '../components/Header';
import SkeletonBlock from '../components/SkeletonBlock';
import { betAPI, userAPI, walletAPI } from '../lib/api';
import { formatEnumLabel, formatStatusLabel } from '../lib/formatters';
import { useEffect, useState } from 'react';
import { getSocket, disconnectSocket } from '../lib/socket';

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [todaySummary, setTodaySummary] = useState({ totalBets: 0, totalWins: 0, profit: 0 });
  const today = new Date().toLocaleDateString('en-CA');
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toLocaleDateString('en-CA');
  const [fromDate, setFromDate] = useState(twoWeeksAgo);
  const [toDate, setToDate] = useState(today);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionsError, setTransactionsError] = useState('');

  const formatDateTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (value) => {
    const parsed = Number(value || 0);
    const absAmount = Math.abs(parsed).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (parsed > 0) return `+₹${absAmount}`;
    if (parsed < 0) return `-₹${absAmount}`;
    return `₹${absAmount}`;
  };

  const getStatusToneClass = (statusValue) => {
    const normalizedStatus = String(statusValue || '').toLowerCase();
    if (normalizedStatus === 'completed' || normalizedStatus === 'approved' || normalizedStatus === 'success') {
      return 'bg-[#dcfce7] text-[#166534]';
    }
    if (normalizedStatus === 'failed' || normalizedStatus === 'rejected' || normalizedStatus === 'cancelled') {
      return 'bg-[#fee2e2] text-[#991b1b]';
    }
    return 'bg-[#fef3c7] text-[#92400e]';
  };

  const formatTransactionType = (typeValue) => {
    const value = String(typeValue || '').toLowerCase();
    if (value === 'deposit') return 'Deposit';
    if (value === 'withdraw') return 'Withdrawal';
    if (value === 'bet') return 'Bet Placed';
    if (value === 'win') return 'Winning Credit';
    if (value === 'bonus') return 'Bonus Credit';
    if (value === 'refund') return 'Refund';
    if (value === 'adjustment') return 'Wallet Adjustment';
    return formatEnumLabel(typeValue, 'Transaction');
  };

  const formatTransactionRemark = (remarkValue) => {
    if (!remarkValue) return '-';

    const normalized = String(remarkValue).trim();
    const lower = normalized.toLowerCase();

    const betMatch = normalized.match(/^(jodi|haruf_andar|haruf_bahar|crossing) bet$/i);
    if (betMatch) {
      return `${formatEnumLabel(betMatch[1])} Bet`;
    }

    const winMatch = normalized.match(/^win on (jodi|haruf_andar|haruf_bahar|crossing) bet$/i);
    if (winMatch) {
      return `Win on ${formatEnumLabel(winMatch[1])} Bet`;
    }

    if (lower === 'deposit approved') return 'Deposit Approved';
    if (lower === 'withdraw pending') return 'Withdrawal Pending';
    if (lower === 'withdraw approved') return 'Withdrawal Approved';
    if (lower === 'withdraw rejected') return 'Withdrawal Rejected';

    return formatEnumLabel(normalized);
  };

  const formatReference = (referenceType, referenceId) => {
    if (!referenceType && !referenceId) {
      return '-';
    }

    const typeLabel = formatEnumLabel(referenceType || 'reference');
    const ref = String(referenceId || '').trim();

    const betMatch = ref.match(/^bet_(\d+)$/i);
    if (betMatch) {
      return `${typeLabel} #${betMatch[1]}`;
    }

    const depositMatch = ref.match(/^deposit_(\d+)$/i);
    if (depositMatch) {
      return `${typeLabel} #${depositMatch[1]}`;
    }

    const withdrawMatch = ref.match(/^withdraw_(\d+)$/i);
    if (withdrawMatch) {
      return `${typeLabel} #${withdrawMatch[1]}`;
    }

    return `${typeLabel}${ref ? ` • ${ref}` : ''}`;
  };

  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    setTransactionsError('');
    try {
      const response = await userAPI.getAccountStatement({ from: fromDate, to: toDate, limit: 200 });
      setTransactions(response.transactions || response.statement || []);
    } catch (requestError) {
      setTransactions([]);
      setTransactionsError(requestError.message || 'Failed to load wallet transactions.');
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const todayStr = new Date().toISOString().slice(0, 10);

    const loadWallet = async () => {
      try {
        setLoading(true);
        const [walletResponse, betsResponse] = await Promise.all([
          walletAPI.getInfo(),
          betAPI.myBets({ from_date: todayStr, to_date: todayStr, page: 1, limit: 200 }),
        ]);

        if (!cancelled) {
          setWallet(walletResponse.wallet || walletResponse);
          const bets = betsResponse.bets || [];
          const totals = bets.reduce((accumulator, bet) => {
            accumulator.totalBets += Number(bet.total_amount || 0);
            accumulator.totalWins += Number(bet.win_amount || 0);
            return accumulator;
          }, { totalBets: 0, totalWins: 0 });
          setTodaySummary({
            totalBets: totals.totalBets,
            totalWins: totals.totalWins,
            profit: totals.totalWins - totals.totalBets,
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Failed to load wallet.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadWallet();
    fetchTransactions();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real-time: update balance when wallet_updated is received
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;

    const socket = getSocket(token);

    const handleWalletUpdated = ({ balance }) => {
      setWallet((prev) => (prev ? { ...prev, balance } : { balance }));
    };

    socket.on('wallet_updated', handleWalletUpdated);

    return () => {
      socket.off('wallet_updated', handleWalletUpdated);
      disconnectSocket();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withdrawableAmount = Number(wallet?.available_withdrawal ?? wallet?.balance ?? 0);
  const shouldEstimateBalanceAfter = transactions.length > 0 && transactions.every((item) => Number(item.balance_after || 0) === 0);

  const estimatedBalanceAfterList = [];
  if (shouldEstimateBalanceAfter) {
    let runningBalance = withdrawableAmount;
    for (const transaction of transactions) {
      estimatedBalanceAfterList.push(runningBalance);
      runningBalance -= Number(transaction.amount || 0);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6efe2]">
      <Header />

      <div className="mx-auto w-full max-w-107.5">
           <section className="mb-1 overflow-hidden border border-[#1a1206] bg-[#050505]">
          <div className="bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)]  text-center text-[#111]">
            <h1 className="text-lg font-bold uppercase tracking-[0.14em]">Wallet</h1>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4d2f00]">Deposit and withdraw from one quick hub</p>
          </div>
<div className="relative overflow-hidden text-white">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(235,218,141,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(255,0,0,0.12),transparent_34%)]" />

  <div className="relative grid grid-cols-2 gap-3 text-center">

    {/* Main Balance */}
    <div className="flex flex-col items-center justify-center border border-white/10 bg-white/6 backdrop-blur-sm p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">
        Main Balance
      </div>

      <div className="mt-2 text-[28px] font-bold leading-none text-[#ebda8d]">
        {formatCurrency(wallet?.balance)}
      </div>
    </div>

    {/* Bonus Wallet */}
    <div className="flex flex-col items-center justify-center border border-white/10 bg-white/6 backdrop-blur-sm p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">
        Bonus Wallet
      </div>

      <div className="mt-2 text-[28px] font-bold leading-none text-[#7df48f]">
        {formatCurrency(wallet?.bonus_balance)}
      </div>
    </div>

  </div>
</div>
        </section>

         <section className="flex justify-center gap-2 max-w-md mx-auto">

  {/* Deposit */}
  <Link
    href="/deposit"
    className="group w-1/2 overflow-hidden border border-[#d6b774] bg-white shadow-[0_12px_28px_rgba(79,52,10,0.08)]"
  >
    <div className="bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] py-2 text-[#111] text-center">
      <div className="text-xs font-bold uppercase tracking-[0.12em]">
        Add Money
      </div>
    </div>

    <div className="flex flex-col items-center text-center space-y-2 p-2">

      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111]">
        <img
          src="/images/bank-building.png"
          alt="deposit"
          className="h-6 w-6 object-contain"
        />
      </div>

      <div>
        <h2 className="text-base font-bold text-[#111]">Deposit</h2>
        <p className="mt-1 text-xs text-[#6d6659]">
          Submit UTR and track approval.
        </p>
      </div>

      <div className="text-xs font-semibold text-[#a32020] group-hover:text-[#7a1010]">
        Go to deposit
      </div>

    </div>
  </Link>


  {/* Withdraw */}
  <Link
    href="/withdraw"
    className="group w-1/2 overflow-hidden border border-[#d6b774] bg-white shadow-[0_12px_28px_rgba(79,52,10,0.08)]"
  >
    <div className="bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] py-2 text-[#111] text-center">
      <div className="text-xs font-bold uppercase tracking-[0.12em]">
        Cash Out
      </div>
    </div>

    <div className="flex flex-col items-center text-center space-y-2 p-2">

      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111]">
        <img
          src="/images/withdraw.png"
          alt="withdraw"
          className="h-6 w-6 object-contain"
        />
      </div>

      <div>
        <h2 className="text-base font-bold text-[#111]">Withdraw</h2>
        <p className="mt-1 text-xs text-[#6d6659]">
          Request payout to saved bank.
        </p>
      </div>

      <div className="text-xs font-semibold text-[#a32020] group-hover:text-[#7a1010]">
        Go to withdraw
      </div>

    </div>
  </Link>

</section>
        <section className="mb-1 border border-[#d6b774] bg-white p-3 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6d4a08]">Today Summary</div>
          {loading ? (
            <div className="mt-2 space-y-2">
              {[1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-4 w-full" />)}
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
               
              <div className="border border-[#ead8ab] bg-[#fff8e7] px-3 py-2">
                <div className="text-[#6b5a3a]">Today's Bets</div>
                <div className="font-black text-[#111]">{formatCurrency(todaySummary.totalBets)}</div>
              </div>
              <div className="border border-[#ead8ab] bg-[#fff8e7] px-3 py-2">
                <div className="text-[#6b5a3a]">Today's Wins</div>
                <div className="font-black text-[#1a7f3c]">{formatCurrency(todaySummary.totalWins)}</div>
              </div>
              <div className="border border-[#ead8ab] bg-[#fff8e7] px-3 py-2">
                <div className="text-[#6b5a3a]">Today's Profit</div>
                <div className={`font-black ${todaySummary.profit >= 0 ? 'text-[#1a7f3c]' : 'text-[#b91c1c]'}`}>{formatCurrency(todaySummary.profit)}</div>
              </div>
              <div className="col-span-3 border border-[#ead8ab] bg-[#fff8e7] px-3 py-2">
                <div className="text-[#6b5a3a]">Note</div>
                <div className="font-semibold text-[#111]">Bonus wallet is not withdrawable. Only main wallet balance can be withdrawn.</div>
              </div>
            </div>
          )}
        </section>

     

        {error && (
          <div className="mt-5 border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

       

        <section className="mt-4 border border-[#d6b774] bg-white p-3 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">
          <div className="bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-3 py-2 text-center text-[#111]">
            <h2 className="text-sm font-bold uppercase tracking-widest">Wallet Transaction History</h2>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-[#111]">From Date</label>
              <input
                className="mt-1 h-9 w-full border border-[#d8d1c4] bg-[#faf7f0] px-3 text-sm"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111]">To Date</label>
              <input
                className="mt-1 h-9 w-full border border-[#d8d1c4] bg-[#faf7f0] px-3 text-sm"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="mt-3 h-10 w-full bg-[#111] text-sm font-semibold text-[#ebda8d]"
            onClick={fetchTransactions}
            disabled={loadingTransactions}
          >
            {loadingTransactions ? 'Loading...' : 'Apply Filters'}
          </button>

          {transactionsError && (
            <div className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {transactionsError}
            </div>
          )}

          <div className="mt-3 space-y-3">
            {loadingTransactions ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-20 w-full" />)}
              </div>
            ) : (
              <>
                {transactions.map((transaction, index) => {
                  const amountValue = Number(transaction.amount || 0);
                  const balanceAfterValue = shouldEstimateBalanceAfter
                    ? estimatedBalanceAfterList[index]
                    : Number(transaction.balance_after || 0);
                  return (
                    <div key={transaction.id || index} className="border border-[#ead8ab] bg-[#fffdf7] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-[#111]">{formatTransactionType(transaction.type)}</div>
                          <div className="mt-1 text-[11px] text-[#6b5a3a]">{formatDateTime(transaction.created_at)}</div>
                        </div>
                        <span className={`px-2 py-1 text-[10px] font-bold uppercase ${getStatusToneClass(transaction.status)}`}>
                          {formatStatusLabel(transaction.status, 'Completed')}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-[#6b5a3a]">Amount</div>
                          <div className={`font-bold ${amountValue >= 0 ? 'text-[#1a7f3c]' : 'text-[#b91c1c]'}`}>{formatAmount(transaction.amount)}</div>
                        </div>
                        <div>
                          <div className="text-[#6b5a3a]">Balance After</div>
                          <div className="font-bold text-[#111]">{formatCurrency(balanceAfterValue)}</div>
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-[#111]">Remark: {formatTransactionRemark(transaction.remark || transaction.description)}</div>
                      <div className="mt-1 text-[11px] text-[#6b5a3a]">Reference: {formatReference(transaction.reference_type, transaction.reference_id)}</div>
                    </div>
                  );
                })}

                {transactions.length === 0 && (
                  <div className="border border-[#ead8ab] bg-[#fffdf7] px-3 py-6 text-center text-sm text-[#6b5a3a]">
                    No wallet transactions found for selected dates.
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}