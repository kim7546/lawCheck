import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import './admin.css';

const sections = {
  overview: {
    title: '관리 홈',
    description: 'AI QAVER의 이용자와 전문가를 한곳에서 관리합니다.',
    icon: LayoutDashboard,
  },
  'fo-users': {
    title: 'FO 사용자 관리',
    description: 'AI QAVER 서비스를 이용하는 사용자 관리 공간입니다.',
    icon: Users,
  },
  'office-users': {
    title: 'Office 사용자 관리',
    description: '직역별 전문가 회원과 가입 상태를 관리하는 공간입니다.',
    icon: BriefcaseBusiness,
  },
};
type Section = keyof typeof sections;
const currentSection = (): Section => {
  const key = window.location.hash.slice(1);
  return Object.hasOwn(sections, key) ? (key as Section) : 'overview';
};

export default function AdminApp() {
  const [section, setSection] = useState<Section>(currentSection);
  useEffect(() => {
    const sync = () => setSection(currentSection());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const selected = sections[section];
  const Icon = selected.icon;
  const columns =
    section === 'office-users'
      ? ['이름', '아이디', '전문가 그룹', '소속', '요금제', '상태']
      : ['이름', '아이디', '이메일', '가입일', '상태'];

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
        <a className="admin-brand" href="/admin" aria-label="관리 홈">
          <img src="/brand/aiqaver-admin.png" alt="AI QAVER Admin" />
        </a>
        <p className="admin-nav-label">사용자 관리</p>
        <nav aria-label="사용자 관리">
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
            관리자 공간
          </span>
          <a href="/">
            FO 사이트로 이동
            <ArrowUpRight size={16} />
          </a>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-header">
          <span>
            AI QAVER <span className="admin-header-divider">/</span> Admin
          </span>
          <span className="admin-status">준비 중</span>
        </header>
        <main id="admin-content" tabIndex={-1}>
          <div className="admin-page-heading">
            <span className="admin-eyebrow">ADMINISTRATION</span>
            <h1>{selected.title}</h1>
            <p>{selected.description}</p>
          </div>
          {section === 'overview' ? (
            <>
              <div className="admin-destinations">
                {(['fo-users', 'office-users'] as const).map((key) => {
                  const item = sections[key];
                  return (
                    <a className="admin-destination" href={`#${key}`} key={key}>
                      <span className="admin-card-icon">
                        <item.icon size={26} />
                      </span>
                      <span className="admin-status">준비 중</span>
                      <h2>{item.title}</h2>
                      <p>{item.description}</p>
                      <span className="admin-card-link">
                        관리 화면 보기
                        <ArrowRight size={17} />
                      </span>
                    </a>
                  );
                })}
              </div>
              <section className="admin-notice" aria-label="관리 기능 안내">
                <ShieldCheck size={22} />
                <div>
                  <h2>사용자 관리 기능을 준비하고 있습니다.</h2>
                  <p>회원 조회와 관리 기능은 순차적으로 제공됩니다.</p>
                </div>
              </section>
            </>
          ) : (
            <section className="admin-panel" aria-label={selected.title}>
              <div className="admin-panel-toolbar">
                <h2>사용자 목록</h2>
                <label className="admin-search">
                  <Search size={17} />
                  <input aria-label="사용자 검색" placeholder="사용자 검색 · 준비 중" disabled />
                </label>
              </div>
              <div className="admin-table-scroll">
                <table>
                  <caption className="admin-sr-only">{selected.title} 목록</caption>
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody />
                </table>
              </div>
              <div className="admin-empty">
                <Icon size={34} />
                <h3>사용자 관리 기능 준비 중</h3>
                <p>기능이 준비되면 사용자 목록을 확인할 수 있습니다.</p>
              </div>
            </section>
          )}
        </main>
        <footer className="admin-footer">AI QAVER Admin</footer>
      </div>
    </div>
  );
}
