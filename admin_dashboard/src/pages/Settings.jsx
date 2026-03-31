import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

// All known setting keys used by the backend, grouped by category
const EXPECTED_SETTINGS = {
  'Betting Limits': [
    { key: 'max_bet_full', label: 'Max Bet (>90 Min)', description: 'Max bet amount when 60+ min before close', default: '100000' },
    { key: 'max_bet_30min', label: 'Max Bet (30–90 Min)', description: 'Max bet amount 30-60 min before close', default: '5000' },
    { key: 'max_bet_last_30', label: 'Max Bet (<30 Min)', description: 'Max bet amount 15-30 min before close', default: '1000' },
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

// Merge DB settings with expected keys — always show all expected fields
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

  if (loading) return <div className="text-center py-10 text-gray-500">Loading...</div>;

  const renderGroup = (title, items) => (
    <div className="bg-white border p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="space-y-3">
        {items.map((s) => (
          <div key={s.setting_key} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">
                {s.label}
                {s.isNew && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 font-semibold rounded">NEW</span>}
              </p>
              {s.description && <p className="text-xs text-gray-400">{s.description}</p>}
            </div>
            <input
              type="text"
              value={s.setting_value}
              onChange={(e) => updateValue(title, s.setting_key, e.target.value)}
              className="w-full sm:w-40 px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Payout Rates from game_payout_rates table */}
      <div className="bg-white border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Payout Multipliers</h3>
        {payoutRates.length > 0 ? (
          <>
            <div className="space-y-3">
              {payoutRates.map((r) => (
                <div key={r.game_type} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">{RATE_LABELS[r.game_type] || r.game_type}</p>
                    <p className="text-xs text-gray-400">Multiplier applied to winning bets</p>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={r.multiplier}
                    onChange={(e) => updateRate(r.game_type, e.target.value)}
                    className="w-full sm:w-40 px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={savePayoutRates} disabled={savingRates}
                className="px-6 py-2 bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50 text-sm">
                {savingRates ? 'Saving...' : 'Save Payout Rates'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">No payout rates configured. Insert rows into <code>game_payout_rates</code> table.</p>
        )}
      </div>

      {/* Bonus Multipliers from game_bonus_rates table */}
      <div className="bg-white border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Bonus Multipliers</h3>
        {bonusRates.length > 0 ? (
          <>
            <p className="text-xs text-gray-400 mb-3">Win = bet × payout × bonus. Set to 1.00 to disable bonus.</p>
            <div className="space-y-3">
              {bonusRates.map((r) => (
                <div key={r.game_type} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">{BONUS_LABELS[r.game_type] || r.game_type}</p>
                    <p className="text-xs text-gray-400">Extra multiplier on top of payout rate</p>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.bonus_multiplier}
                    onChange={(e) => updateBonus(r.game_type, e.target.value)}
                    className="w-full sm:w-40 px-3 py-2 border text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={saveBonusRates} disabled={savingBonus}
                className="px-6 py-2 bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50 text-sm">
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
          className="px-8 py-3 bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50">
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>

      {/* Flagged Accounts */}
      {flaggedAccounts.length > 0 && (
        <div className="bg-white border">
          <div className="p-5 border-b bg-red-50">
            <h3 className="text-lg font-semibold text-red-700">⚠ Flagged Bank Accounts</h3>
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
