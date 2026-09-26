import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  LayoutDashboard,
  ListTree,
  LogOut,
  MessageSquare,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { AdminIdentity } from '@lawcheck/contracts';
import { CommonCodes } from '@lawcheck/ui/common-codes';
import { adminApi, AdminApiError } from './api';
import { AdminOverview } from './AdminOverview';
import { AdminUsers } from './AdminUsers';
import { AdminMenus } from './AdminMenus';
import { AdminQuestions, AdminQuestionStatistics } from './AdminQuestions';
import './admin.css';

const sections = {
  overview: {
    title: '운영 요약',
    description: '질문부터 전문가 검증까지, 서비스의 처리 현황을 확인합니다.',
    icon: LayoutDashboard,
  },
  questions: {
    title: '질문현황',
    description: '기간별 질문 원문과 AI·전문가 답변을 확인합니다.',
    icon: MessageSquare,
  },
  statistics: {
    title: '통계',
    description: '접수된 질문을 주제별로 모아 건수와 비중을 확인합니다.',
    icon: BarChart3,
  },
  users: {
    title: '사용자 관리',
    description: 'BO 회원의 계정 상태, 요금제와 관리자 권한을 관리합니다.',
    icon: Users,
  },
  codes: {
    title: '공통코드 관리',
    description: '전문가 그룹과 요금제 등 서비스의 공통 기준을 관리합니다.',
    icon: Settings2,
  },
  menus: {
    title: 'BO 메뉴 관리',
    description: 'Office에 표시되는 메뉴의 이름과 순서를 설정합니다.',
    icon: ListTree,
  },
};
type Section = keyof typeof sections;
const currentSection = (): Section => {
  const key = window.location.hash.slice(1);
  return Object.hasOwn(sections, key) ? (key as Section) : 'overview';
};

export default function AdminApp() {
  const [section, setSection] = useState<Section>(currentSection);
  const [user, setUser] = useState<AdminIdentity | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onError = useCallback((e: unknown) => {
    if (e instanceof AdminApiError && [401, 403].includes(e.status)) setUser(null);
    setError(e instanceof Error ? e.message : '서버에 연결하지 못했습니다.');
  }, []);
  const onSessionError = useCallback(
    (e: unknown) => {
      if (e instanceof AdminApiError && [401, 403].includes(e.status)) onError(e);
    },
    [onError],
  );
  useEffect(() => {
    const sync = () => {
      setSection(currentSection());
      setError('');
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    let active = true;
    adminApi<AdminIdentity>('/me')
      .then((data) => {
        if (active) setUser(data);
      })
      .catch((e: unknown) => {
        if (active && !(e instanceof AdminApiError && e.status === 401)) onError(e);
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, [onError]);
  if (initializing)
    return (
      <div className="admin-login">
        <p role="status">관리자 인증을 확인하고 있습니다.</p>
      </div>
    );
  if (!user)
    return (
      <div className="admin-login">
        <main className="admin-login-card">
          <img src="/brand/aiqaver-admin.png" alt="AI QAVER Admin" />
          <span className="admin-eyebrow">PLATFORM ADMINISTRATION</span>
          <h1>관리자 로그인</h1>
          <p>관리자 권한이 등록된 계정으로 로그인해 주세요.</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              setError('');
              try {
                setUser(
                  await adminApi<AdminIdentity>('/login', {
                    identifier: form.get('identifier'),
                    password: form.get('password'),
                  }),
                );
              } catch (e) {
                onError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <label>
                아이디 또는 이메일
                <input name="identifier" autoComplete="username" required maxLength={254} />
              </label>
              <label>
                비밀번호
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={10}
                  maxLength={128}
                />
              </label>
              {error && (
                <p role="alert" className="admin-error">
                  {error}
                </p>
              )}
              <button className="primary">{busy ? '로그인 중…' : '관리자 로그인'}</button>
            </fieldset>
          </form>
        </main>
      </div>
    );
  const selected = sections[section];
  return (
    <div className="admin-shell">
      <a
        className="admin-skip"
        href="#admin-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('admin-content')?.focus();
        }}
      >
        본문으로 이동
      </a>
      <aside className="admin-sidebar" aria-label="관리 메뉴">
        <a className="admin-brand" href="/" aria-label="운영 요약">
          <img src="/brand/aiqaver-admin.png" alt="AI QAVER Admin" />
        </a>
        <p className="admin-nav-label">WORKSPACE</p>
        <nav aria-label="관리자 메뉴">
          {Object.entries(sections).map(([key, item]) => (
            <a key={key} href={`#${key}`} aria-current={section === key ? 'page' : undefined}>
              <item.icon size={19} aria-hidden="true" />
              {item.title}
            </a>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <span>
            <ShieldCheck size={16} />
            플랫폼 관리자
          </span>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-header">
          <div className="admin-account">
            <span>{user.name}</span>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await adminApi('/logout', {});
                  setUser(null);
                } catch (e) {
                  onError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={15} />
              로그아웃
            </button>
          </div>
        </header>
        <main id="admin-content" tabIndex={-1}>
          <div className="admin-page-heading">
            <span className="admin-eyebrow">ADMINISTRATION</span>
            <h1>{selected.title}</h1>
            <p>{selected.description}</p>
          </div>
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
          {section === 'overview' ? (
            <AdminOverview onError={onSessionError} />
          ) : section === 'questions' ? (
            <AdminQuestions onError={onSessionError} />
          ) : section === 'statistics' ? (
            <AdminQuestionStatistics onError={onSessionError} />
          ) : section === 'users' ? (
            <AdminUsers selfId={user.id} onError={onSessionError} onSelfUpdate={setUser} />
          ) : section === 'menus' ? (
            <AdminMenus onError={onSessionError} />
          ) : (
            <div className="admin-codes">
              <CommonCodes request={adminApi} onError={onSessionError} showHeading={false} />
            </div>
          )}
        </main>
        <footer className="admin-footer">AI QAVER Admin · 질문에서 확신까지</footer>
      </div>
    </div>
  );
}
