'use client'
import React, { useState, useCallback, Suspense, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import Header from '../components/Header'
import { betAPI, gameAPI } from '../lib/api'
import { formatBetType } from '../lib/formatters'

function parseTimeString(timeValue) {
  const parts = String(timeValue || '').split(':').map(Number)
  return { hours: parts[0] || 0, minutes: parts[1] || 0 }
}

function resolveGameWindow(openTimeValue, closeTimeValue, referenceDate = new Date()) {
  const openParsed = parseTimeString(openTimeValue)
  const closeParsed = parseTimeString(closeTimeValue)
  const isOvernight = closeParsed.hours < openParsed.hours ||
    (closeParsed.hours === openParsed.hours && closeParsed.minutes < openParsed.minutes)

  const openTime = new Date(referenceDate)
  openTime.setHours(openParsed.hours, openParsed.minutes, 0, 0)

  const closeTime = new Date(referenceDate)
  closeTime.setHours(closeParsed.hours, closeParsed.minutes, 0, 0)

  if (isOvernight) {
    const todayOpenTime = new Date(openTime)
    const todayCloseTime = new Date(closeTime)

    if (referenceDate >= todayOpenTime) {
      closeTime.setDate(closeTime.getDate() + 1)
    } else if (referenceDate < todayCloseTime) {
      openTime.setDate(openTime.getDate() - 1)
    } else {
      closeTime.setDate(closeTime.getDate() + 1)
    }
  }

  return { openTime, closeTime }
}

function formatRemainingTime(totalMs) {
  if (totalMs <= 0) return '00:00'
  const seconds = Math.floor(totalMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const remSeconds = seconds % 60
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(remMinutes).padStart(2, '0')}:${String(remSeconds).padStart(2, '0')}`
  }
  return `${String(remMinutes).padStart(2, '0')}:${String(remSeconds).padStart(2, '0')}`
}

function GamePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameId = searchParams.get('id');
  const gameName = searchParams.get('name') || 'Game';

  const [activeTab, setActiveTab] = useState("tab-1");
  const [showPopup, setShowPopup] = useState(false);
  const [amount, setAmount] = useState("");
  const [activeSlot, setActiveSlot] = useState(null);
  const [savedAmounts, setSavedAmounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Haruf state
  const [harufAndar, setHarufAndar] = useState({});
  const [harufBahar, setHarufBahar] = useState({});
  const [harufPopup, setHarufPopup] = useState(false);
  const [harufSlot, setHarufSlot] = useState(null);
  const [harufType, setHarufType] = useState('andar');

  // Crossing state
  const [crossDigits, setCrossDigits] = useState('');
  const [crossAmount, setCrossAmount] = useState('');
  const [crossIncludeJodi, setCrossIncludeJodi] = useState(true); 
  const [crossCombos, setCrossCombos] = useState([]);
  const [gameInfo, setGameInfo] = useState(null)
  const [countdown, setCountdown] = useState('00:00')
  const [bettingClosed, setBettingClosed] = useState(false)
  const [serverOffsetMs, setServerOffsetMs] = useState(0)
  // Removed favorites state and related logic

  useEffect(() => {
    if (!gameId) return

    let cancelled = false

    const loadGameInfo = async () => {
      try {
        const response = await gameAPI.getInfo(gameId)
        if (cancelled) return
        setGameInfo(response.game || null)
        if (response.server_now) {
          setServerOffsetMs(new Date(response.server_now).getTime() - Date.now())
        }
      } catch {
        if (!cancelled) {
          setGameInfo(null)
        }
      }
    }

    loadGameInfo()

    return () => {
      cancelled = true
    }
  }, [gameId])

  // Removed favorites effect

  useEffect(() => {
    if (!gameInfo?.open_time || !gameInfo?.close_time) {
      setCountdown('00:00')
      setBettingClosed(false)
      return
    }

    const tick = () => {
      const serverNow = new Date(Date.now() + serverOffsetMs)
      const { openTime, closeTime } = resolveGameWindow(gameInfo.open_time, gameInfo.close_time, serverNow)

      if (serverNow < openTime) {
        const untilOpen = openTime.getTime() - serverNow.getTime()
        setCountdown(`Opens in ${formatRemainingTime(untilOpen)}`)
        setBettingClosed(true)
        return
      }

      const remainingMs = closeTime.getTime() - serverNow.getTime()
      setCountdown(formatRemainingTime(remainingMs))
      setBettingClosed(remainingMs <= 0)
    }

    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [gameInfo, serverOffsetMs])

  // Removed toggleFavorite function

  const jodiNumbers = Array.from({length: 100}, (_, i) => String(i).padStart(2, '0'));
  const harufDigits = ['0','1','2','3','4','5','6','7','8','9'];

  const handleNumericInput = (val, setter) => {
    const cleanVal = val.replace(/\D/g, '');
    setter(cleanVal);
  };

  // --- Jodi Logic ---
  const openPopup = (num) => {
    if (bettingClosed) return
    setActiveSlot(num);
    setAmount(savedAmounts[num] || "");
    setShowPopup(true);
  };

  const saveAmount = (e) => {
    e.preventDefault();
    if (!amount || parseInt(amount) <= 0) return;
    setSavedAmounts(prev => ({ ...prev, [activeSlot]: amount }));
    setShowPopup(false);
  };

  const removeCurrentJodi = () => {
    setSavedAmounts(prev => {
      const copy = {...prev};
      delete copy[activeSlot];
      return copy;
    });
    setShowPopup(false);
  };

  // --- Haruf Logic ---
  const openHarufPopup = (digit, type) => {
    if (bettingClosed) return
    setHarufSlot(digit);
    setHarufType(type);
    const existing = type === 'andar' ? harufAndar[digit] : harufBahar[digit];
    setAmount(existing || '');
    setHarufPopup(true);
  };

  const saveHaruf = (e) => {
    e.preventDefault();
    if (!amount || parseInt(amount) <= 0) return;
    if (harufType === 'andar') {
      setHarufAndar(prev => ({ ...prev, [harufSlot]: amount }));
    } else {
      setHarufBahar(prev => ({ ...prev, [harufSlot]: amount }));
    }
    setHarufPopup(false);
  };

  const removeCurrentHaruf = () => {
    if (harufType === 'andar') {
      setHarufAndar(prev => { const c = {...prev}; delete c[harufSlot]; return c; });
    } else {
      setHarufBahar(prev => { const c = {...prev}; delete c[harufSlot]; return c; });
    }
    setHarufPopup(false);
  };

  // --- Crossing Logic ---
  const generateCrossCombos = () => {
    if (bettingClosed) return
    const raw = crossDigits.replace(/\D/g, '').slice(0, 7); 
    const amt = parseInt(crossAmount);
    if (!raw || raw.length < 2 || !amt) return;

    const uniqueDigits = [...new Set(raw.split(''))];
    const combos = [];

    for (let i = 0; i < uniqueDigits.length; i++) {
      for (let j = 0; j < uniqueDigits.length; j++) {
        const d1 = uniqueDigits[i];
        const d2 = uniqueDigits[j];
        if (!crossIncludeJodi && d1 === d2) continue;
        combos.push({ number: d1 + d2, amount: amt });
      }
    }
    setCrossCombos(combos);
  };

  const getTotal = useCallback(() => {
    let total = 0;
    Object.values(savedAmounts).forEach(v => total += parseInt(v) || 0);
    Object.values(harufAndar).forEach(v => total += parseInt(v) || 0);
    Object.values(harufBahar).forEach(v => total += parseInt(v) || 0);
    crossCombos.forEach(c => total += parseInt(c.amount) || 0);
    return total;
  }, [savedAmounts, harufAndar, harufBahar, crossCombos]);

  const placeBet = async () => {
    if (!gameId) return;
    if (bettingClosed) {
      setError('Betting Closed');
      return;
    }
    setError('');
    setSuccess('');
    const totalAmount = getTotal();

    const groupedNumbers = {
      jodi: Object.entries(savedAmounts).map(([n, a]) => ({ number: n, amount: parseInt(a) })),
      haruf_andar: Object.entries(harufAndar).map(([n, a]) => ({ number: n, amount: parseInt(a) })),
      haruf_bahar: Object.entries(harufBahar).map(([n, a]) => ({ number: n, amount: parseInt(a) })),
      crossing: crossCombos.map((c) => ({ number: c.number, amount: parseInt(c.amount) })),
    };

    const requests = Object.entries(groupedNumbers)
      .filter(([, numbers]) => numbers.length > 0)
      .map(([type, numbers]) => ({ type, numbers }));

    if (requests.length === 0) {
      setError('Select at least one number before playing.');
      return;
    }

    setLoading(true);
    try {
      let lastBetId = null;
      for (const request of requests) {
        const response = await betAPI.place({
          game_id: parseInt(gameId),
          type: request.type,
          numbers: request.numbers,
        });
        lastBetId = response?.bet?.id || lastBetId;
      }

      const allNumbers = requests.flatMap((request) => request.numbers.map((item) => item.number));
      const numberLabel = allNumbers.length === 1 ? String(allNumbers[0]) : `${allNumbers.length} Numbers`;
      const betTypeLabel = requests.length === 1 ? formatBetType(requests[0].type) : 'Multiple Bets';
      const txId = lastBetId ? `TXN_BET_${lastBetId}_${Date.now()}` : `TXN_BET_${Date.now()}`;

      setSavedAmounts({}); setHarufAndar({}); setHarufBahar({}); setCrossCombos([]);
      setCrossDigits('');
      setCrossAmount('');

      const params = new URLSearchParams({
        type: 'bet',
        market: decodeURIComponent(gameName),
        betType: betTypeLabel,
        number: numberLabel,
        amount: String(totalAmount),
        tx: txId,
        primary: `/game-page?id=${gameId}&name=${encodeURIComponent(gameName)}`,
        secondary: '/my-bets',
      });
      router.push(`/success?${params.toString()}`);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const inputClass = 'w-full border-2 border-[#e0e0e0] bg-white px-4 py-3 text-center text-xl font-semibold text-[#1a1a1a] outline-none transition focus:border-[#b88422]';
  const primaryButtonClass = 'w-full bg-black px-4 py-3 text-base font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60';
  const tabButtonClass = (isActive) => `px-4 py-2 text-sm font-black uppercase tracking-[0.14em] transition ${isActive ? 'bg-black text-[#ffd26a] shadow-[0_10px_20px_rgba(0,0,0,0.18)]' : 'text-[#6b7280]'}`;
  const cardBoxClass = (isActive) => `cursor-pointer border px-2 py-3 text-center transition ${isActive ? 'border-[#b88422] bg-[#fff5d9] shadow-[0_8px_18px_rgba(184,132,34,0.18)]' : 'border-[#ddd] bg-white hover:border-[#d5b163]'}`;

  return (
    <div className="relative mx-auto w-full max-w-107.5 bg-[#f6f7fa] pb-28">
      <Header />
      <section className="">
        <div className="bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-4 py-3 text-center shadow-[0_12px_24px_rgba(184,132,34,0.22)]">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#1f1500]"><b>{decodeURIComponent(gameName)}</b></h2>
        </div>
        {error && <div className="mt-2 text-center text-sm font-semibold text-[#b91c1c]">{error}</div>}
        {success && <div className="mt-2 text-center text-sm font-semibold text-[#15803d]">{success}</div>}

        <div className="mt-2 border border-[#eadcc0] bg-white p-3 text-center shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#6b5a3a]">Game closes in</div>
          <div className={`mt-1 text-xl font-black ${bettingClosed ? 'text-[#b91c1c]' : 'text-[#111]'}`}>
            {bettingClosed ? 'Betting Closed' : countdown}
          </div>
        </div>

        {/* <div className="mt-2 border border-[#eadcc0] bg-white p-3 shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#6b5a3a]">Last Results</div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {(gameInfo?.results || []).slice(0, 10).map((resultItem, index) => (
              <span key={`${resultItem.result_number}-${index}`} className="shrink-0 border border-[#ead2a1] bg-[#fff2cd] px-3 py-1 text-sm font-black text-[#2f2410]">
                {String(resultItem.result_number || '--').padStart(2, '0')}
              </span>
            ))}
            {(gameInfo?.results || []).length === 0 && <span className="text-xs text-[#6b5a3a]">No recent results.</span>}
          </div>
        </div> */}



        <div className="mt-4 overflow-hidden border border-[#eadcc0] bg-white shadow-[0_18px_34px_rgba(15,23,42,0.08)]">
          <div className="flex gap-2 border-b border-[#f1e7d3] bg-[#fff8e7] p-2">
            <button type="button" className={tabButtonClass(activeTab === 'tab-1')} onClick={() => setActiveTab('tab-1')}>Jodi</button>
            <button type="button" className={tabButtonClass(activeTab === 'tab-2')} onClick={() => setActiveTab('tab-2')}>Haruf</button>
            <button type="button" className={tabButtonClass(activeTab === 'tab-3')} onClick={() => setActiveTab('tab-3')}>Crossing</button>
          </div>

          <div className={activeTab === 'tab-1' ? 'block' : 'hidden'}>
            {/* Removed favorites UI */}
            <div className="grid grid-cols-5 gap-2 p-4">
                {jodiNumbers.map((num) => (
                  <div key={num} className={`${cardBoxClass(Boolean(savedAmounts[num]))} ${bettingClosed ? 'opacity-60 cursor-not-allowed' : ''}`} onClick={() => openPopup(num)}>
                    <div className="flex items-center justify-center gap-1">
                      <div className="text-sm font-semibold text-[#111]">{num}</div>
                    </div>
                    {savedAmounts[num] && <div className="mt-1 text-[10px] font-bold text-[#d62828]">₹{savedAmounts[num]}</div>}
                  </div>
                ))}
            </div>
          </div>

          <div className={activeTab === 'tab-2' ? 'block' : 'hidden'}>
            <div className="px-4 pt-1 text-sm font-black uppercase tracking-[0.14em] text-[#111]">Andar</div>
            <div className="grid grid-cols-5 gap-2 px-4 py-3">
                  {harufDigits.map(d => (
                    <div key={`a${d}`} className={cardBoxClass(Boolean(harufAndar[d]))} onClick={() => openHarufPopup(d, 'andar')}>
                      {d} {harufAndar[d] && <div className="mt-1 text-[10px] font-bold text-[#d62828]">₹{harufAndar[d]}</div>}
                    </div>
                  ))}
            </div>
            <div className="px-4 pt-1 text-sm font-black uppercase tracking-[0.14em] text-[#111]">Bahar</div>
            <div className="grid grid-cols-5 gap-2 px-4 py-3">
                  {harufDigits.map(d => (
                    <div key={`b${d}`} className={cardBoxClass(Boolean(harufBahar[d]))} onClick={() => openHarufPopup(d, 'bahar')}>
                      {d} {harufBahar[d] && <div className="mt-1 text-[10px] font-bold text-[#d62828]">₹{harufBahar[d]}</div>}
                    </div>
                  ))}
            </div>
          </div>

          <div className={activeTab === 'tab-3' ? 'block' : 'hidden'}>
            <div className="p-4">
                <input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="Enter Numbers" 
                  value={crossDigits} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 7);
                    setCrossDigits(val);
                  }} 
                  className={inputClass}
                />
                <input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="Amount" 
                  value={crossAmount} 
                  onChange={e => handleNumericInput(e.target.value, setCrossAmount)} 
                  className={`${inputClass} mt-3`}
        
                />
                
                <div className="mb-3 mt-3 flex items-center gap-2">
                  <input type="checkbox" id="cj" checked={crossIncludeJodi} onChange={() => setCrossIncludeJodi(!crossIncludeJodi)} />
                  <label htmlFor="cj" className="font-bold text-black">with jodi</label>
                </div>

                <button type="button" onClick={generateCrossCombos} className={primaryButtonClass} disabled={bettingClosed}>Generate Crossing</button>

                {crossCombos.length > 0 && (
                  <div className="mt-5 overflow-hidden bg-black">
                    <div className="flex justify-between bg-[#e63946] px-5 py-3 font-bold text-white">
                      <span>No.</span>
                      <span>Value</span>
                    </div>
                    <div className="max-h-87.5 overflow-y-auto">
                      {crossCombos.map((item, index) => (
                        <div key={index} className="flex justify-between border-b border-[#333] px-5 py-3 font-bold text-white">
                          <span>{item.number}</span>
                          <span>{item.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      </section>

      {/* RESTORED POPUP DESIGN (JODI) */}
      {showPopup && (
        <div className="fixed inset-0 z-99999 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={() => setShowPopup(false)}>
          <div className="w-full max-w-[320px] bg-white p-6 shadow-[0_20px_40px_rgba(0,0,0,0.2)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-center">
               <span className="text-[14px] uppercase tracking-[0.12em] text-[#666]">Set Price for</span>
               <h2 className="mt-1 text-[28px] font-bold text-black">Number {activeSlot}</h2>
            </div>
            <form onSubmit={saveAmount}>
              <input autoFocus type="text" inputMode="numeric" value={amount} onChange={(e) => handleNumericInput(e.target.value, setAmount)} placeholder="0" className={inputClass} />
              <button type="submit" className={`${primaryButtonClass} mt-3`}>SAVE </button>
            </form>
            <div className="mt-3 flex gap-3">
                <button onClick={removeCurrentJodi} className="flex-1 border border-[#ff4d4d] bg-white px-4 py-2.5 font-semibold text-[#ff4d4d]">Remove</button>
                <button onClick={() => setShowPopup(false)} className="flex-1 bg-[#f0f0f0] px-4 py-2.5 font-semibold text-[#666]">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* RESTORED POPUP DESIGN (HARUF) */}
      {harufPopup && (
        <div className="fixed inset-0 z-99999 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={() => setHarufPopup(false)}>
          <div className="w-full max-w-[320px] bg-white p-6 shadow-[0_20px_40px_rgba(0,0,0,0.2)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-center">
               <span className="text-[14px] uppercase tracking-[0.12em] text-[#666]">{harufType} Side</span>
               <h2 className="mt-1 text-[28px] font-bold text-black">Digit {harufSlot}</h2>
            </div>
            <form onSubmit={saveHaruf}>
              <input autoFocus type="text" inputMode="numeric" value={amount} onChange={(e) => handleNumericInput(e.target.value, setAmount)} placeholder="0" className={inputClass} />
              <button type="submit" className={`${primaryButtonClass} mt-3`}>SAVE </button>
            </form>
            <div className="mt-3 flex gap-3">
                <button onClick={removeCurrentHaruf} className="flex-1 border border-[#ff4d4d] bg-white px-4 py-2.5 font-semibold text-[#ff4d4d]">Remove</button>
                <button onClick={() => setHarufPopup(false)} className="flex-1 bg-[#f0f0f0] px-4 py-2.5 font-semibold text-[#666]">Close</button>
            </div>
          </div>
        </div>
      )}

        <div className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-107.5 -translate-x-1/2 items-center justify-between border-t border-[#eee] bg-white  shadow-[0_-10px_24px_rgba(15,23,42,0.08)]">
          <div className="bg-black px-5 py-3 font-bold text-white">Total: ₹{getTotal()}</div>
          <button onClick={placeBet} disabled={loading || bettingClosed} className="bg-black px-7 py-3 font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">{bettingClosed ? 'Betting Closed' : (loading ? '...' : 'PLAY')}</button>
      </div>
    </div>
  )
}

const GamePage = () => (
  <Suspense fallback={<div>Loading...</div>}>
    <GamePageInner />
  </Suspense>
)

export default GamePage;