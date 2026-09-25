import { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api } from './api';
import { BoardDetail } from './BoardDetail';

type Summary = {
  id: string;
  title: string;
  createdAt: string;
  author: { id: string; name: string };
  _count: { replies: number };
};
type Detail = Summary & {
  content: string;
  page: number;
  replies: { id: string; content: string; createdAt: string; author: { name: string } }[];
};
type Board = { items: Summary[]; page: number; total: number };
type DashboardData = {
  reviewCount: number;
  communityCount: number;
  reviews: { id: string; question: string; status: string; createdAt: string }[];
  bestPosts: Summary[];
};
const date = (value: string) => new Date(value).toLocaleString('ko-KR');
const labels: Record<string, string> = {
  REQUESTED: '검증 대기',
  REVIEWING: '검증 중',
  COMPLETED: '검증완료',
};
function PostRow({ post, onOpen }: { post: Summary; onOpen: (id: string) => void }) {
  return (
    <button className="board-row" onClick={() => onOpen(post.id)}>
      <span className="row-content">
        <strong>{post.title}</strong>
        <small>
          {post.author.name} · {date(post.createdAt)} · 답글 {post._count.replies}
        </small>
      </span>
      <ArrowRight size={18} />
    </button>
  );
}
function Pagination({
  page,
  total,
  busy,
  onPage,
}: {
  page: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="게시판 페이지">
      <button disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
        이전
      </button>
      <span>
        {page} / {Math.max(1, Math.ceil(total / 20))}
      </span>
      <button disabled={busy || page * 20 >= total} onClick={() => onPage(page + 1)}>
        다음
      </button>
    </nav>
  );
}
export function Dashboard({
  onError,
  onClearError,
  onReview,
  onCommunity,
  onNavigate,
}: {
  onError: (e: unknown) => void;
  onClearError: () => void;
  onReview: (id: string) => void;
  onCommunity: (id: string) => void;
  onNavigate: (section: 'reviews' | 'community') => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    api<DashboardData>('/dashboard')
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e: unknown) => {
        if (active) onError(e);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
    // onError belongs to the parent; reload only on explicit refresh.
  }, [version]);
  return (
    <>
      <div className="board-heading">
        <div>
          <span className="eyebrow">MY WORKSPACE</span>
          <h1>대시보드</h1>
          <p>새로운 검증 요청과 커뮤니티 소식을 한눈에 확인하세요.</p>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            onClearError();
            setVersion(version + 1);
          }}
        >
          <RefreshCw size={16} />
          새로고침
        </button>
      </div>
      {busy ? (
        <p role="status" className="empty">
          대시보드를 불러오는 중입니다.
        </p>
      ) : data ? (
        <>
          <div className="dashboard-stats">
            <div>
              <span>전체 검증요청</span>
              <strong>{data.reviewCount.toLocaleString()}건</strong>
            </div>
            <div>
              <span>커뮤니티 게시글</span>
              <strong>{data.communityCount.toLocaleString()}개</strong>
            </div>
          </div>
          <div className="dashboard-grid">
            <section className="dashboard-panel">
              <div className="panel-heading">
                <h2>최신 검증요청</h2>
                <button onClick={() => onNavigate('reviews')}>전체 보기</button>
              </div>
              <p className="muted">최근 등록된 요청 5건</p>
              <div className="board-list">
                {data.reviews.length ? (
                  data.reviews.map((post) => (
                    <button className="board-row" key={post.id} onClick={() => onReview(post.id)}>
                      <span className={`badge ${post.status}`}>{labels[post.status]}</span>
                      <span className="row-content">
                        <strong>{post.question}</strong>
                        <small>{date(post.createdAt)}</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="empty">아직 검증 요청이 없습니다.</p>
                )}
              </div>
            </section>
            <section className="dashboard-panel">
              <div className="panel-heading">
                <h2>커뮤니티 베스트글</h2>
                <button onClick={() => onNavigate('community')}>전체 보기</button>
              </div>
              <p className="muted">답글 많은 순 5건 · 답글 수가 같으면 최신순</p>
              <div className="board-list">
                {data.bestPosts.length ? (
                  data.bestPosts.map((post) => (
                    <PostRow key={post.id} post={post} onOpen={onCommunity} />
                  ))
                ) : (
                  <p className="empty">첫 커뮤니티 글을 작성해 보세요.</p>
                )}
              </div>
            </section>
          </div>
        </>
      ) : (
        <p className="empty">대시보드를 불러오지 못했습니다. 새로고침해 주세요.</p>
      )}
    </>
  );
}
export function Community({
  initialId,
  onError,
  onClearError,
}: {
  initialId: string | null;
  onError: (e: unknown) => void;
  onClearError: () => void;
}) {
  const [board, setBoard] = useState<Board>({ items: [], page: 1, total: 0 });
  const [post, setPost] = useState<Detail | null>(null);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    const request = initialId
      ? api<Detail>(`/community/${initialId}`).then((next) => {
          if (active) setPost(next);
        })
      : api<Board>('/community').then((next) => {
          if (active) setBoard(next);
        });
    request
      .catch((e: unknown) => {
        if (active) onError(e);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [initialId]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    onClearError();
    setBusy(true);
    setNotice('');
    try {
      await action();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  function list(page = 1) {
    void run(async () => {
      setBoard(await api<Board>(`/community?page=${page}`));
      setPost(null);
      setWriting(false);
      setReply('');
    });
  }
  function open(id: string, page = 1) {
    void run(async () => {
      setPost(await api<Detail>(`/community/${id}?page=${page}`));
      setReply('');
    });
  }
  return (
    <section aria-busy={busy}>
      <div className="board-heading">
        <div>
          <span className="eyebrow">COMMUNITY</span>
          <h1>커뮤니티</h1>
          <p>경험과 생각을 나누고 답글로 대화해 보세요.</p>
        </div>
        {!writing && !post && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setWriting(true);
              setNotice('');
            }}
          >
            글쓰기
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {busy && <p role="status">불러오는 중입니다.</p>}
      {writing ? (
        <form
          className="content-card community-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const saved = await api<{ id: string }>('/community', { title, content: body });
              setTitle('');
              setBody('');
              setWriting(false);
              setPost(await api<Detail>(`/community/${saved.id}`));
              setNotice('게시글을 등록했습니다.');
            });
          }}
        >
          <h2>게시글 쓰기</h2>
          <label>
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              disabled={busy}
            />
          </label>
          <label>
            내용
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={20000}
              rows={10}
              required
              disabled={busy}
            />
          </label>
          <div className="detail-actions">
            <button type="button" disabled={busy} onClick={() => setWriting(false)}>
              취소
            </button>
            <button className="primary" disabled={busy || !title.trim() || !body.trim()}>
              게시글 등록
            </button>
          </div>
        </form>
      ) : post ? (
        <BoardDetail busy={busy} onBack={() => list(board.page)}>
          <button className="back" disabled={busy} onClick={() => list(board.page)}>
            ← 목록으로
          </button>
          <article className="content-card">
            <h2 className="community-title">{post.title}</h2>
            <p className="muted">
              {post.author.name} · {date(post.createdAt)}
            </p>
            <p className="prose">{post.content}</p>
          </article>
          <section className="content-card">
            <h2>답글 {post._count.replies}개</h2>
            {post.replies.length ? (
              post.replies.map((item) => (
                <article className="community-reply" key={item.id}>
                  <p className="muted">
                    {item.author.name} · {date(item.createdAt)}
                  </p>
                  <p className="prose">{item.content}</p>
                </article>
              ))
            ) : (
              <p className="muted">첫 답글을 남겨 주세요.</p>
            )}
            {post._count.replies > 20 && (
              <Pagination
                page={post.page}
                total={post._count.replies}
                busy={busy}
                onPage={(page) => open(post.id, page)}
              />
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await api(`/community/${post.id}/replies`, { content: reply });
                  setReply('');
                  const fresh = await api<Detail>(`/community/${post.id}`);
                  const lastPage = Math.max(1, Math.ceil(fresh._count.replies / 20));
                  setPost(
                    lastPage === 1
                      ? fresh
                      : await api<Detail>(`/community/${post.id}?page=${lastPage}`),
                  );
                  setNotice('답글을 등록했습니다.');
                });
              }}
            >
              <label>
                답글 작성
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={5000}
                  rows={4}
                  required
                  disabled={busy}
                />
              </label>
              <div className="detail-actions">
                <button className="primary" disabled={busy || !reply.trim()}>
                  답글 등록
                </button>
              </div>
            </form>
          </section>
        </BoardDetail>
      ) : (
        <>
          <div className="board-toolbar">
            <span className="muted">총 {board.total}개 · 최신순</span>
            <button disabled={busy} onClick={() => list(board.page)}>
              <RefreshCw size={16} />
              새로고침
            </button>
          </div>
          <div className="board-list">
            {board.items.length
              ? board.items.map((item) => <PostRow key={item.id} post={item} onOpen={open} />)
              : !busy && <p className="empty">아직 게시글이 없습니다. 첫 글을 작성해 보세요.</p>}
          </div>
          <Pagination page={board.page} total={board.total} busy={busy} onPage={list} />
        </>
      )}
    </section>
  );
}
