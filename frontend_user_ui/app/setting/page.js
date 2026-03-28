'use client'
import React, { useEffect, useState } from "react";
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/AuthContext'

const Setting = () => {
    const router = useRouter();
    const { logout } = useAuth();

    const [isOpen, setIsOpen] = useState(false);
    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : "auto";
    }, [isOpen]);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

  return (
        <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f6f7fa] px-4 pb-6 pt-4">
            <header className="mx-auto flex w-full max-w-[420px] items-center justify-between ">
                <div className="back-btn">
                    <Link href="/home">
                        <img alt="back" src="/images/back-btn.png" className="h-5 w-5" />
                    </Link>
                </div>
                <h3 className="absolute left-1/2 -translate-x-1/2 text-lg font-black text-[#333]">Setting</h3>
                <div className="h-5 w-5"></div>
            </header>

            <main className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-[420px] flex-col justify-between">
                <section className="space-y-3">
                    <Link href="/" className="flex items-center justify-between border border-[#ebe3d2] bg-white px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                        <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                            <img src="/images/s-icon1.jpg" alt="Customer service" className="h-10 w-10 object-cover" />
                            <span>Customer service</span>
                        </div>
                        <img src="/images/right-arw.png" alt="Arrow" className="h-4 w-4 object-contain" />
                    </Link>

                    <button className="flex w-full items-center justify-between border border-[#ebe3d2] bg-white px-4 py-3 text-left shadow-[0_10px_22px_rgba(15,23,42,0.05)]" onClick={() => setIsOpen(true)}>
                        <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                            <img src="/images/s-icon2.jpg" alt="Business cooperation" className="h-10 w-10 object-cover" />
                            <span>Business cooperation</span>
                        </div>
                        <img src="/images/right-arw.png" alt="Arrow" className="h-4 w-4 object-contain" />
                    </button>

                    <Link href="/" className="flex items-center justify-between border border-[#ebe3d2] bg-white px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                        <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                            <img src="/images/s-icon3.jpg" alt="Version" className="h-10 w-10 object-cover" />
                            <span>Version</span>
                        </div>
                        <img src="/images/right-arw.png" alt="Arrow" className="h-4 w-4 object-contain" />
                    </Link>

                    <Link href="/" className="flex items-center justify-between border border-[#ebe3d2] bg-white px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                        <div className="flex items-center gap-3 text-sm font-semibold text-[#111]">
                            <img src="/images/s-icon4.jpg" alt="Install the official version" className="h-10 w-10 object-cover" />
                            <span>Install the official version</span>
                        </div>
                        <img src="/images/right-arw.png" alt="Arrow" className="h-4 w-4 object-contain" />
                    </Link>
                </section>

                <div>
                    <button className="w-full bg-[#111] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white" onClick={handleLogout}>Logout</button>
                </div>

                <div className={`fixed inset-0 z-40 bg-black/45 transition ${isOpen ? 'visible opacity-100' : 'invisible opacity-0'}`} onClick={() => setIsOpen(false)}/>

                <div className={`fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-6 pt-4 shadow-[0_-12px_32px_rgba(15,23,42,0.18)] transition ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
                    <div className="mx-auto h-1.5 w-14 bg-[#ddd]" />
                    <h2 className="mt-4 text-center text-lg font-black text-[#111]">Business cooperation</h2>
                    <div className="mt-5 space-y-3">
                        <Link href="/" className="flex items-center border border-[#ebe3d2] bg-[#faf7ef] px-4 py-3 text-[15px] font-semibold text-[#111]">
                            <img src="/images/telegram-ic.png" alt="telegram" width="32" height="32" className="mr-3" /> Telegram
                        </Link>
                        <Link href="/" className="flex items-center border border-[#ebe3d2] bg-[#faf7ef] px-4 py-3 text-[15px] font-semibold text-[#111]">
                            <img src="/images/whatsapp-ic.png" alt="whatsapp" width="32" height="32" className="mr-3" /> WhatsApp
                        </Link>
                    </div>
                    <button type="button" className="mx-auto mt-5 flex h-11 w-11 items-center justify-center bg-[#111]" onClick={() => setIsOpen(false)}>
                        <img src="/images/close-icon.png" alt="Close" className="h-4 w-4" />
                    </button>
                </div>
            </main>
    </div>
  )
}

export default Setting
