import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

const DEFAULT_WITHDRAWAL_WINDOWS = [
  { start: '09:00', end: '11:00' },
  { start: '16:45', end: '17:20' },
  { start: '22:00', end: '22:30' },
];

// All known setting keys used by the backend, grouped by category
const EXPECTED_SETTINGS = {
  'Betting Limits': [
    { key: 'max_bet_full', label: 'Max Bet (>90 Min)', description: 'Max bet amount when 90+ min before close', default: '100000' },
    { key: 'max_bet_30min', label: 'Max Bet (30–90 Min)', description: 'Max bet amount 30–90 min before close', default: '5000' },
    { key: 'max_bet_last_30', label: 'Max Bet (15–30 Min)', description: 'Max bet amount 15–30 min before close', default: '1000' },
    { key: 'max_bet_last_15', label: 'Max Bet (0–15 Min)', description: 'Max bet amount in last 15 min before close', default: '500' },
    { key: 'min_bet', label: 'Minimum Bet Amount', description: 'Minimum bet amount', default: '10' },
  ],
  'Deposit & Withdrawal': [
    { key: 'min_deposit', label: 'Minimum Deposit', description: 'Minimum deposit amount', default: '100' },
    { key: 'max_deposit', label: 'Maximum Deposit', description: 'Maximum deposit amount', default: '50000' },
    { key: 'min_withdraw', label: 'Minimum Withdrawal', description: 'Minimum withdrawal amount', default: '200' },
    { key: 'max_withdraw_time_minutes', label: 'Max Withdraw Time (Minutes)', description: 'Maximum withdrawal processing time', default: '45' },
  ],
  'Bonus & Referral': [
    { key: 'first_deposit_bonus_percent', label: 'First Deposit Bonus %', description: 'First deposit bonus percentage', default: '10' },
    { key: 'referral_bonus', label: 'Referral Bonus', description: 'Referral bonus amount', default: '50' },
    { key: 'bonus_slab_2500', label: 'Bonus Slab ₹2,500', description: 'Bonus for deposit of ₹2,500', default: '100' },
    { key: 'bonus_slab_5000', label: 'Bonus Slab ₹5,000', description: 'Bonus for deposit of ₹5,000', default: '250' },
    { key: 'bonus_slab_10000', label: 'Bonus Slab ₹10,000', description: 'Bonus for deposit of ₹10,000', default: '500' },
  ],
};

const RATE_LABELS = { jodi: 'Jodi', haruf_andar: 'Haruf Andar', haruf_bahar: 'Haruf Bahar', crossing: 'Crossing' };
const BONUS_LABELS = { jodi: 'Jodi Bonus', haruf_andar: 'Haruf Andar Bonus', haruf_bahar: 'Haruf Bahar Bonus', crossing: 'Crossing Bonus' };

// Merge DB settings with expected keys � always show all expected fields
function mergeSettings(dbSettings) {
  const dbMap = {};
  for (const s of dbSettings) {
    dbMap[s.setting_key] = s.setting_value;
  }
  const merged = {};
  for (const [group, keys] of Object.entries(EXPECTED_SETTINGS)) {
    merged[group] = keys.map(k => ({
      setting_key: k.key,
      setting_value: dbMap[k.key] !== undefined ? dbMap[k.key] : k.default,
      label: k.label,
      description: k.description,
      isNew: dbMap[k.key] === undefined,
    }));
  }
  return merged;
}

