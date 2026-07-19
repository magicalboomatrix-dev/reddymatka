'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight, Play, BookOpen, Languages } from 'lucide-react';

import { buildUploadUrl } from '../lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// Static how-to-play steps shown when no description is provided by admin
const STATIC_STEPS = {
  en: [
    { step: 1, title: 'Register & Login', desc: 'Create your account using your mobile number. Verify with OTP and set your MPIN for secure access.' },
    { step: 2, title: 'Add Money to Wallet', desc: 'Go to Deposit section. Enter amount and pay via UPI. Your wallet is credited instantly after verification.' },
    { step: 3, title: 'Choose a Game', desc: 'Browse available games from the Home screen. Select any open game to see its betting options.' },
    { step: 4, title: 'Place Your Bet', desc: 'Select bet type — Jodi, Haruf Andar, Haruf Bahar, or Crossing. Enter your number and amount, then confirm.' },
    { step: 5, title: 'Wait for Results', desc: 'Results are declared at the scheduled close time. View live results on the Chart page.' },
    { step: 6, title: 'Winnings Credited', desc: 'If your number wins, the amount is automatically credited to your wallet. Withdraw anytime.' },
  ],
  hi: [
    { step: 1, title: 'रजिस्टर और लॉगिन करें', desc: 'अपने मोबाइल नंबर से अकाउंट बनाएं। OTP से वेरीफाई करें और सुरक्षित एक्सेस के लिए MPIN सेट करें।' },
    { step: 2, title: 'वॉलेट में पैसे डालें', desc: 'डिपॉज़िट सेक्शन में जाएं। राशि दर्ज करें और UPI से भुगतान करें। वेरीफिकेशन के बाद वॉलेट तुरंत क्रेडिट होता है।' },
    { step: 3, title: 'गेम चुनें', desc: 'होम स्क्रीन से उपलब्ध गेम्स देखें। बेटिंग विकल्प देखने के लिए कोई भी खुला गेम चुनें।' },
    { step: 4, title: 'बेट लगाएं', desc: 'बेट का प्रकार चुनें — जोड़ी, हरुफ अंदर, हरुफ बाहर, या क्रॉसिंग। अपना नंबर और राशि दर्ज करें, फिर कन्फर्म करें।' },
    { step: 5, title: 'रिज़ल्ट का इंतजार करें', desc: 'निर्धारित बंद समय पर रिज़ल्ट घोषित होता है। चार्ट पेज पर लाइव रिज़ल्ट देखें।' },
    { step: 6, title: 'जीत क्रेडिट होगी', desc: 'अगर आपका नंबर जीतता है, तो राशि स्वतः आपके वॉलेट में क्रेडिट हो जाती है। कभी भी निकालें।' },
  ],
};

const BET_TYPES = [
  {
    name_en: 'Jodi',
    name_hi: 'जोड़ी',
    icon: '🎯',
    color: 'from-[#b88422] to-[#ffd26a]',
    desc_en: 'Pick any 2-digit number from 00–99. Win big with high multiplier.',
    desc_hi: '00–99 में से कोई भी 2 अंक का नंबर चुनें। उच्च गुणक के साथ बड़ा जीतें।',
  },
  {
    name_en: 'Haruf Andar',
    name_hi: 'हरुफ अंदर',
    icon: '⬅️',
    color: 'from-[#1a7f3c] to-[#4ade80]',
    desc_en: 'Predict the last digit of the result. Lower risk bet.',
    desc_hi: 'परिणाम के अंतिम अंक का अनुमान लगाएं। कम जोखिम वाली बेट।',
  },
  {
    name_en: 'Haruf Bahar',
    name_hi: 'हरुफ बाहर',
    icon: '➡️',
    color: 'from-[#1e40af] to-[#60a5fa]',
    desc_en: 'Predict the first digit of the result. Lower risk bet.',
    desc_hi: 'परिणाम के पहले अंक का अनुमान लगाएं। कम जोखिम वाली बेट।',
  },
  {
    name_en: 'Crossing',
    name_hi: 'क्रॉसिंग',
    icon: '✖️',
    color: 'from-[#7c3aed] to-[#a78bfa]',
    desc_en: 'Enter multiple digits — system creates all combinations automatically.',
    desc_hi: 'कई अंक दर्ज करें — सिस्टम स्वचालित रूप से सभी संयोजन बनाता है।',
  },
];

