export function getWalletTransactionLinks(transaction) {
  const links = [];
  const referenceType = String(transaction?.reference_type || '');
  const referenceId = String(transaction?.reference_id || '');

  if (transaction?.user_id) {
    links.push({ label: 'User', to: `/users/${transaction.user_id}` });
  }

  if (transaction?.moderator_id) {
    links.push({ label: 'Moderator', to: `/moderators/${transaction.moderator_id}` });
  }

  if (referenceType === 'deposit') {
    const match = referenceId.match(/^deposit_(\d+)$/);
    if (match) links.push({ label: 'Deposit', to: `/deposits?search=${encodeURIComponent(match[1])}` });
  }

  if (referenceType === 'withdraw') {
    const match = referenceId.match(/^withdraw(?:_refund)?_(\d+)$/);
    if (match) links.push({ label: 'Withdrawal', to: `/withdrawals?search=${encodeURIComponent(match[1])}` });
  }

  if (referenceType === 'bet' || referenceType === 'bet_bonus' || referenceType === 'bet_reversal') {
    const match = referenceType === 'bet'
      ? referenceId.match(/^bet_(\d+)$/)
      : referenceType === 'bet_bonus'
        ? referenceId.match(/^bet_bonus_(\d+)$/)
        : referenceId.match(/^bet_reversal_(\d+)_/);
    if (match) links.push({ label: 'Bet', to: `/bets?search=${encodeURIComponent(match[1])}` });
  }

  return links;
}