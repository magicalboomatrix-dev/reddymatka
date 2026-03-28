import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/ui';

const SETTING_LABELS = {
  max_bet_full: 'Max Bet (>90 Min)',
  max_bet_30min: 'Max Bet (30–90 Min)',
  max_bet_last_30: 'Max Bet (<30 Min)',
  min_bet: 'Minimum Bet Amount',
};

export default function Settings() {
  const [settings, setSettings] = useState([]);
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
      setSettings(Array.isArray(settingsRes.data.settings) ? settingsRes.data.settings : []);
      setFlaggedAccounts(Array.isArray(flaggedRes.data.accounts) ? flaggedRes.data.accounts : []);
      setPayoutRates(Array.isArray(ratesRes.data.rates) ? ratesRes.data.rates : []);
      setBonusRates(Array.isArray(bonusRes.data.rates) ? bonusRes.data.rates : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateValue = (key, value) => {
    setSettings(prev => prev.map(s => s.setting_key === key ? { ...s, setting_value: value } : s));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings', {
        settings: settings.map(s => ({ key: s.setting_key, value: s.setting_value }))
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

  // Group settings by category
  const betSettings = settings.filter(s => s.setting_key.startsWith('max_bet_') || s.setting_key === 'min_bet');
  const depositSettings = settings.filter(s => s.setting_key.startsWith('min_deposit') || s.setting_key.startsWith('min_withdraw') || s.setting_key === 'max_withdraw_time_minutes');
  const bonusSettings = settings.filter(s => s.setting_key.includes('bonus') || s.setting_key.includes('referral'));

  const RATE_LABELS = { jodi: 'Jodi', haruf_andar: 'Haruf Andar', haruf_bahar: 'Haruf Bahar', crossing: 'Crossing' };
  const BONUS_LABELS = { jodi: 'Jodi Bonus', haruf_andar: 'Haruf Andar Bonus', haruf_bahar: 'Haruf Bahar Bonus', crossing: 'Crossing Bonus' };

  const renderGroup = (title, items) => (
    <div className="bg-white border p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="space-y-3">
        {items.map((s) => (
          <div key={s.setting_key} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{SETTING_LABELS[s.setting_key] || s.setting_key.replace(/_/g, ' ').toUpperCase()}</p>
              {s.description && <p className="text-xs text-gray-400">{s.description}</p>}
            </div>
            <input
              type="text"
              value={s.setting_value}
              onChange={(e) => updateValue(s.setting_key, e.target.value)}
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
      {payoutRates.length > 0 && (
        <div className="bg-white border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Payout Multipliers</h3>
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
        </div>
      )}
      {/* Bonus Multipliers from game_bonus_rates table */}
      {bonusRates.length > 0 && (
        <div className="bg-white border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Bonus Multipliers</h3>
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
        </div>
      )}
      {renderGroup('Betting Limits', betSettings)}
      {renderGroup('Deposit & Withdrawal', depositSettings)}
      {renderGroup('Bonus & Referral', bonusSettings)}

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
