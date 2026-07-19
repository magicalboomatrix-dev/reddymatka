'use client';

import { useEffect, useState } from 'react';

export default function PWAHandler() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isTWA, setIsTWA] = useState(false);

  useEffect(() => {
    // Check if running as standalone PWA or TWA
    const checkMode = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
      
      // TWA detection: in TWA, the referrer is often the Play Store or empty
      // and display-mode is standalone but we can check additional signals
      const isTWAMode = isStandaloneMode && (
        document.referrer.includes('android-app://') ||
        !window.matchMedia('(display-mode: browser)').matches
      );
      
      setIsStandalone(isStandaloneMode);
      setIsTWA(isTWAMode);
      
      // Log mode for debugging
      console.log('[PWA] Standalone:', isStandaloneMode, 'TWA:', isTWAMode);
      
      // Force standalone look in TWA
      if (isStandaloneMode || isTWAMode) {
        document.body.classList.add('standalone-mode');
      }
    };

    checkMode();

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e) => {
      setIsStandalone(e.matches);
      if (e.matches) {
        document.body.classList.add('standalone-mode');
      }
    };
    mediaQuery.addEventListener('change', handleChange);

    // Capture install prompt (not needed for TWA but kept for browser PWA)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Handle app resume - prevent TWA from refreshing/closing
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Ensure service worker is active when app resumes
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            console.log('[PWA] SW ready on resume');
          }).catch((err) => {
            console.log('[PWA] SW not available:', err);
          });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle page hide/show for TWA stability
    const handlePageShow = (e) => {
      if (e.persisted) {
        console.log('[PWA] Page restored from bfcache');
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    // Prevent accidental back button closing (TWA specific)
    const handleBackButton = (e) => {
      // Only handle if we're at root and in standalone/TWA mode
      if ((isStandalone || isTWA) && window.location.pathname === '/') {
        // Don't prevent default - let normal navigation happen
        // But we can log it for debugging
        console.log('[PWA] Back button at root');
      }
    };
    window.addEventListener('popstate', handleBackButton);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[PWA] SW registered:', registration.scope);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  console.log('[PWA] New SW activated');
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('[PWA] SW registration failed:', error);
        });
    }

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('popstate', handleBackButton);
    };
  }, []);

  return null; // Logic-only component
}
