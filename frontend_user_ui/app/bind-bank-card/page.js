'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { userAPI } from '../lib/api'

const BindBankCard = () => {
  const router = useRouter();
  const [accountNo, setAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [bankName, setBankName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!accountNo || !ifsc || !payeeName || !bankName) { setError('All fields are required'); return; }

    setLoading(true);
    try {
      await userAPI.addBankAccount({
        account_number: accountNo,
        ifsc,
        account_holder: payeeName,
        bank_name: bankName,
      });
      setSuccess('Bank account added successfully!');
      setTimeout(() => router.push('/bank-accounts'), 1500);
    } catch (err) {
      setError(err.message || 'Failed to add bank account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="sticky top-0 z-40 mx-auto flex w-full max-w-[430px] items-center bg-white px-4 py-3 shadow-sm">
      <a href="/withdraw" className="mr-3 inline-flex">
        <img alt="back" src="/images/back-btn.png" className="h-5 w-5" />
      </a>
      <h3 className="flex-1 text-center text-sm font-semibold text-[#111]">Bind bank card</h3>
      </header>

      <div className='bg-white px-4 pb-6 pt-4'>
        <section className="mx-auto w-full max-w-[430px] border border-[#d6b774] bg-white px-4 py-5 shadow-[0_12px_28px_rgba(79,52,10,0.08)]">

          {error && <div className="my-2 bg-[#ffe0e0] px-2 py-2 text-xs text-[#c00]">{error}</div>}
          {success && <div className="my-2 bg-[#e0ffe0] px-2 py-2 text-xs text-[#060]">{success}</div>}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#111]" htmlFor="account-no">AccNo.</label>
              <input className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm" id="account-no" placeholder="Please enter Account No." type="text" value={accountNo} onChange={e => setAccountNo(e.target.value)} />
                    </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#111]" htmlFor="ifsc">IFSC</label>
              <input className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm" id="ifsc" placeholder="Please enter IFSC" maxLength={11} type="text" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} />
                    </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#111]" htmlFor="payee-name">AccName.</label>
              <input className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm" id="payee-name" placeholder="Please enter Payee Name." type="text" value={payeeName} onChange={e => setPayeeName(e.target.value)} />
                    </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#111]" htmlFor="bank-name">Bank Name</label>
              <input className="h-11 w-full border border-[#d8d1c4] bg-[#faf7f0] px-4 text-sm" id="bank-name" placeholder="Please enter Bank Name (e.g., HDFC, SBI)" type="text" value={bankName} onChange={e => setBankName(e.target.value)} />
                    </div>
            <button className="h-11 w-full bg-[#111] text-sm font-semibold text-white" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
                </form>
            <p className="mt-4 text-sm leading-relaxed text-[#6d6659]">
                    Please check the information carefully before submission. If transfer issues
                    occur due to incorrect information, it is the user's responsibility.
                    </p>

            </section>
        </div>

    </div>
  )
}

export default BindBankCard