function VideoCard({ video, lang }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setPlaying(true);
    }
  };

  const description = lang === 'hi'
    ? (video.description_hi || video.description_en || '')
    : (video.description_en || video.description_hi || '');

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md border border-[#ebe3d2]">
      <div className="relative bg-black aspect-video">
        <video
          ref={videoRef}
          src={buildUploadUrl(video.video_path)}
          className="w-full h-full object-contain"
          controls={playing}
          playsInline
          preload="metadata"
        />
        {!playing && (
          <button
            onClick={handlePlay}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#b88422] shadow-lg">
              <Play size={28} fill="white" className="text-white ml-1" />
            </div>
            <p className="mt-3 text-white text-sm font-semibold drop-shadow">
              {lang === 'hi' ? 'वीडियो देखें' : 'Watch Video'}
            </p>
          </button>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-[#111] text-base leading-snug">{video.title}</h3>
        {description && (
          <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">{description}</p>
        )}
      </div>
    </div>
  );
}

export default function HowToPlayPage() {
  const [lang, setLang] = useState('en');
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/how-to-play`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setVideos(Array.isArray(d.videos) ? d.videos : []))
      .catch(() => {})
      .finally(() => setLoadingVideos(false));
  }, []);

  const steps = lang === 'hi' ? STATIC_STEPS.hi : STATIC_STEPS.en;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f6f7fa] pb-10">
      {/* Header */}
      <header className="relative flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <Link href="/profile">
          <img src="/images/back-btn.png" alt="Back" className="h-5 w-5" />
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-black text-[#333]">
          {lang === 'hi' ? 'कैसे खेलें' : 'How To Play'}
        </h1>
        <div className="h-5 w-5" />
      </header>

      {/* Language Toggle */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#ebe3d2] px-4 py-2 flex items-center gap-2">
        <Languages size={16} className="text-[#b88422] shrink-0" />
        <div className="flex rounded-full overflow-hidden border border-[#e0d6c2] bg-[#f7f6f3] p-0.5 gap-0.5">
          <button
            onClick={() => setLang('en')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${lang === 'en' ? 'bg-[#b88422] text-white shadow' : 'text-[#777]'}`}
          >
            English
          </button>
          <button
            onClick={() => setLang('hi')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${lang === 'hi' ? 'bg-[#b88422] text-white shadow' : 'text-[#777]'}`}
          >
            हिन्दी
          </button>
        </div>
      </div>

      <main className="px-4 pt-5 space-y-8">

        {/* Hero banner */}
        <div className="rounded-2xl bg-gradient-to-br from-[#111] to-[#1f1a0f] p-5 text-white overflow-hidden relative">
          <div className="absolute right-0 top-0 h-full w-32 opacity-10 text-[120px] leading-none overflow-hidden select-none">🎲</div>
          <BookOpen size={28} className="text-[#ffd26a] mb-3" />
          <h2 className="text-xl font-black leading-tight">
            {lang === 'hi' ? 'खेल को समझें\nआसान तरीके से' : 'Understand the Game\nthe Easy Way'}
          </h2>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">
            {lang === 'hi'
              ? 'इस गाइड में आप सीखेंगे कि कैसे बेट लगाएं, किस नंबर पर दांव लगाएं और कैसे जीत हासिल करें।'
              : 'This guide teaches you how to place bets, choose numbers, and maximize your winning chances.'}
          </p>
        </div>

        {/* Video Tutorials */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-5 w-1 rounded-full bg-[#b88422]" />
            <h2 className="text-sm font-black uppercase tracking-[0.1em] text-[#333]">
              {lang === 'hi' ? 'वीडियो ट्यूटोरियल' : 'Video Tutorials'}
            </h2>
          </div>

          {loadingVideos ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#ebe3d2] animate-pulse">
                  <div className="aspect-video bg-gray-200" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-[#e0d6c2] p-8 text-center">
              <p className="text-4xl mb-2">🎬</p>
              <p className="text-sm font-semibold text-gray-500">
                {lang === 'hi' ? 'अभी कोई वीडियो उपलब्ध नहीं है' : 'No videos available yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {videos.map(v => (
                <VideoCard key={v.id} video={v} lang={lang} />
              ))}
            </div>
          )}
        </section>

        {/* Step-by-step guide */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-5 w-1 rounded-full bg-[#b88422]" />
            <h2 className="text-sm font-black uppercase tracking-[0.1em] text-[#333]">
              {lang === 'hi' ? 'चरण-दर-चरण गाइड' : 'Step-by-Step Guide'}
            </h2>
          </div>

          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-4 bg-white rounded-2xl px-4 py-4 border border-[#ebe3d2] shadow-sm">
                <div className="shrink-0 flex flex-col items-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#b88422] to-[#ffd26a] text-white font-black text-sm shadow">
                    {s.step}
                  </div>
                  {i < steps.length - 1 && <div className="mt-2 w-0.5 flex-1 bg-[#e9dfce] min-h-[16px]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#111] text-sm">{s.title}</p>
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bet Types */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-5 w-1 rounded-full bg-[#b88422]" />
            <h2 className="text-sm font-black uppercase tracking-[0.1em] text-[#333]">
              {lang === 'hi' ? 'बेट के प्रकार' : 'Bet Types'}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {BET_TYPES.map((bt, i) => (
              <div key={i} className={`rounded-2xl p-4 bg-gradient-to-br ${bt.color} text-white shadow`}>
                <p className="text-2xl mb-1">{bt.icon}</p>
                <p className="font-black text-sm">{lang === 'hi' ? bt.name_hi : bt.name_en}</p>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{lang === 'hi' ? bt.desc_hi : bt.desc_en}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tips */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-5 w-1 rounded-full bg-[#b88422]" />
            <h2 className="text-sm font-black uppercase tracking-[0.1em] text-[#333]">
              {lang === 'hi' ? 'महत्वपूर्ण सुझाव' : 'Important Tips'}
            </h2>
          </div>

          <div className="bg-[#111] rounded-2xl p-5 space-y-3">
            {(lang === 'hi' ? [
              '💡 हमेशा अपनी बजट सीमा तय करें और उसी में खेलें।',
              '🔒 अपना MPIN किसी से साझा न करें।',
              '📲 केवल आधिकारिक ऐप या वेबसाइट का उपयोग करें।',
              '⏰ बेट बंद होने का समय देखकर ही दांव लगाएं।',
              '💰 जीत और हार दोनों में संयम रखें।',
            ] : [
              '💡 Always set a budget limit and play within it.',
              '🔒 Never share your MPIN with anyone.',
              '📲 Only use the official app or website.',
              '⏰ Check bet closing time before placing a bet.',
              '💰 Stay calm whether you win or lose.',
            ]).map((tip, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shrink-0 h-1.5 w-1.5 rounded-full bg-[#ffd26a] mt-2" />
                <p className="text-sm text-white/80 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="bg-gradient-to-br from-[#b88422] to-[#ffd26a] rounded-2xl p-5 text-center shadow-lg">
          <p className="text-xl font-black text-[#111] mb-1">
            {lang === 'hi' ? 'खेलने के लिए तैयार हैं?' : 'Ready to Play?'}
          </p>
          <p className="text-sm text-[#111]/70 mb-4">
            {lang === 'hi' ? 'अभी होम पेज पर जाएं और गेम शुरू करें।' : 'Go to Home and start your first game.'}
          </p>
          <Link
            href="/home"
            className="inline-flex items-center gap-2 bg-[#111] text-white text-sm font-bold px-6 py-3 rounded-full shadow hover:bg-[#222] transition-colors"
          >
            {lang === 'hi' ? 'होम पर जाएं' : 'Go to Home'}
            <ChevronRight size={16} />
          </Link>
        </div>

      </main>
    </div>
  );
}
