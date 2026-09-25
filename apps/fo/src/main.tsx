import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const isAdmin = /^\/admin(?:\/|$)/.test(window.location.pathname);
const AdminApp = lazy(() => import('./admin/AdminApp'));
if (isAdmin) {
  document.title = 'AI QAVER Admin | 사용자 관리';
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.appendChild(robots);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? (
      <Suspense fallback={<p role="status">관리 화면을 불러오는 중입니다.</p>}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
