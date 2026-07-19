import React from 'react'
import Link from 'next/link';
import { useTranslation } from '../lib/LanguageContext';
import { translations } from '../lib/translations';

const DepositWithdrawBtns = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-107.5 ">
      <div className="flex overflow-hidden border border-[#d6b774] bg-white shadow-[0_8px_20px_rgba(79,52,10,0.08)]">
        <Link href="/deposit" className="flex flex-1 items-center justify-center gap-2 bg-[#127a3b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f6932]">
          <img src="/images/bank-building.png" className="h-4 w-4 object-contain" alt="Deposit" /> <span className="text-white">{t(translations.depositWithdraw.deposit)}</span>
        </Link>
        <Link href="/withdraw" className="flex flex-1 items-center justify-center gap-2 bg-[#b91c1c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#991b1b]">
          <img src="/images/withdraw.png" className="h-4 w-4 object-contain" alt="Withdraw" /> <span className="text-white">{t(translations.depositWithdraw.withdraw)}</span>
        </Link>
      </div>
    </div>
  )
}

export default DepositWithdrawBtns
