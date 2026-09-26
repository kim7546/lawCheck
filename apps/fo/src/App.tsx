import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowUp,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  House,
  BriefcaseBusiness,
  Landmark,
  HeartHandshake,
  Menu,
  MessageCircle,
  PanelLeftClose,
  Plus,
  Search,
  ShieldCheck,
  SquarePen,
  X,
} from 'lucide-react';
import type { ChatResponse, ChatTurn, PublicConfig } from '@lawcheck/contracts';

const topics = [
  {
    name: '부동산·임대차',
    icon: House,
    prompt: '계약이 끝났는데 집주인이 보증금을 돌려주지 않아요.',
  },
  {
    name: '노동·직장',
    icon: BriefcaseBusiness,
    prompt: '퇴사한 지 한 달이 지났는데 아직 급여를 받지 못했어요.',
  },
  {
    name: '민사·금전',
    icon: Landmark,
    prompt: '지인에게 빌려준 돈을 돌려받으려면 무엇부터 준비해야 하나요?',
  },
  {
    name: '가사·생활',
    icon: HeartHandshake,
    prompt: '상속과 관련해 가족끼리 의견이 다른데 어떻게 정리해야 할까요?',
  },
];
type Conversation = { id: string; title: string; updatedAt: string };
type Review = {
  id: string;
  sessionId: string;
  answerMessageId: string;
  question: string;
  selectedAnswerId: string | null;
  answers: {
    id: string;
    reply: string;
    unread: boolean;
    completedAt: string;
    expert: { name: string };
  }[];
};
type History = {
  sessionId?: string;
  remainingQuestions?: number | null;
  messages: {
    id: string;
    parentMessageId: string | null;
    role: string;
    content: string;
    messageType: string;
    processingStatus: string;
  }[];
};
const defaultConfig: PublicConfig = {
  officeName: '',
  mode: 'prototype',
  maxQuestions: 3,
  questionLimitEnabled: false,
};
async function api<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    signal,
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok || result.success === false)
    throw new Error(result.error?.message ?? '요청을 처리하지 못했어요. 다시 시도해 주세요.');
  return result.data;
}
function restoreTurns(history: History): ChatTurn[] {
  return history.messages
    .filter((m) => m.role === 'USER')
    .map((question) => {
      const answer = history.messages.find(
        (m) => m.parentMessageId === question.id && m.role === 'ASSISTANT',
      );
      return {
        id: question.id,
        question: question.content,
        answer:
          answer?.content ??
          (question.processingStatus === 'PROCESSING'
            ? '답변을 생성하고 있습니다. 잠시 후 대화를 다시 열어 주세요.'
            : '완료된 AI 답변이 없습니다. 다시 질문해 주세요.'),
        answerMessageId: answer?.id,
        isLegalQuestion: answer?.messageType === 'AI_ANSWER',
        requested: false,
        status: answer ? 'complete' : 'error',
      };
    });
}
function Dialog({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      focused?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`info-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState('draft');
  const currentIdRef = useRef('draft');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(
    () => window.matchMedia('(max-width: 760px)').matches,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('aiqaver.sidebar.collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [ready, setReady] = useState(false);
  const [quota, setQuota] = useState(3);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [resultScope, setResultScope] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [info, setInfo] = useState<'guide' | 'privacy' | null>(null);
  const [selectedTurn, setSelectedTurn] = useState<ChatTurn | null>(null);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  const latestTurn = useRef<HTMLElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const sidebar = useRef<HTMLElement>(null);
  const sidebarLogo = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const localDrafts = useRef(new Map<string, ChatTurn[]>());
  const logoOpensSidebar = sidebarCollapsed && !mobileViewport;
  const remaining = Math.max(0, quota - (loading ? 1 : 0));
  const limitReached = config.questionLimitEnabled && remaining === 0;
  const latestId = turns.at(-1)?.id;
  const latestStatus = turns.at(-1)?.status;
  const unreadCount = (items: Review[]) =>
    items.reduce(
      (sum, review) => sum + review.answers.filter((answer) => answer.unread !== false).length,
      0,
    );
  const totalUnread = unreadCount(reviews);
  const scopedReviews =
    resultScope === 'all' ? reviews : reviews.filter((review) => review.sessionId === resultScope);

  const refreshMetadata = useCallback(async (signal?: AbortSignal) => {
    await Promise.all([
      api<Conversation[]>('/chat/conversations', undefined, signal)
        .then((items) => {
          setConversations((previous) => [
            ...items,
            ...previous.filter(
              (item) =>
                item.id.startsWith('draft') && !items.some((remote) => remote.id === item.id),
            ),
          ]);
          setHistoryError('');
        })
        .catch(() => {
          if (!signal?.aborted) setHistoryError('대화 이력을 불러오지 못했어요.');
        }),
      api<Review[]>('/reviews', undefined, signal)
        .then((items) => {
          setReviews(items);
          setReviewError('');
        })
        .catch(() => {
          if (!signal?.aborted) setReviewError('검증 답변을 불러오지 못했어요. 새로고침해 주세요.');
        }),
    ]);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await api<PublicConfig>('/config', undefined, controller.signal);
        if (controller.signal.aborted) return;
        setConfig(data);
        setQuota(data.remainingQuestions ?? 3);
        try {
          const history = await api<History>('/chat/history', undefined, controller.signal);
          if (!controller.signal.aborted) {
            if (history.sessionId) {
              currentIdRef.current = history.sessionId;
              setCurrentId(history.sessionId);
            }
            setTurns(restoreTurns(history));
          }
        } catch {
          if (!controller.signal.aborted) setHistoryError('대화 이력을 불러오지 못했어요.');
        }
        await refreshMetadata(controller.signal);
      } catch {
        if (!controller.signal.aborted)
          setError('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        if (!controller.signal.aborted) setReady(true);
      }
    })();
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [refreshMetadata]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const refresh = () => {
      if (!document.hidden) void refreshMetadata(controller.signal);
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(interval);
      controller.abort();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [ready, refreshMetadata]);
  useEffect(() => {
    if (!latestId) return;
    const frame = requestAnimationFrame(() =>
      latestTurn.current?.scrollIntoView({ behavior: 'instant', block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [latestId, latestStatus]);
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 760px)');
    const sync = () => {
      setMobileViewport(viewport.matches);
      setSidebarOpen(false);
    };
    viewport.addEventListener('change', sync);
    return () => viewport.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('aiqaver.sidebar.collapsed', String(sidebarCollapsed));
    } catch {
      // Sidebar controls also work when browser storage is unavailable.
    }
  }, [sidebarCollapsed]);
  useEffect(() => {
    if (!sidebarOpen || !mobileViewport) return;
    sidebar.current?.querySelector<HTMLButtonElement>('.mobile-only')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        requestAnimationFrame(() => menuButton.current?.focus());
      }
      if (event.key !== 'Tab' || !window.matchMedia('(max-width: 760px)').matches) return;
      const elements = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, a') ?? [],
      ).filter((el) => el.getClientRects().length);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [sidebarOpen, mobileViewport]);

  async function newConversation() {
    if (loading || switching || !ready) return;
    setSwitching(true);
    setError('');
    localDrafts.current.set(currentIdRef.current, turns);
    try {
      const result = await api<{ sessionId?: string } | undefined>('/chat/session', {});
      const id = result?.sessionId ?? `draft-${crypto.randomUUID()}`;
      currentIdRef.current = id;
      setCurrentId(id);
      setTurns([]);
      setQuestion('');
      setQuota(3);
      setSidebarOpen(false);
      void refreshMetadata();
      requestAnimationFrame(() => composer.current?.focus());
    } catch (e) {
      setError(e instanceof Error ? e.message : '새 대화를 시작하지 못했어요.');
    } finally {
      setSwitching(false);
    }
  }
  async function openConversation(id: string) {
    if (loading || switching || id === currentId) {
      setSidebarOpen(false);
      return;
    }
    setSwitching(true);
    setError('');
    try {
      localDrafts.current.set(currentIdRef.current, turns);
      if (id.startsWith('draft')) {
        setTurns(localDrafts.current.get(id) ?? []);
      } else {
        const history = await api<History>(`/chat/conversations/${id}/select`, {});
        setTurns(restoreTurns(history));
        setQuota(history.remainingQuestions ?? 3);
      }
      currentIdRef.current = id;
      setCurrentId(id);
      setQuestion('');
      setSidebarOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '대화를 불러오지 못했어요.');
    } finally {
      setSwitching(false);
    }
  }
  async function sendQuestion(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || activeRequest.current || limitReached || switching || !ready) return;
    const text = question.trim();
    const id = crypto.randomUUID();
    const chatId = currentIdRef.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 70000);
    const history = turns
      .filter((turn) => turn.status === 'complete')
      .slice(-10)
      .map(({ question, answer }) => ({ question, answer }));
    setQuestion('');
    setLoading(true);
    setError('');
    setConversations((previous) => [
      {
        id: chatId,
        title: previous.find((chat) => chat.id === chatId)?.title ?? text,
        updatedAt: new Date().toISOString(),
      },
      ...previous.filter((chat) => chat.id !== chatId),
    ]);
    setTurns((previous) => [
      ...previous,
      { id, question: text, answer: '', requested: false, status: 'pending' },
    ]);
    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          history,
          ...(!chatId.startsWith('draft') ? { sessionId: chatId } : {}),
        }),
        signal: controller.signal,
      });
      const body: ChatResponse = await response.json();
      if (!body.success) {
        if (body.error.code === 'QUESTION_LIMIT_REACHED') setQuota(0);
        throw new Error(body.error.message);
      }
      if (!response.ok || !body.data.answer?.trim())
        throw new Error('답변을 받지 못했어요. 다시 시도해 주세요.');
      setQuota((previous) => body.data.remainingQuestions ?? Math.max(0, previous - 1));
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === id
            ? {
                ...turn,
                answer: body.data.answer,
                answerMessageId: body.data.answerMessageId,
                isLegalQuestion: body.data.isLegalQuestion === true,
                status: 'complete',
              }
            : turn,
        ),
      );
      if (body.data.sessionId && body.data.sessionId !== chatId) {
        currentIdRef.current = body.data.sessionId;
        setCurrentId(body.data.sessionId);
        setConversations((previous) =>
          previous.map((chat) =>
            chat.id === chatId ? { ...chat, id: body.data.sessionId! } : chat,
          ),
        );
      }
      void refreshMetadata();
    } catch (e) {
      const message = controller.signal.aborted
        ? '답변 시간이 길어지고 있어요. 다시 시도해 주세요.'
        : e instanceof Error
          ? e.message
          : '서버에 연결하지 못했어요.';
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === id ? { ...turn, answer: message, status: 'error' } : turn,
        ),
      );
      setQuestion(text);
    } finally {
      clearTimeout(timeout);
      activeRequest.current = null;
      setLoading(false);
      requestAnimationFrame(() => composer.current?.focus());
    }
  }
  async function markRead(items: Review[]) {
    await Promise.all(
      items.map(async (review) => {
        const answerIds = review.answers
          .filter((answer) => answer.unread !== false)
          .map((answer) => answer.id);
        if (!answerIds.length) return;
        try {
          await api(`/reviews/${review.id}/read`, { answerIds });
          setReviews((previous) =>
            previous.map((item) =>
              item.id === review.id
                ? {
                    ...item,
                    answers: item.answers.map((answer) =>
                      answerIds.includes(answer.id) ? { ...answer, unread: false } : answer,
                    ),
                  }
                : item,
            ),
          );
        } catch {
          setReviewError('읽음 상태를 저장하지 못했어요. 다시 열면 알림이 남아 있을 수 있어요.');
        }
      }),
    );
  }
  function openResults(scope: string) {
    setResultScope(scope);
    setSidebarOpen(false);
    setReviewError('');
    void markRead(
      scope === 'all' ? reviews : reviews.filter((review) => review.sessionId === scope),
    );
  }
  async function selectAnswer(postId: string, answerId: string) {
    if (selecting) return;
    setSelecting(true);
    setReviewError('');
    try {
      const data = await api<{ selectedAnswerId: string }>(`/reviews/${postId}/selection`, {
        answerId,
      });
      setReviews((previous) =>
        previous.map((review) =>
          review.id === postId ? { ...review, selectedAnswerId: data.selectedAnswerId } : review,
        ),
      );
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : '답변을 선택하지 못했어요.');
    } finally {
      setSelecting(false);
    }
  }
  function openVerification(turn: ChatTurn) {
    setSelectedTurn(turn);
    setEmail('');
    setConsent(false);
    setSubmitted(false);
    setVerificationError('');
  }
  async function submitVerification(event: FormEvent) {
    event.preventDefault();
    if (!selectedTurn || !consent || submitting) return;
    setSubmitting(true);
    setVerificationError('');
    try {
      await api('/reviews', { answerMessageId: selectedTurn.answerMessageId, email, consent });
      setSubmitted(true);
      setTurns((previous) =>
        previous.map((turn) => (turn.id === selectedTurn.id ? { ...turn, requested: true } : turn)),
      );
      void refreshMetadata();
    } catch (e) {
      setVerificationError(e instanceof Error ? e.message : '접수하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  }
  const chatList = conversations.filter((chat) =>
    chat.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <button
        className={`nav-backdrop ${sidebarOpen ? 'active' : ''}`}
        aria-label="메뉴 닫기"
        aria-hidden={!sidebarOpen}
        tabIndex={-1}
        onClick={() => setSidebarOpen(false)}
      />
      <div className={`sidebar-slot ${sidebarCollapsed ? 'compact' : ''}`}>
        <aside
          ref={sidebar}
          id="conversation-sidebar"
          className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}
          aria-label="대화 이력"
          aria-hidden={mobileViewport && !sidebarOpen ? true : undefined}
          inert={mobileViewport && !sidebarOpen}
        >
          <div className="sidebar-brand">
            <button
              ref={sidebarLogo}
              className="sidebar-logo"
              aria-label={logoOpensSidebar ? '대화 메뉴 열기' : 'AI QAVER 새 대화 시작'}
              aria-expanded={logoOpensSidebar ? false : undefined}
              aria-controls={logoOpensSidebar ? 'conversation-sidebar' : undefined}
              disabled={!logoOpensSidebar && (loading || switching || !ready)}
              onClick={() => {
                if (logoOpensSidebar) setSidebarCollapsed(false);
                else void newConversation();
              }}
            >
              <img className="brand-logo" src="/brand/aiqaver-logo.png" alt="AI QAVER" />
              <img className="brand-symbol" src="/brand/aiqaver-symbol.png" alt="AI QAVER" />
            </button>
            <button
              className="icon-button sidebar-toggle desktop-only"
              aria-label="사이드바 접기"
              title="사이드바 접기"
              aria-expanded={!sidebarCollapsed}
              aria-controls="conversation-sidebar"
              onClick={() => {
                setSidebarCollapsed(true);
                sidebarLogo.current?.focus();
              }}
            >
              <PanelLeftClose size={20} />
            </button>
            <button
              className="icon-button mobile-only"
              aria-label="사이드바 닫기"
              onClick={() => {
                setSidebarOpen(false);
                requestAnimationFrame(() => menuButton.current?.focus());
              }}
            >
              <PanelLeftClose size={20} />
            </button>
          </div>
          <button
            className="sidebar-action new-chat"
            aria-label="새로운 질문 시작하기"
            title="새 대화"
            disabled={loading || switching || !ready}
            onClick={() => void newConversation()}
          >
            <SquarePen size={19} />
            <span className="sidebar-text">새 대화</span>
            <Plus size={16} className="new-chat-plus" />
          </button>
          <button
            className="sidebar-action sidebar-search-toggle"
            aria-label="대화 검색 열기"
            title="대화 검색"
            onClick={() => {
              setSidebarCollapsed(false);
              requestAnimationFrame(() => searchInput.current?.focus());
            }}
          >
            <Search size={19} />
          </button>
          <div className="search-field">
            <Search size={17} />
            <input
              ref={searchInput}
              aria-label="대화 검색"
              placeholder="대화 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="sidebar-action review-inbox"
            aria-label="검증 답변"
            title="검증 답변"
            onClick={() => openResults('all')}
          >
            <ShieldCheck size={19} />
            <span className="sidebar-text">검증 답변</span>
            {totalUnread > 0 && (
              <span
                className="notification-badge"
                aria-label={`읽지 않은 검증 답변 ${totalUnread}개`}
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
          <div className="history-label">
            내 대화<span>{conversations.length}</span>
          </div>
          <nav className="history-list" aria-label="저장된 대화">
            {!chatList.length && (
              <p className="history-empty">
                {search ? '검색 결과가 없어요.' : '첫 질문을 남겨보세요.\n대화가 이곳에 쌓입니다.'}
              </p>
            )}
            {chatList.map((chat) => {
              const results = reviews.filter((review) => review.sessionId === chat.id);
              const unread = unreadCount(results);
              return (
                <div
                  className={`history-row ${currentId === chat.id ? 'active' : ''}`}
                  key={chat.id}
                >
                  <button
                    className="history-title"
                    title={chat.title}
                    aria-current={currentId === chat.id ? 'page' : undefined}
                    disabled={loading || switching}
                    onClick={() => void openConversation(chat.id)}
                  >
                    <MessageCircle size={16} />
                    <span>{chat.title}</span>
                  </button>
                  {results.length > 0 && (
                    <button
                      className={`review-notification ${unread ? 'notification-badge' : ''}`}
                      aria-label={`${chat.title} 검증 결과${unread ? ` 새 답변 ${unread}개` : ' 보기'}`}
                      onClick={() => openResults(chat.id)}
                    >
                      {unread ? unread > 99 ? '99+' : unread : <FileCheck2 size={16} />}
                    </button>
                  )}
                </div>
              );
            })}
          </nav>
          {(historyError || reviewError) && (
            <button className="sidebar-retry" onClick={() => void refreshMetadata()}>
              연결을 확인해 주세요 · 다시 시도
            </button>
          )}
          <div className="sidebar-footer">
            <button
              aria-label="이용 방법"
              title="이용 방법"
              onClick={() => {
                setSidebarOpen(false);
                setInfo('guide');
              }}
            >
              <CircleHelp size={17} />
              <span className="sidebar-text">이용 방법</span>
            </button>
            <button
              aria-label="개인정보 안내"
              title="개인정보 안내"
              onClick={() => {
                setSidebarOpen(false);
                setInfo('privacy');
              }}
            >
              <ShieldCheck size={17} />
              <span className="sidebar-text">개인정보 안내</span>
            </button>
            <small>같은 브라우저에서 이력이 유지됩니다.</small>
          </div>
        </aside>
      </div>
      <div
        className={`main-shell ${turns.length ? 'has-conversation' : 'workspace-empty'}`}
        inert={mobileViewport && sidebarOpen}
      >
        <header className="topbar">
          <div>
            <button
              ref={menuButton}
              className="icon-button mobile-only"
              aria-label="대화 메뉴 열기"
              aria-expanded={sidebarOpen}
              aria-controls="conversation-sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
          </div>
          <div className="header-actions">
            <button
              className="icon-button mobile-only"
              aria-label="이용 방법"
              onClick={() => setInfo('guide')}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="icon-button mobile-only"
              aria-label="새로운 질문 시작하기"
              disabled={loading || switching || !ready}
              onClick={() => void newConversation()}
            >
              <SquarePen size={19} />
            </button>
            <button
              className="header-notifications icon-button"
              aria-label={`검증 알림 ${totalUnread}개`}
              onClick={() => openResults('all')}
            >
              <Bell size={19} />
              {totalUnread > 0 && (
                <span className="notification-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
              )}
            </button>
          </div>
        </header>
        <main className="conversation-pane" aria-busy={switching}>
          <div className="chat-scroll">
            {error && (
              <p className="page-error" role="alert">
                {error}
              </p>
            )}
            {!turns.length ? (
              <section className="hero">
                <h1>
                  법률이 궁금할 때,
                  <br />
                  <span>AI에게 물어보세요.</span>
                </h1>
                <p>
                  <strong className="hero-verification">변호사가 검증해드립니다.</strong>
                  법률 고민은 AI와 먼저 정리하고,
                  <br /> 원하는 답변은 변호사에게 검증을 요청하세요.
                </p>
              </section>
            ) : (
              <section className="conversation" aria-label="AI 대화" aria-live="polite">
                {turns.map((turn) => {
                  const requested =
                    turn.requested ||
                    reviews.some((review) => review.answerMessageId === turn.answerMessageId);
                  return (
                    <article
                      className="turn"
                      key={turn.id}
                      ref={turn.id === latestId ? latestTurn : undefined}
                    >
                      <div className="user-message">{turn.question}</div>
                      <div className="assistant-message">
                        <span className="assistant-avatar">
                          <img src="/brand/aiqaver-symbol.png" alt="AI QAVER" />
                        </span>
                        <div className="assistant-body">
                          <div className="assistant-name">
                            AI QAVER<span>AI 답변</span>
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
                              className={`verify-button ${requested ? 'requested' : ''}`}
                              onClick={() =>
                                requested ? openResults(currentId) : openVerification(turn)
                              }
                            >
                              {requested ? <Check size={15} /> : <ShieldCheck size={15} />}
                              {requested ? '검증 답변 확인' : '전문가에게 검증 요청'}
                              <ArrowRight size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
          <section className="composer-section" aria-label="질문 작성">
            <form className="composer" onSubmit={sendQuestion}>
              <label htmlFor="question" className="sr-only">
                질문
              </label>
              <textarea
                id="question"
                ref={composer}
                value={question}
                maxLength={2000}
                disabled={loading || switching || limitReached || !ready}
                rows={2}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  limitReached
                    ? '이번 대화의 질문을 모두 사용했어요. 새 대화를 시작해 주세요.'
                    : '궁금한 점을 편하게 물어보세요.'
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
                  <img src="/brand/openai.svg" alt="" />
                  AI 답변
                  <ChevronDown size={13} />
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
                    disabled={!question.trim() || loading || switching || limitReached || !ready}
                    aria-label="질문 보내기"
                  >
                    <ArrowUp size={21} />
                  </button>
                </div>
              </div>
            </form>
            <p className="composer-notice">
              AI 답변은 정확하지 않을 수 있어요. 중요한 내용은 전문가의 검증을 받아보세요.
            </p>
          </section>
          {!turns.length && (
            <>
              <div className="topic-grid">
                {topics.map(({ name, icon: Icon, prompt }) => (
                  <button
                    key={name}
                    className="topic-card"
                    onClick={() => {
                      setQuestion(prompt);
                      composer.current?.focus();
                    }}
                  >
                    <Icon size={16} />
                    {name}
                  </button>
                ))}
              </div>
              <section className="content-ad-slot" aria-label="광고 영역">
                <span>AD</span>
                <img
                  src="/ads/legal-service-banner.png"
                  alt="광고: 어려운 법률문제, 박종학 변호사와 함께 해결해보세요. 전화 02-862-9905"
                  width={800}
                  height={175}
                />
              </section>
            </>
          )}
        </main>
      </div>
      {resultScope && (
        <Dialog title="검증 답변" className="results-dialog" onClose={() => setResultScope(null)}>
          <section className="review-results" aria-label="검증 결과">
            <div className="results-intro">
              <span>
                <ShieldCheck size={18} />
                전문가의 의견을 비교해 보세요.
              </span>
              <button
                disabled={selecting}
                onClick={async () => {
                  await refreshMetadata();
                }}
              >
                새로고침
              </button>
            </div>
            {reviewError && (
              <p role="alert" className="page-error">
                {reviewError}
              </p>
            )}
            {!scopedReviews.length && (
              <div className="results-empty">
                <FileCheck2 size={34} />
                <h3>아직 검증 요청이 없어요.</h3>
                <p>AI 답변 아래에서 전문가에게 검증을 요청해 보세요.</p>
              </div>
            )}
            {scopedReviews.map((review) => (
              <article className="review-request" key={review.id}>
                <div className="review-question">
                  <span>질문</span>
                  <h3>{review.question}</h3>
                </div>
                <p className="review-count">
                  {review.answers.length
                    ? `검증 답변 ${review.answers.length}개 · 가장 도움이 되는 답변 하나를 선택하세요.`
                    : '검증 답변을 기다리고 있어요. 도착하면 빨간 숫자로 알려드릴게요.'}
                </p>
                {review.answers.map((answer, index) => (
                  <div
                    key={answer.id}
                    className={`review-answer ${review.selectedAnswerId === answer.id ? 'selected-answer' : ''}`}
                  >
                    <div className="review-answer-heading">
                      <strong>검증 답변 {index + 1}</strong>
                      {review.selectedAnswerId === answer.id && (
                        <span role="status">
                          <Check size={14} />
                          선택한 답변
                        </span>
                      )}
                    </div>
                    <p className="review-reply">{answer.reply}</p>
                    <small>
                      {answer.expert.name} · {new Date(answer.completedAt).toLocaleString('ko-KR')}
                    </small>
                    <button
                      type="button"
                      aria-pressed={review.selectedAnswerId === answer.id}
                      disabled={selecting || review.selectedAnswerId === answer.id}
                      onClick={() => void selectAnswer(review.id, answer.id)}
                    >
                      {review.selectedAnswerId === answer.id ? '선택 완료' : '이 답변 선택'}
                    </button>
                  </div>
                ))}
              </article>
            ))}
          </section>
        </Dialog>
      )}
      {selectedTurn && (
        <Dialog
          title="전문가 검증 요청"
          className="verification-drawer"
          onClose={() => {
            if (!submitting) setSelectedTurn(null);
          }}
        >
          {submitted ? (
            <div className="submission-success">
              <span className="success-icon">
                <Check size={28} />
              </span>
              <h2>검증 요청이 접수되었습니다.</h2>
              <p>답변이 도착하면 왼쪽 대화 이력에 빨간 숫자로 알려드려요.</p>
              <button className="primary-button" onClick={() => setSelectedTurn(null)}>
                대화로 돌아가기
              </button>
            </div>
          ) : (
            <form className="verification-form" onSubmit={submitVerification}>
              <p>선택한 질문과 AI 답변을 전문가에게 전달합니다.</p>
              <div className="selected-question">
                <span>검증을 요청할 질문</span>
                <p>{selectedTurn.question}</p>
              </div>
              <label htmlFor="request-email">연락 이메일</label>
              <input
                id="request-email"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
              />
              <label className="consent-label">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  선택한 질문·AI 답변과 이메일을 저장하고, 답변자에게 질문과 AI 답변을 제공하는 데
                  동의합니다.
                </span>
              </label>
              <p className="field-hint">검증 답변은 왼쪽 검증 답변 메뉴에서 확인할 수 있어요.</p>
              {verificationError && (
                <p role="alert" className="page-error">
                  {verificationError}
                </p>
              )}
              <button className="primary-button full-width" disabled={submitting}>
                {submitting ? '접수 중…' : '검증 요청하기'}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </Dialog>
      )}
      {info && (
        <Dialog
          title={info === 'guide' ? '전문가 검증, 이렇게 진행돼요' : '개인정보 안내'}
          onClose={() => setInfo(null)}
        >
          {info === 'guide' ? (
            <ol className="guide-steps">
              <li>
                <strong>AI에게 질문하세요.</strong>
                <p>대화는 왼쪽 이력에 저장되어 다시 이어갈 수 있어요.</p>
              </li>
              <li>
                <strong>필요한 답변을 검증 요청하세요.</strong>
                <p>AI 답변 아래 버튼으로 전문가의 의견을 받아보세요.</p>
              </li>
              <li>
                <strong>빨간 숫자를 확인하세요.</strong>
                <p>새 검증 답변이 도착하면 알려드려요. 여러 의견을 비교하고 하나를 선택하세요.</p>
              </li>
            </ol>
          ) : (
            <div className="info-prose">
              <p>
                질문과 대화는 AI 답변 생성을 위해 OpenAI에 전달되며 서버에 저장됩니다. 검증 요청 시
                선택한 질문·답변과 연락 이메일도 저장됩니다.
              </p>
              <p>
                브라우저 식별 쿠키는 30일 동안 유지됩니다. 쿠키를 삭제하거나 다른 브라우저를
                사용하면 이전 이력을 조회할 수 없습니다. 공용 기기에서 개인정보를 입력하지 마세요.
              </p>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
