import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register PWA service worker via vite-plugin-pwa
if ('serviceWorker' in navigator) {
  registerSW({
    onNeedRefresh() {
      console.log('Admin Dashboard PWA needs refresh');
    },
    onOfflineReady() {
      console.log('Admin Dashboard PWA is ready for offline use');
    },
  });
}