export default function Settings() {
  const [settingsGroups, setSettingsGroups] = useState({});
  const [payoutRates, setPayoutRates] = useState([]);
  const [bonusRates, setBonusRates] = useState([]);
  const [withdrawalWindows, setWithdrawalWindows] = useState(DEFAULT_WITHDRAWAL_WINDOWS);
  const [savingWindows, setSavingWindows] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [savingBonus, setSavingBonus] = useState(false);
  const [flaggedAccounts, setFlaggedAccounts] = useState([]);
  const { toasts, success, error: toastError, dismiss } = useToast();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [settingsRes, flaggedRes, ratesRes, bonusRes] = await Promise.all([
        api.get('/admin/settings'),
        api.get('/admin/flagged-accounts'),
        api.get('/admin/payout-rates').catch(() => ({ data: { rates: [] } })),
        api.get('/admin/bonus-rates').catch(() => ({ data: { rates: [] } })),
      ]);
      const dbSettings = Array.isArray(settingsRes.data.settings) ? settingsRes.data.settings : [];
      setSettingsGroups(mergeSettings(dbSettings));

      // Load withdrawal time windows
      const windowsSetting = dbSettings.find((s) => s.setting_key === 'withdrawal_time_windows');
      if (windowsSetting) {
        try {
          const parsed = JSON.parse(windowsSetting.setting_value);
          setWithdrawalWindows(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_WITHDRAWAL_WINDOWS);
        } catch (_) {
          setWithdrawalWindows(DEFAULT_WITHDRAWAL_WINDOWS);
        }
      }

      setFlaggedAccounts(Array.isArray(flaggedRes.data.accounts) ? flaggedRes.data.accounts : []);
      setPayoutRates(Array.isArray(ratesRes.data.rates) ? ratesRes.data.rates : []);
      setBonusRates(Array.isArray(bonusRes.data.rates) ? bonusRes.data.rates : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateValue = (group, key, value) => {
    setSettingsGroups(prev => ({
      ...prev,
      [group]: prev[group].map(s => s.setting_key === key ? { ...s, setting_value: value } : s),
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const allSettings = Object.values(settingsGroups).flat();
      await api.put('/admin/settings', {
        settings: allSettings.map(s => ({
          key: s.setting_key,
          value: s.setting_value,
          description: s.description || null,
        }))
      });
      setSettingsGroups(prev => {
        const updated = {};
        for (const [group, items] of Object.entries(prev)) {
          updated[group] = items.map(s => ({ ...s, isNew: false }));
        }
        return updated;
      });
      success('Settings saved!');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const updateRate = (gameType, value) => {
    setPayoutRates(prev => prev.map(r => r.game_type === gameType ? { ...r, multiplier: value } : r));
  };

  const savePayoutRates = async () => {
    setSavingRates(true);
    try {
      await api.put('/admin/payout-rates', {
        rates: payoutRates.map(r => ({ game_type: r.game_type, multiplier: r.multiplier }))
      });
      success('Payout rates saved!');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    } finally {
      setSavingRates(false);
    }
  };

  const updateBonus = (gameType, value) => {
    setBonusRates(prev => prev.map(r => r.game_type === gameType ? { ...r, bonus_multiplier: value } : r));
  };

  const saveBonusRates = async () => {
    setSavingBonus(true);
    try {
      await api.put('/admin/bonus-rates', {
        rates: bonusRates.map(r => ({ game_type: r.game_type, bonus_multiplier: r.bonus_multiplier }))
      });
      success('Bonus rates saved!');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed');
    } finally {
      setSavingBonus(false);
    }
  };

  const addWithdrawalWindow = () => {
    setWithdrawalWindows((prev) => [...prev, { start: '00:00', end: '00:00' }]);
  };

  const removeWithdrawalWindow = (index) => {
    setWithdrawalWindows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateWithdrawalWindow = (index, field, value) => {
    setWithdrawalWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, [field]: value } : w))
    );
  };

  const saveWithdrawalWindows = async () => {
    setSavingWindows(true);
    try {
      await api.put('/admin/settings', {
        settings: [
          {
            key: 'withdrawal_time_windows',
            value: JSON.stringify(withdrawalWindows),
            description: 'Allowed withdrawal time windows (IST), stored as JSON array',
          },
        ],
      });
      success('Withdrawal time windows saved!');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save withdrawal windows');
    } finally {
      setSavingWindows(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">Loading...</div>;

  const renderGroup = (title, items) => (
    <div className="bg-white border p-3 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.setting_key} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 leading-tight">
                {s.label}
                {s.isNew && <span className="ml-1 text-[9px] px-1 py-0.5 bg-yellow-100 text-yellow-700 font-semibold rounded">NEW</span>}
              </p>
              {s.description && <p className="text-[10px] text-gray-400 leading-tight">{s.description}</p>}
            </div>
            <input
              type="text"
              value={s.setting_value}
              onChange={(e) => updateValue(title, s.setting_key, e.target.value)}
              className="w-20 sm:w-32 px-2 py-1.5 border text-xs focus:ring-2 focus:ring-primary-500 outline-none flex-shrink-0"
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Payout Rates from game_payout_rates table */}
      <div className="bg-white border p-3 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Payout Multipliers</h3>
        {payoutRates.length > 0 ? (
          <>
            <div className="space-y-2">
              {payoutRates.map((r) => (
                <div key={r.game_type} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">{RATE_LABELS[r.game_type] || r.game_type}</p>
                    <p className="text-[10px] text-gray-400">Multiplier applied to winning bets</p>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={r.multiplier}
                    onChange={(e) => updateRate(r.game_type, e.target.value)}
                    className="w-20 sm:w-32 px-2 py-1.5 border text-xs focus:ring-2 focus:ring-primary-500 outline-none flex-shrink-0"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={savePayoutRates} disabled={savingRates}
                className="px-4 py-1.5 bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50 text-xs">
                {savingRates ? 'Saving...' : 'Save Payout Rates'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">No payout rates configured. Insert rows into <code>game_payout_rates</code> table.</p>
        )}
      </div>

      {/* Bonus Multipliers from game_bonus_rates table */}
      <div className="bg-white border p-3 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Bonus Multipliers</h3>
        {bonusRates.length > 0 ? (
          <>
            <p className="text-xs text-gray-400 mb-3">Win = bet × payout × bonus. Set to 1.00 for standard payout (no bonus). Must be ≥ 1.</p>
            <div className="space-y-2">
              {bonusRates.map((r) => (
                <div key={r.game_type} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">{BONUS_LABELS[r.game_type] || r.game_type}</p>
                    <p className="text-[10px] text-gray-400">Extra multiplier on top of payout rate</p>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={r.bonus_multiplier}
                    onChange={(e) => updateBonus(r.game_type, e.target.value)}
                    className="w-20 sm:w-32 px-2 py-1.5 border text-xs focus:ring-2 focus:ring-primary-500 outline-none flex-shrink-0"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={saveBonusRates} disabled={savingBonus}
                className="px-4 py-1.5 bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50 text-xs">
                {savingBonus ? 'Saving...' : 'Save Bonus Rates'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">No bonus rates configured. Insert rows into <code>game_bonus_rates</code> table.</p>
        )}
      </div>

      {/* Settings groups from settings table */}
      {Object.entries(settingsGroups).map(([group, items]) => (
        <div key={group}>{renderGroup(group, items)}</div>
      ))}

      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={saving}
          className="px-5 py-2 bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50 text-sm">
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>

      {/* Withdrawal Time Windows */}
      <div className="bg-white border p-3 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Withdrawal Time Windows</h3>
        <p className="text-[10px] text-gray-400 mb-3">
          Users can only request withdrawals during these time windows (IST). Outside these hours withdrawals will be blocked.
        </p>
        <div className="space-y-2">
          {withdrawalWindows.map((w, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 w-4 flex-shrink-0">{index + 1}.</span>
              <input
                type="time"
                value={w.start}
                onChange={(e) => updateWithdrawalWindow(index, 'start', e.target.value)}
                className="px-1.5 py-1.5 border text-xs focus:ring-2 focus:ring-primary-500 outline-none flex-1 min-w-0"
              />
              <span className="text-xs text-gray-500 flex-shrink-0">To</span>
              <input
                type="time"
                value={w.end}
                onChange={(e) => updateWithdrawalWindow(index, 'end', e.target.value)}
                className="px-1.5 py-1.5 border text-xs focus:ring-2 focus:ring-primary-500 outline-none flex-1 min-w-0"
              />
              <button
                onClick={() => removeWithdrawalWindow(index)}
                className="px-2 py-1.5 border border-red-300 text-red-600 text-[10px] hover:bg-red-50 flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {withdrawalWindows.length === 0 && (
          <p className="text-xs text-amber-600 mt-2">⚠ No time windows set — withdrawals will not be restricted by time.</p>
        )}
        <div className="flex justify-between items-center mt-3">
          <button
            onClick={addWithdrawalWindow}
            className="px-3 py-1.5 border border-primary-600 text-primary-600 text-xs hover:bg-primary-50"
          >
            + Add Window
          </button>
          <button
            onClick={saveWithdrawalWindows}
            disabled={savingWindows}
            className="px-4 py-1.5 bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50 text-xs"
          >
            {savingWindows ? 'Saving...' : 'Save Withdrawal Windows'}
          </button>
        </div>
      </div>

      {/* Flagged Accounts */}
      {flaggedAccounts.length > 0 && (
        <div className="bg-white border">
          <div className="p-5 border-b bg-red-50">
            <h3 className="text-lg font-semibold text-red-700">? Flagged Bank Accounts</h3>
            <p className="text-sm text-red-600">These accounts are used by multiple users</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Bank</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {flaggedAccounts.map((a) => (
                  <tr key={a.id} className="hover:bg-red-50">
                    <td className="px-4 py-3 font-medium">{a.user_name}</td>
                    <td className="px-4 py-3">{a.user_phone}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.account_number}</td>
                    <td className="px-4 py-3">{a.bank_name}</td>
                    <td className="px-4 py-3 text-xs text-red-600">{a.flag_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

