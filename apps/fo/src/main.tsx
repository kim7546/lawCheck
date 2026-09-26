import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const isAdmin = /^\/admin(?:\/|$)/.test(window.location.pathname);
// Compatibility link only: the Admin application is built and served independently.
const adminOrigin =
  import.meta.env.VITE_ADMIN_URL?.trim() ||
  (import.meta.env.DEV ? 'http://127.0.0.1:5175' : 'https://admin.aiqaver.com');
const adminUrl = `${adminOrigin.replace(/\/$/, '')}/admin${window.location.search}${window.location.hash}`;
if (isAdmin) window.location.replace(adminUrl);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? (
      <main style={{ padding: 32 }}>
        <h1>관리자 서비스</h1>
        <p role="status">
          <a href={adminUrl}>독립 관리자 서비스로 이동합니다.</a>
        </p>
      </main>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
