import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

const TYPE_COLORS = {
  deposit:    'text-green-600',
  win:        'text-green-700',
  bet:        'text-red-600',
  withdraw:   'text-red-700',
  adjustment: 'text-blue-600',
  bonus:      'text-yellow-600',
  refund:     'text-teal-600',
};

export default function WalletAudit() {
  const [userId, setUserId] = useState('');
  const [inputId, setInputId] = useState('');
  const [ledger, setLedger] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [loadingRecon, setLoadingRecon] = useState(true);
  const { toasts, error: toastError, dismiss } = useToast();

  useEffect(() => {
    loadReconciliation();
  }, []);

  const loadReconciliation = async () => {
    setLoadingRecon(true);
    try {
      const res = await api.get('/wallet-audit/reconciliation');
      setReconciliation(res.data);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to load reconciliation');
    } finally {
      setLoadingRecon(false);
    }
  };

  const lookupUser = async (e) => {
    e.preventDefault();
    const id = inputId.trim();
    if (!id) return;
    setLoadingLedger(true);
    setLedger(null);
    try {
      const res = await api.get(`/wallet-audit/user/${id}`);
      setLedger(res.data);
      setUserId(id);
    } catch (err) {
      toastError(err.response?.data?.error || 'User not found');
    } finally {
      setLoadingLedger(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      {/* Reconciliation summary */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Platform Reconciliation</h3>
        {loadingRecon ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : reconciliation && (
          <div className="space-y-3">
            <div className="bg-white border px-4 py-3 inline-block">
              <div className="text-xs text-gray-500">Total Wallet Balance (all users)</div>
              <div className="text-2xl font-bold text-gray-800">
                ₹{parseFloat(reconciliation.wallet_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-white border px-4 py-3 inline-block ml-3">
              <div className="text-xs text-gray-500">Pending Withdrawals</div>
              <div className="text-2xl font-bold text-red-600">
                ₹{parseFloat(reconciliation.pending_withdrawals).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-white border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Credits</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Debits</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(reconciliation.transaction_summary || []).map((row) => (
                    <tr key={row.type} className="hover:bg-gray-50">
                      <td className={`px-4 py-2 font-medium capitalize ${TYPE_COLORS[row.type] || ''}`}>{row.type}</td>
                      <td className="px-4 py-2 text-right text-green-700">
                        ₹{parseFloat(row.credits).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right text-red-700">
                        ₹{parseFloat(row.debits).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Per-user ledger lookup */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">User Ledger Lookup</h3>
        <form onSubmit={lookupUser} className="flex gap-2 mb-4">
          <input
            type="number"
            placeholder="Enter User ID"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            className="border px-3 py-2 text-sm flex-1 max-w-xs"
          />
          <button type="submit" disabled={loadingLedger}
            className="px-4 py-2 bg-primary-600 text-white text-sm disabled:opacity-50">
            {loadingLedger ? 'Loading…' : 'Lookup'}
          </button>
        </form>

        {ledger && (
          <div className="space-y-3">
            {/* Wallet header */}
            <div className="flex gap-4">
              <div className="bg-white border px-4 py-2">
                <div className="text-xs text-gray-500">Balance</div>
                <div className="text-lg font-bold text-green-700">
                  ₹{parseFloat(ledger.wallet.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-white border px-4 py-2">
                <div className="text-xs text-gray-500">Bonus Balance</div>
                <div className="text-lg font-bold text-yellow-600">
                  ₹{parseFloat(ledger.wallet.bonus_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-white border px-4 py-2">
                <div className="text-xs text-gray-500">Total Transactions</div>
                <div className="text-lg font-bold text-gray-700">{ledger.total}</div>
              </div>
            </div>

            {/* Transactions */}
            <div className="bg-white border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">ID</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Balance After</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Reference</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Remark</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ledger.transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">{t.id}</td>
                      <td className={`px-4 py-2 font-medium capitalize ${TYPE_COLORS[t.type] || ''}`}>{t.type}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${parseFloat(t.amount) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {parseFloat(t.amount) >= 0 ? '+' : ''}₹{parseFloat(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">
                        ₹{parseFloat(t.balance_after).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{t.reference_id || '-'}</td>
                      <td className="px-4 py-2 text-xs">{t.remark || '-'}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">
                        {new Date(t.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
