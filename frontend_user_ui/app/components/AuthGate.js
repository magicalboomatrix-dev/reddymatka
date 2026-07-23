'use client'

import React, { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/AuthContext';

// Unauthenticated-only routes (logged-in users are redirected away)
const PUBLIC_ROUTES = ['/login', '/login-account'];

// Routes accessible to everyone regardless of auth state (no redirect either way)
const OPEN_ROUTES = ['/download'];

function AppSplash({ message }) {
  const [imgError, setImgError] = useState(false);
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#f8efcc_0%,#ffffff_48%,#eef1f5_100%)] px-6 text-center">
      <div className="rounded-[28px] border border-[#d9c07a] bg-white/90 px-8 py-10 shadow-[0_18px_50px_rgba(0,0,0,0.12)] backdrop-blur">
        {!imgError && (
          <img 
            src="/images/logo.png" 
            alt="reddymatka"
            className="mx-auto h-14 w-auto object-contain"
            onError={() => setImgError(true)}
          />
        )}
        {imgError && (
          <div className="mx-auto h-14 w-14 rounded-full bg-[#d5b363] flex items-center justify-center">
            <span className="text-white text-2xl font-bold">reddymatka</span>
          </div>
        )}
        <div className="mt-5 flex justify-center">
          <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#d5b363] border-t-transparent" />
        </div>
        <p className="mt-4 text-sm font-semibold tracking-[0.14em] text-[#7d641d] uppercase">reddymatka</p>
        <p className="mt-2 text-[13px] font-medium text-[#555]">{message}</p>
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const redirectTimeoutRef = useRef(null);
  const hasScheduledRef = useRef(false);

  useEffect(() => {
    if (loading) {
      return;
    }

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
    const isOpenRoute = OPEN_ROUTES.includes(pathname);

    if (isOpenRoute) {
      return; // accessible to everyone, no redirect
    }

    // Prevent rapid redirects that cause TWA to close/refresh
    const shouldRedirect = (!isLoggedIn && !isPublicRoute) || (isLoggedIn && isPublicRoute);

    if (shouldRedirect && !hasScheduledRef.current) {
      hasScheduledRef.current = true;
      setRedirecting(true);

      // Small delay to prevent rapid navigation loops
      redirectTimeoutRef.current = setTimeout(() => {
        if (!isLoggedIn && !isPublicRoute) {
          router.replace('/login');
        } else if (isLoggedIn && isPublicRoute) {
          router.replace('/');
        }
        setRedirecting(false);
        hasScheduledRef.current = false;
      }, 300);
    }

    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, [isLoggedIn, loading, pathname, router]);

  if (loading) {
    return <AppSplash message="Loading your session..." />;
  }

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const isOpenRoute = OPEN_ROUTES.includes(pathname);

  if (isOpenRoute) {
    return children; // always render, no auth check
  }

  if (!isLoggedIn && !isPublicRoute) {
    return <AppSplash message="Redirecting to login..." />;
  }

  if (isLoggedIn && isPublicRoute) {
    return <AppSplash message="Opening your dashboard..." />;
  }

  return children;
}