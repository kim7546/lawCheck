import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ArrowLeft, ArrowRight, CheckCheck, ClipboardCheck, LogOut, RefreshCw } from 'lucide-react';
import './styles.css';
import { api, ApiError } from './api';
import { Dashboard, Community } from './community';
import { BoardDetail } from './BoardDetail';
import { SignupFields } from './SignupFields';
import { CommonCodes } from './CommonCodes';
import { LawyerSignupFields } from './LawyerSignupFields';
import type { OfficeSignupConsent } from '@lawcheck/contracts';

type User = {
  id: string;
  name: string;
  email: string;
  plan: string;
  planCode?: { name: string };
  canManageCodes?: boolean;
};
type Post = {
  id: string;
  question: string;
  aiAnswer: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  reply: string | null;
};
type Board = { items: Post[]; total: number; page: number };
const labels: Record<string, string> = {
  REQUESTED: '검증 대기',
  REVIEWING: '검증 중',
  COMPLETED: '검증완료',
};
const date = (value: string) => new Date(value).toLocaleString('ko-KR');
function App() {
  const [section, setSection] = useState<'dashboard' | 'reviews' | 'community' | 'codes'>(
    'dashboard',
  );
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [signup, setSignup] = useState(false);
  const [signupConsent, setSignupConsent] = useState<OfficeSignupConsent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [board, setBoard] = useState<Board>({ items: [], total: 0, page: 1 });
  const [post, setPost] = useState<Post | null>(null);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    api<User>('/me')
      .then(setUser)
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 401))
          setError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => setInitializing(false));
  }, []);
  function showError(e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      setUser(null);
      setSection('dashboard');
      setCommunityId(null);
      setPost(null);
    }
    setError(e instanceof Error ? e.message : '서버에 연결하지 못했습니다.');
  }
  async function loadBoard(page = 1, filter = status) {
    setBusy(true);
    setError('');
    try {
      setBoard(await api<Board>(`/reviews?page=${page}&status=${filter}`));
      setPost(null);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!user || section !== 'reviews') return;
    let active = true;
    setBusy(true);
    api<Board>('/reviews')
      .then((data) => {
        if (active) setBoard(data);
      })
      .catch((e: unknown) => {
        if (active) showError(e);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [user, section]);
  async function openPost(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await api<Post>(`/reviews/${id}`);
      setPost(next);
      setReply(next.reply ?? '');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function updatePost(action: 'claim' | 'complete') {
    if (!post || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/reviews/${post.id}/${action}`, { reply });
      setPost(await api<Post>(`/reviews/${post.id}`));
      setNotice(
        action === 'claim'
          ? '검증을 시작했습니다. 답변을 작성해 주세요.'
          : '검증을 완료했습니다. 질문자가 답변을 확인할 수 있습니다.',
      );
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell">
      <header className="topbar">
        <a href="/" aria-label="대시보드 홈">
          <img src="/brand/aiqaver-office.png" alt="AI QAVER Office" />
        </a>
        {user && (
          <div className="account">
            <span className="badge plan-badge">{user.planCode?.name ?? user.plan}</span>
            <span>{user.name} 님</span>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/logout', {});
                  setUser(null);
                  setSection('dashboard');
                  setCommunityId(null);
                  setPost(null);
                  setStatus('');
                  setError('');
                  setNotice('');
                } catch (e) {
                  showError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={16} /> 로그아웃
            </button>
          </div>
        )}
      </header>
      {initializing ? (
        <main>
          <p role="status">로그인 정보를 확인하고 있습니다.</p>
        </main>
      ) : !user ? (
        <main className={`auth-layout ${signup ? 'signup-layout' : ''}`}>
          <section className="intro">
            <span className="eyebrow">AI QAVER REVIEW</span>
            <h1>
              한 번 더 확인하고,
              <br />더 나은 답변으로.
            </h1>
            <p>
              질문과 AI 답변을 살펴보고
              <br />
              당신의 검증 의견을 전해 주세요.
            </p>
            <div className="intro-note">
              <ClipboardCheck size={24} />
              <span>질문 확인 → 검증 → 답변 완료</span>
            </div>
          </section>
          <section className="auth-card">
            <h2>{signup ? '회원가입' : '로그인'}</h2>
            <p>
              {signup
                ? '변호사 Office의 검증과 커뮤니티에 참여해 주세요.'
                : '로그인 후 검증 요청을 확인하세요.'}
            </p>
            <form
              onInput={() => setError('')}
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                if (signup && !signupConsent) return;
                const form = new FormData(event.currentTarget);
                if (signup && form.get('password') !== form.get('passwordConfirmation')) {
                  setError('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
                  return;
                }
                setBusy(true);
                setError('');
                try {
                  setUser(
                    await api<User>(signup ? '/signup' : '/login', {
                      password: form.get('password'),
                      ...(signup
                        ? {
                            ...signupConsent,
                            name: form.get('name'),
                            username: form.get('username'),
                            betaSignupCode: form.get('betaSignupCode'),
                            email: form.get('email'),
                            passwordConfirmation: form.get('passwordConfirmation'),
                            lawyerProfile: {
                              mobilePhone: form.get('mobilePhone'),
                              registrationNumber: form.get('registrationNumber'),
                              issueNumber: form.get('issueNumber'),
                              officeName: form.get('officeName'),
                              address: form.get('address'),
                              officePhone: form.get('officePhone'),
                            },
                          }
                        : { identifier: form.get('identifier') }),
                    }),
                  );
                } catch (e) {
                  showError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {signup ? (
                <LawyerSignupFields busy={busy} />
              ) : (
                <>
                  <label>
                    아이디 또는 이메일
                    <input name="identifier" autoComplete="username" maxLength={254} required />
                  </label>
                  <label>
                    비밀번호
                    <input
                      key={String(signup)}
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      minLength={10}
                      maxLength={128}
                      required
                      placeholder="10자 이상 입력"
                    />
                  </label>
                </>
              )}
              {signup && <SignupFields busy={busy} onChange={setSignupConsent} />}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy || (signup && !signupConsent)}>
                {busy ? '처리 중…' : signup ? '가입하고 시작하기' : '로그인'}
                <ArrowRight size={17} />
              </button>
            </form>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSignup(!signup);
                setSignupConsent(null);
                setError('');
              }}
            >
              {signup ? '이미 계정이 있나요? 로그인' : '아직 계정이 없나요? 회원가입'}
            </button>
          </section>
        </main>
      ) : (
        <main className="board-main">
          <nav className="main-nav" aria-label="주 메뉴">
            {(
              [
                ['dashboard', '대시보드'],
                ['reviews', '검증요청 게시판'],
                ['community', '커뮤니티'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                aria-current={section === key ? 'page' : undefined}
                disabled={busy}
                onClick={() => {
                  setSection(key);
                  setStatus('');
                  setPost(null);
                  setCommunityId(null);
                  setError('');
                  setNotice('');
                }}
              >
                {label}
              </button>
            ))}
            {user.canManageCodes && (
              <button
                aria-current={section === 'codes' ? 'page' : undefined}
                disabled={busy}
                onClick={() => {
                  setSection('codes');
                  setError('');
                  setNotice('');
                }}
              >
                공통 코드 관리
              </button>
            )}
          </nav>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {section === 'codes' && user.canManageCodes ? (
            <CommonCodes onError={showError} />
          ) : section === 'dashboard' ? (
            <Dashboard
              onError={showError}
              onClearError={() => setError('')}
              onReview={(id) => {
                setSection('reviews');
                void openPost(id);
              }}
              onCommunity={(id) => {
                setCommunityId(id);
                setSection('community');
              }}
              onNavigate={(next) => {
                setSection(next);
                setPost(null);
                setCommunityId(null);
              }}
            />
          ) : section === 'community' ? (
            <Community
              key={user.id}
              initialId={communityId}
              onError={showError}
              onClearError={() => setError('')}
            />
          ) : post ? (
            <BoardDetail
              busy={busy}
              onBack={() => {
                setNotice('');
                void loadBoard(board.page);
              }}
            >
              <button
                className="back"
                disabled={busy}
                onClick={() => {
                  setNotice('');
                  void loadBoard(board.page);
                }}
              >
                <ArrowLeft size={16} /> 목록으로
              </button>
              <div className="detail-heading">
                <div>
                  <span className="eyebrow">REVIEW REQUEST</span>
                  <h1>질문과 답변 검증</h1>
                  <p>
                    {date(post.createdAt)} · 내 검증 상태: {labels[post.status]}
                  </p>
                </div>
                <span className={`badge ${post.status}`}>{labels[post.status]}</span>
              </div>
              <section className="content-card">
                <h2>
                  <span className="letter">Q</span>질문
                </h2>
                <p className="prose">{post.question}</p>
              </section>
              <section className="content-card">
                <h2>
                  <span className="letter ai">AI</span>AI 답변
                </h2>
                <p className="prose">{post.aiAnswer}</p>
              </section>
              <section className="content-card">
                <h2>
                  <CheckCheck size={21} />내 검증 답변
                </h2>
                {post.status === 'COMPLETED' ? (
                  <>
                    <p className="prose">{post.reply}</p>
                    <p className="muted">
                      내가 작성한 답변 · {post.completedAt && date(post.completedAt)}
                    </p>
                  </>
                ) : (
                  <>
                    <label htmlFor="reply">검토 의견과 보완할 내용을 작성해 주세요.</label>
                    <textarea
                      id="reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      maxLength={20000}
                      rows={8}
                      disabled={post.status !== 'REVIEWING' || busy}
                      placeholder="검증 버튼을 누른 뒤 답변을 작성할 수 있습니다."
                    />
                    <div className="detail-actions">
                      <button
                        disabled={busy || post.status !== 'REQUESTED'}
                        onClick={() => void updatePost('claim')}
                      >
                        검증
                      </button>
                      <button
                        className="primary"
                        disabled={busy || post.status !== 'REVIEWING' || !reply.trim()}
                        onClick={() => void updatePost('complete')}
                      >
                        검증완료
                        <CheckCheck size={17} />
                      </button>
                    </div>
                    <p className="muted">
                      질문마다 한 번만 답변할 수 있습니다. 검증완료 후에는 추가 답변이나 수정이
                      불가능합니다.
                    </p>
                  </>
                )}
              </section>
            </BoardDetail>
          ) : (
            <>
              <div className="board-heading">
                <div>
                  <span className="eyebrow">REVIEW BOARD</span>
                  <h1>검증 요청 게시판</h1>
                  <p>검증 상태는 내 진행 상황만 표시됩니다. 질문마다 한 번씩 답변할 수 있습니다.</p>
                </div>
                <button disabled={busy} onClick={() => void loadBoard(board.page)}>
                  <RefreshCw size={16} />
                  새로고침
                </button>
              </div>
              <div className="board-toolbar">
                <div className="filters">
                  {[
                    ['', '전체'],
                    ['REQUESTED', '검증 대기'],
                    ['REVIEWING', '검증 중'],
                    ['COMPLETED', '검증완료'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={status === value ? 'selected' : ''}
                      aria-pressed={status === value}
                      disabled={busy}
                      onClick={() => {
                        setStatus(value!);
                        void loadBoard(1, value);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="muted">총 {board.total}건</span>
              </div>
              <section className="board-list" aria-busy={busy}>
                {busy ? (
                  <p className="empty" role="status">
                    요청을 불러오는 중입니다.
                  </p>
                ) : board.items.length === 0 ? (
                  <div className="empty">
                    <ClipboardCheck size={36} />
                    <h2>아직 검증 요청이 없습니다.</h2>
                    <p>질문자가 검증을 요청하면 이곳에 표시됩니다.</p>
                  </div>
                ) : (
                  board.items.map((item) => (
                    <button
                      className="board-row"
                      key={item.id}
                      onClick={() => void openPost(item.id)}
                    >
                      <span className={`badge ${item.status}`}>{labels[item.status]}</span>
                      <span className="row-content">
                        <strong>{item.question}</strong>
                        <small>{date(item.createdAt)}</small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  ))
                )}
              </section>
              <nav className="pagination" aria-label="게시판 페이지">
                <button
                  disabled={busy || board.page <= 1}
                  onClick={() => void loadBoard(board.page - 1)}
                >
                  이전
                </button>
                <span>
                  {board.page} / {Math.max(1, Math.ceil(board.total / 20))}
                </span>
                <button
                  disabled={busy || board.page * 20 >= board.total}
                  onClick={() => void loadBoard(board.page + 1)}
                >
                  다음
                </button>
              </nav>
            </>
          )}
        </main>
      )}
      <footer>AI QAVER · 답변을 더 신뢰할 수 있도록</footer>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
