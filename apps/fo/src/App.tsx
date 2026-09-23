import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUp,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  HeartHandshake,
  House,
  Landmark,
  LockKeyhole,
  Mail,
  Menu,
  MessageCircle,
  Plus,
  Scale,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { ChatResponse, ChatTurn, PublicConfig } from '@lawcheck/contracts';

const topics = [
  {
    name: '부동산·임대차',
    icon: House,
    prompt: '계약이 끝났는데 집주인이 보증금을 돌려주지 않아요.',
    description: '보증금, 전월세, 계약 문제',
  },
  {
    name: '노동·직장',
    icon: BriefcaseBusiness,
    prompt: '퇴사한 지 한 달이 지났는데 아직 급여를 받지 못했어요.',
    description: '임금, 퇴직금, 부당해고',
  },
  {
    name: '민사·금전',
    icon: Landmark,
    prompt: '지인에게 빌려준 돈을 돌려받으려면 무엇부터 준비해야 하나요?',
    description: '빌려준 돈, 손해배상, 분쟁',
  },
  {
    name: '가사·생활',
    icon: HeartHandshake,
    prompt: '상속과 관련해 가족끼리 의견이 다른데 어떻게 정리해야 할까요?',
    description: '가족, 상속, 일상 속 고민',
  },
];
const defaultConfig: PublicConfig = {
  officeName: '법률사무소 IBS',
  mode: 'prototype',
  maxQuestions: 3,
  questionLimitEnabled: false,
};
type InfoPanel = 'guide' | 'privacy' | 'notice' | null;

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'brand-small' : ''}`}>
      <img className="brand-logo" src="/brand/logo.png" alt="aiqaver.com" />
    </span>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="info-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="닫기">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [config, setConfig] = useState(defaultConfig);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [info, setInfo] = useState<InfoPanel>(null);
  const [selectedTurn, setSelectedTurn] = useState<ChatTurn | null>(null);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [quota, setQuota] = useState(3);
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const latestTurn = useRef<HTMLElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const remaining = Math.max(0, quota - (loading ? 1 : 0));
  const limitReached = config.questionLimitEnabled && remaining === 0;
  const latestTurnId = turns.at(-1)?.id;
  const latestTurnStatus = turns.at(-1)?.status;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/config', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data?.mode === 'prototype') {
          setConfig(body.data);
          setQuota(body.data.remainingQuestions ?? 3);
        }
      })
      .catch(() => {});
    return () => {
      controller.abort();
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, []);
  useEffect(() => {
    if (!latestTurnId) return;
    const frame = requestAnimationFrame(() => {
      latestTurn.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [latestTurnId, latestTurnStatus]);
  useEffect(() => {
    if (selectedTurn) drawer.current?.showModal();
    else drawer.current?.close();
  }, [selectedTurn]);

  function choosePrompt(prompt: string) {
    setQuestion(prompt);
    composer.current?.focus();
  }
  async function reset() {
    if (resetting) return;
    setResetting(true);
    setResetError('');
    try {
      const response = await fetch('/api/v1/chat/session', { method: 'POST' });
      if (!response.ok) throw new Error();
    } catch {
      setResetError('새 대화를 시작하지 못했어요. 다시 시도해 주세요.');
      setResetting(false);
      return;
    }
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoading(false);
    setTurns([]);
    setQuota(3);
    setSelectedTurn(null);
    setResetting(false);
    setQuestion('');
    setShowReset(false);
    setMobileNav(false);
    composer.current?.focus();
  }
  function newConversation() {
    setMobileNav(false);
    if (turns.length || question || loading || quota < 3) setShowReset(true);
    else composer.current?.focus();
  }
  async function sendQuestion(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || activeRequest.current || limitReached) return;
    const text = question.trim();
    const id = crypto.randomUUID();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 70000);
    const history = turns
      .filter((turn) => turn.status === 'complete')
      .slice(-10)
      .map(({ question, answer }) => ({ question, answer }));
    setQuestion('');
    setLoading(true);
    setTurns((previous) => [
      ...previous,
      { id, question: text, requested: false, answer: '', status: 'pending' },
    ]);
    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, history }),
        signal: controller.signal,
      });
      const body: ChatResponse = await response.json();
      if (!body.success) {
        if (body.error.code === 'QUESTION_LIMIT_REACHED') setQuota(0);
        throw new Error(body.error.message);
      }
      if (!response.ok || !body.data?.answer?.trim())
        throw new Error('답변을 받지 못했어요. 다시 시도해 주세요.');
      if (activeRequest.current !== controller) return;
      setQuota((previous) => body.data.remainingQuestions ?? Math.max(0, previous - 1));
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === id
            ? {
                ...turn,
                answer: body.data.answer,
                isLegalQuestion: body.data.isLegalQuestion === true,
                status: 'complete',
              }
            : turn,
        ),
      );
    } catch (error) {
      if (activeRequest.current !== controller) return;
      const message = controller.signal.aborted
        ? '답변 시간이 길어지고 있어요. 다시 시도해 주세요.'
        : error instanceof Error && !(error instanceof SyntaxError) && !(error instanceof TypeError)
          ? error.message
          : '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === id ? { ...turn, answer: message, status: 'error' } : turn,
        ),
      );
      setQuestion(text);
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }
  function openVerification(turn: ChatTurn) {
    if (turn.status !== 'complete' || turn.isLegalQuestion !== true) return;
    setEmail('');
    setConsent(false);
    setSubmitted(false);
    setSelectedTurn(turn);
  }
  function submitVerification(event: FormEvent) {
    event.preventDefault();
    if (!selectedTurn || !consent) return;
    setTurns((previous) =>
      previous.map((turn) => (turn.id === selectedTurn.id ? { ...turn, requested: true } : turn)),
    );
    setSubmitted(true);
    setEmail('');
  }

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <a href="/" className="brand-link" aria-label="aiqaver.com 홈">
          <Brand />
        </a>
        <p className="sidebar-tagline">법률 고민의 첫 번째 대화</p>
        <button className="new-chat" onClick={newConversation}>
          <Plus size={18} />
          새로운 질문 시작하기<span>↗</span>
        </button>
        <div className="sidebar-section-label">WORKSPACE</div>
        <button
          className="nav-item active"
          onClick={() => {
            setMobileNav(false);
            composer.current?.focus();
          }}
        >
          <MessageCircle size={18} />
          법률 AI와 대화
          <span className="live-dot" />
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setInfo('guide');
            setMobileNav(false);
          }}
        >
          <FileCheck2 size={18} />
          변호사 검증 안내
          <ChevronRight size={15} className="nav-chevron" />
        </button>
        <div className="conversation-history">
          <div className="sidebar-section-label">이번 대화</div>
          {turns.length ? (
            turns.map((turn) => (
              <button
                key={turn.id}
                onClick={() => {
                  document.getElementById(turn.id)?.scrollIntoView({ behavior: 'smooth' });
                  setMobileNav(false);
                }}
                className="history-item"
              >
                <MessageCircle size={14} />
                <span>{turn.question}</span>
              </button>
            ))
          ) : (
            <p>
              첫 질문을 남겨보세요.
              <br />
              대화가 여기에 표시됩니다.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon">
              <LockKeyhole size={17} />
            </span>
            <strong>이름 없이, 부담 없이</strong>
            <p>
              회원가입 없이 시작하세요.
              <br />
              검증을 원할 때만 이메일을 받아요.
            </p>
            <button onClick={() => setInfo('privacy')}>
              개인정보 안내
              <ArrowRight size={13} />
            </button>
          </div>
          <button className="help-button" onClick={() => setInfo('guide')}>
            <CircleHelp size={17} />
            이용 방법 알아보기
            <ArrowUp size={15} className="diagonal-arrow" />
          </button>
          <div className="sidebar-copyright">© 2026 aiqaver.com</div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label="메뉴 열기"
            >
              <Menu size={21} />
            </button>
            <span className="workspace-title">aiqaver.com</span>
            <span className="beta-tag">PREVIEW</span>
          </div>
          <button className="office-chip" onClick={() => setInfo('guide')}>
            <span className="office-avatar">
              <Building2 size={15} />
            </span>
            <span>{config.officeName}</span>
            <ChevronDown size={13} />
          </button>
        </header>

        <main className={`main-content ${turns.length ? 'has-conversation' : ''}`}>
          {!turns.length && !loading ? (
            <>
              <section className="hero">
                <span className="eyebrow">
                  <span /> AI · QUESTION · ANSWER · VERIFY
                </span>
                <h1>
                  복잡한 법률 고민,
                  <br />
                  <span>질문에서 답을 찾으세요.</span>
                </h1>
                <p>
                  어디서부터 시작해야 할지 막막할 때,
                  <br className="mobile-break" /> 편하게 이야기해 주세요.
                  <br className="desktop-break" /> AI와 먼저 정리하고, 필요하면 변호사의 검토를
                  받아보세요.
                </p>
                <div className="hero-assurances">
                  <span>
                    <Check size={14} />
                    회원가입 없이
                  </span>
                  <i />
                  <span>
                    <Check size={14} />
                    익명으로 질문
                  </span>
                  <i />
                  <span>
                    <Check size={14} />
                    원하는 답변만 검증
                  </span>
                </div>
              </section>
            </>
          ) : (
            <section className="conversation" aria-label="법률 대화" aria-live="polite">
              <div className="conversation-title">
                <span className="eyebrow">
                  <span /> YOUR FIRST STEP
                </span>
                <h1>함께 정리해 볼게요.</h1>
                <p>질문을 바탕으로 AI가 답변을 정리해 드려요.</p>
              </div>
              {turns.map((turn) => (
                <article
                  className="turn"
                  id={turn.id}
                  key={turn.id}
                  ref={turn.id === latestTurnId ? latestTurn : undefined}
                >
                  <div className="user-message">{turn.question}</div>
                  <div className="assistant-message">
                    <span className="assistant-avatar">
                      <Scale size={20} />
                    </span>
                    <div className="assistant-body">
                      <div className="assistant-name">
                        aiqaver.com <span>{turn.status === 'error' ? '연결 안내' : 'AI 답변'}</span>
                      </div>
                      <p
                        className={turn.status === 'pending' ? 'typing-bubble' : undefined}
                        role={
                          turn.status === 'pending'
                            ? 'status'
                            : turn.status === 'error'
                              ? 'alert'
                              : undefined
                        }
                        aria-label={
                          turn.status === 'pending' ? 'AI가 답변을 준비하고 있어요' : undefined
                        }
                      >
                        {turn.status === 'pending' ? (
                          <span className="typing-indicator" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : (
                          turn.answer
                        )}
                      </p>
                      {turn.status === 'complete' && turn.isLegalQuestion === true && (
                        <button
                          className={`verify-button ${turn.requested ? 'requested' : ''}`}
                          onClick={() => openVerification(turn)}
                        >
                          {turn.requested ? <Check size={16} /> : <ShieldCheck size={16} />}
                          {turn.requested ? '검증 요청 체험 완료' : '변호사에게 검증 요청'}
                          <ArrowRight size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}

          <section className="composer-section" aria-label="질문 작성">
            <form className="composer" onSubmit={sendQuestion}>
              <label htmlFor="legal-question" className="sr-only">
                법률 질문
              </label>
              <textarea
                id="legal-question"
                ref={composer}
                value={question}
                maxLength={2000}
                disabled={loading || limitReached}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={
                  !limitReached
                    ? '지금 겪고 있는 상황이나 궁금한 점을 자유롭게 적어주세요.'
                    : '이번 대화의 체험 횟수를 모두 사용했어요. 새 대화를 시작해 주세요.'
                }
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Enter' ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                  )
                    return;
                  event.preventDefault();
                  if (!event.repeat) event.currentTarget.form?.requestSubmit();
                }}
              />
              <div className="composer-toolbar">
                <span className="composer-mode">
                  <Sparkles size={15} />
                  법률 AI
                  <span className="mode-divider" />
                  GPT 연결
                </span>
                <div className="composer-actions">
                  {config.questionLimitEnabled && (
                    <span className="remaining">
                      남은 질문 <b>{remaining}</b> / {config.maxQuestions}
                    </span>
                  )}
                  <button
                    type="submit"
                    className="send-button"
                    disabled={!question.trim() || loading || limitReached}
                    aria-label="질문 보내기"
                  >
                    <ArrowUp size={21} />
                  </button>
                </div>
              </div>
            </form>
            <p className="composer-notice">
              <LockKeyhole size={12} />
              <span>주민등록번호, 연락처 등 민감한 개인정보는 입력하지 마세요.</span>
            </p>
          </section>

          {!turns.length && (
            <section className="question-section" aria-labelledby="question-heading">
              <div className="section-heading">
                <h2 id="question-heading">어떤 고민이 있으신가요?</h2>
                <span>가까운 주제를 골라 시작해 보세요</span>
              </div>
              <div className="topic-grid">
                {topics.map(({ name, icon: Icon, prompt, description }) => (
                  <button className="topic-card" key={name} onClick={() => choosePrompt(prompt)}>
                    <span className="topic-icon">
                      <Icon size={21} strokeWidth={1.5} />
                    </span>
                    <strong>{name}</strong>
                    <p>{description}</p>
                    <ArrowUp size={15} className="topic-arrow" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {!turns.length && (
            <section className="verification-promo">
              <div className="promo-illustration">
                <div className="illustration-back" />
                <div className="illustration-page">
                  <span />
                  <span />
                  <span />
                  <ShieldCheck size={30} strokeWidth={1.5} />
                </div>
                <span className="illustration-spark">✧</span>
              </div>
              <div className="promo-copy">
                <div className="mini-label">AI의 정리에, 전문가의 확인을 더하다</div>
                <h2>조금 더 확실한 답변이 필요하다면</h2>
                <p>
                  궁금한 답변만 골라 변호사에게 검증을 요청하세요.
                  <br />
                  검토한 답변은 이메일로 편하게 받아볼 수 있어요.
                </p>
              </div>
              <button className="promo-link" onClick={() => setInfo('guide')}>
                어떻게 진행되나요?
                <ArrowRight size={16} />
              </button>
            </section>
          )}

          <div className="how-it-works">
            <span>
              <span className="step-number">1</span>편하게 질문하기
            </span>
            <ChevronRight size={13} />
            <span>
              <span className="step-number">2</span>AI 답변 확인하기
            </span>
            <ChevronRight size={13} />
            <span>
              <span className="step-number">3</span>필요한 질문만 변호사 검증
            </span>
          </div>
          <footer className="main-footer">
            <p>
              AI 답변은 일반적인 법률 정보이며, 개별 사건에 대한 변호사의 법률 자문을 대신하지
              않습니다.
            </p>
            <div>
              <span className="demo-label">
                AI 답변 제공 · 검증 요청 및 이메일 발송은 체험 기능
              </span>
              <nav>
                <button onClick={() => setInfo('privacy')}>개인정보 안내</button>
                <span>·</span>
                <button onClick={() => setInfo('notice')}>이용 안내</button>
              </nav>
            </div>
          </footer>
        </main>
      </div>

      {info && (
        <Dialog
          title={
            info === 'guide'
              ? '변호사 검증, 이렇게 진행돼요'
              : info === 'privacy'
                ? '개인정보 안내'
                : 'aiqaver.com 체험 안내'
          }
          onClose={() => setInfo(null)}
        >
          {info === 'guide' ? (
            <>
              <div className="guide-office">
                <Building2 size={19} />
                <strong>{config.officeName}</strong>
                <span>샘플 사무실</span>
              </div>
              <ol className="guide-steps">
                <li>
                  <MessageCircle size={21} />
                  <div>
                    <strong>AI와 먼저 이야기해요</strong>
                    <p>로그인 없이 상황을 정리하고 답변을 확인하세요.</p>
                  </div>
                </li>
                <li>
                  <FileCheck2 size={21} />
                  <div>
                    <strong>원하는 질문만 검증 요청</strong>
                    <p>질문 아래 버튼을 누르고 답변받을 이메일을 입력하세요.</p>
                  </div>
                </li>
                <li>
                  <Mail size={21} />
                  <div>
                    <strong>변호사 답변을 이메일로</strong>
                    <p>사무실이 담당자를 배정하면, 변호사가 검토 후 답변을 보내드려요.</p>
                  </div>
                </li>
              </ol>
              <p className="info-callout">
                현재는 체험 화면입니다. 실제 변호사 배정이나 이메일 발송은 이루어지지 않습니다.
              </p>
            </>
          ) : info === 'privacy' ? (
            <div className="info-prose">
              <p>
                질문과 앞선 대화는 답변 생성을 위해 서버를 거쳐 OpenAI로 전송됩니다. 이 앱의 DB나
                브라우저 저장소에는 보관하지 않으며 새로고침하면 대화가 사라집니다. 검증 요청 체험에
                입력한 이메일은 전송하지 않습니다.
              </p>
              <p>
                정식 서비스에서는 질문과 AI 답변을 무기명으로 저장하고, 검증을 요청한 질문에 한해
                이메일을 받습니다. 구체적인 보관기간과 처리 방침은 실제 서비스 공개 전에 안내합니다.
              </p>
              <p>체험 시에도 실명·연락처·사건 관계자의 개인정보를 입력하지 마세요.</p>
            </div>
          ) : (
            <div className="info-prose">
              <p>
                aiqaver.com의 첫 화면과 질문·검증 요청 흐름을 확인할 수 있는 개발용 미리보기입니다.
              </p>
              <p>
                답변은 GPT API로 생성됩니다. DB 대화 저장, 변호사 배정, 이메일 발송은 아직 연결되지
                않았습니다.
              </p>
              <p>표시된 사무실명은 예시이며 실제 상담 접수를 의미하지 않습니다.</p>
            </div>
          )}
        </Dialog>
      )}
      {showReset && (
        <Dialog title="새로운 대화를 시작할까요?" onClose={() => setShowReset(false)}>
          <div className="info-prose">
            <p>현재 체험 대화와 입력 내용이 초기화됩니다.</p>
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setShowReset(false)}>
              계속 대화하기
            </button>
            {resetError && <p role="alert">{resetError}</p>}
            <button className="primary-button" onClick={reset} disabled={resetting}>
              새 대화 시작
            </button>
          </div>
        </Dialog>
      )}

      <dialog
        className="verification-drawer"
        ref={drawer}
        onCancel={() => setSelectedTurn(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedTurn(null);
        }}
      >
        <div className="drawer-heading">
          <span>
            <ShieldCheck size={20} />
            변호사 검증 요청
          </span>
          <button
            className="icon-button"
            aria-label="검증 패널 닫기"
            onClick={() => setSelectedTurn(null)}
          >
            <X size={20} />
          </button>
        </div>
        {submitted ? (
          <div className="submission-success">
            <span className="success-icon">
              <Check size={30} />
            </span>
            <h2>
              검증 요청 흐름을
              <br />
              체험하셨습니다.
            </h2>
            <p>
              실제 접수나 이메일 발송은 하지 않았어요.
              <br />
              정식 서비스에서는 검토한 답변을
              <br />
              입력하신 이메일로 보내드립니다.
            </p>
            <button className="primary-button" onClick={() => setSelectedTurn(null)}>
              대화로 돌아가기
            </button>
          </div>
        ) : (
          <form onSubmit={submitVerification} className="verification-form">
            <span className="eyebrow">
              <span /> PROFESSIONAL REVIEW
            </span>
            <h2>
              전문가의 확인으로
              <br />
              다음 걸음을 준비하세요.
            </h2>
            <p className="drawer-description">
              선택한 질문과 AI 답변만
              <br />
              {config.officeName}에 전달됩니다.
            </p>
            <div className="selected-question">
              <span>검증을 요청할 질문</span>
              <p>{selectedTurn?.question}</p>
            </div>
            <label htmlFor="request-email">
              답변받을 이메일 <span>*</span>
            </label>
            <input
              id="request-email"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@email.com"
            />
            <p className="field-hint">
              <Mail size={13} />
              변호사가 검토한 답변을 이메일로 보내드려요.
            </p>
            <label className="consent-label">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>선택한 질문·AI 답변과 이메일을 사무실에 전달하는 흐름을 확인했습니다.</span>
            </label>
            <div className="info-callout">
              체험용 폼입니다. 입력한 이메일은 전송·저장되지 않으며 실제 검증 요청은 접수되지
              않습니다.
            </div>
            <button className="primary-button full-width" type="submit">
              검증 요청 체험하기
              <ArrowRight size={17} />
            </button>
            <span className="drawer-footnote">
              <Clock3 size={13} />
              실제 답변 일정은 정식 서비스에서 안내합니다.
            </span>
          </form>
        )}
      </dialog>
    </div>
  );
}
