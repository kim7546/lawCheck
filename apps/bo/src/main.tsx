import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Inbox,
  Settings,
  ArrowUpRight,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import './styles.css';

const sections = [
  {
    name: '업무 현황',
    icon: LayoutDashboard,
    description: '사무실의 검증 요청과 처리 현황을 한눈에 확인하세요.',
  },
  {
    name: '검증 요청',
    icon: Inbox,
    description: 'FO에서 접수한 질문을 확인하고 담당 변호사를 배정합니다.',
  },
  {
    name: '변호사 관리',
    icon: Users,
    description: '변호사 등록, 입사·퇴사 이력과 배정 가능 상태를 관리합니다.',
  },
  {
    name: '휴가 관리',
    icon: CalendarDays,
    description: '휴가 기간을 관리하고 미완료 업무의 재배정을 확인합니다.',
  },
  {
    name: '발송 관리',
    icon: Mail,
    description: '변호사 초대와 사용자 답변 이메일의 발송 상태를 확인합니다.',
  },
  {
    name: '사무실 설정',
    icon: Settings,
    description: '사무실 정보와 직원 권한, 배정 정책을 설정합니다.',
  },
];
function App() {
  const [active, setActive] = useState(0);
  const section = sections[active]!;
  return (
    <div className="office-shell">
      <aside>
        <div className="office-logo">
          <img src="/brand/logo.png" alt="aiqaver.com" />
        </div>
        <p className="office-label">AI QAVER · OFFICE</p>
        <nav>
          {sections.map(({ name, icon: Icon }, index) => (
            <button
              key={name}
              aria-current={active === index ? 'page' : undefined}
              className={active === index ? 'active' : ''}
              onClick={() => setActive(index)}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
        <a
          className="fo-link"
          href={
            import.meta.env.VITE_FO_URL ||
            (import.meta.env.DEV ? 'http://localhost:5173' : 'https://aiqaver.com')
          }
          target="_blank"
          rel="noreferrer"
        >
          FO 첫 화면 보기
          <ArrowUpRight size={16} />
        </a>
      </aside>
      <main>
        <header>
          <span>WORKSPACE / {section.name}</span>
          <span className="preview">개발 미리보기</span>
        </header>
        <section>
          <span className="eyebrow">LAW OFFICE WORKSPACE</span>
          <h1>{section.name}</h1>
          <p>{section.description}</p>
          <div className="setup-notice">
            <ShieldCheck size={20} />
            <div>
              <strong>BO 개발 환경이 준비되었습니다.</strong>
              <p>
                직원 인증과 업무 API 연결 전의 기본 화면입니다. 실제 인사·질문 데이터는 표시하지
                않습니다.
              </p>
            </div>
          </div>
          {active === 0 && (
            <div className="stats">
              {['미배정 질문', '검토 중', '오늘 답변 완료', '배정 가능 변호사'].map((label) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>—</strong>
                  <small>데이터 연결 전</small>
                </article>
              ))}
            </div>
          )}
          <div className="empty-state">
            <section.icon size={32} strokeWidth={1.3} />
            <h2>
              {active === 0 ? '사무실 업무를 한곳에서' : `${section.name} 기능을 준비하고 있어요`}
            </h2>
            <p>
              직원 로그인 → 변호사 등록 → 질문 배분 순서로 연결합니다.
              <br />
              휴가·퇴사자의 배정 제외와 재배정 규칙을 함께 적용합니다.
            </p>
            <span>다음 개발 단계</span>
          </div>
        </section>
      </main>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
