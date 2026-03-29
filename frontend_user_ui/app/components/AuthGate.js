'use client'

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/AuthContext';

const PUBLIC_ROUTES = ['/login', '/login-account'];

function AppSplash({ message }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#f8efcc_0%,#ffffff_48%,#eef1f5_100%)] px-6 text-center">
      <div className="rounded-[28px] border border-[#d9c07a] bg-white/90 px-8 py-10 shadow-[0_18px_50px_rgba(0,0,0,0.12)] backdrop-blur">
        <img src="/images/logo.png" alt="REDDYMATKA" className="mx-auto h-14 w-auto object-contain" />
        <div className="mt-5 flex justify-center">
          <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#d5b363] border-t-transparent" />
        </div>
        <p className="mt-4 text-sm font-semibold tracking-[0.14em] text-[#7d641d] uppercase">REDDYMATKA</p>
        <p className="mt-2 text-[13px] font-medium text-[#555]">{message}</p>
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    if (!isLoggedIn && !isPublicRoute) {
      router.replace('/login');
      return;
    }

    if (isLoggedIn && isPublicRoute) {
      router.replace('/');
    }
  }, [isLoggedIn, loading, pathname, router]);

  if (loading) {
    return <AppSplash message="Loading your session..." />;
  }

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (!isLoggedIn && !isPublicRoute) {
    return <AppSplash message="Redirecting to login..." />;
  }

  if (isLoggedIn && isPublicRoute) {
    return <AppSplash message="Opening your dashboard..." />;
  }

  return children;
}