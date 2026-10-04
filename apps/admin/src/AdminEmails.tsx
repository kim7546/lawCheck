import { useEffect, useState } from 'react';
import type { AdminEmailDetail, AdminEmailsPage, AnswerEmailStatus } from '@lawcheck/contracts';
import { adminApi } from './api';
const statuses: Record<AnswerEmailStatus, string> = {
  QUEUED: '발송 대기',
  SENDING: '발송 중',
  RETRY: '재시도 대기',
  SENT: '발송 완료',
  FAILED: '실패',
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '—';
export function AdminEmails({ onError }: { onError: (error: unknown) => void }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<AdminEmailsPage | null>(null);
  const [detail, setDetail] = useState<AdminEmailDetail | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    setData(null);
    setDetail(null);
    const path = selected ? `/emails/${selected}` : `/emails?${query}&page=${page}`;
    adminApi<AdminEmailsPage | AdminEmailDetail>(path)
      .then((result) => {
        if (!active) return;
        if (selected) setDetail(result as AdminEmailDetail);
        else setData(result as AdminEmailsPage);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : '조회에 실패했습니다.');
          onError(cause);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [query, page, reload, selected, onError]);
  return (
    <>
      <p>발송 완료는 메일 서비스 접수 성공을 의미합니다.</p>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {selected ? (
        <section className="admin-panel admin-email-detail">
          <div className="admin-panel-toolbar">
            <h2>이메일 발송 상세</h2>
            <button disabled={retrying} onClick={() => setSelected('')}>
              목록으로
            </button>
            <button disabled={busy || retrying} onClick={() => setReload((n) => n + 1)}>
              새로고침
            </button>
          </div>
          {detail && (
            <>
              <dl>
                <dt>수신 이메일</dt>
                <dd>{detail.recipient}</dd>
                <dt>제목</dt>
                <dd>{detail.subject}</dd>
                <dt>상태</dt>
                <dd>{statuses[detail.status]}</dd>
                <dt>등록 일시</dt>
                <dd>{date(detail.createdAt)}</dd>
                <dt>발송 일시</dt>
                <dd>{date(detail.sentAt)}</dd>
                <dt>최근 오류</dt>
                <dd>{detail.lastErrorCode ?? '—'}</dd>
                <dt>답변 링크 만료</dt>
                <dd>{date(detail.linkExpiresAt)}</dd>
              </dl>
              <h3>발송 본문</h3>
              <pre className="admin-email-body">{detail.body}</pre>
              {detail.status === 'FAILED' && (
                <button
                  className="primary"
                  disabled={retrying || busy}
                  onClick={async () => {
                    setRetrying(true);
                    setError('');
                    try {
                      await adminApi(`/emails/${detail.id}/retry`, { version: detail.version });
                      setReload((n) => n + 1);
                    } catch (cause) {
                      setError(
                        cause instanceof Error ? cause.message : '재발송 요청에 실패했습니다.',
                      );
                      onError(cause);
                    } finally {
                      setRetrying(false);
                    }
                  }}
                >
                  {retrying ? '요청 중…' : '재발송 요청'}
                </button>
              )}
              <h3>발송 시도 이력</h3>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>회차</th>
                      <th>상태</th>
                      <th>시작</th>
                      <th>종료</th>
                      <th>오류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>{attempt.attemptNo}</td>
                        <td>{statuses[attempt.status]}</td>
                        <td>{date(attempt.startedAt)}</td>
                        <td>{date(attempt.finishedAt)}</td>
                        <td>{attempt.errorCode ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!detail.attempts.length && <p>아직 발송 시도가 없습니다.</p>}
            </>
          )}
        </section>
      ) : (
        <>
          <form
            className="admin-question-filters"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const params = new URLSearchParams();
              for (const key of ['q', 'status', 'from', 'to']) {
                const value = String(form.get(key) ?? '').trim();
                if (value) params.set(key, value);
              }
              setQuery(params.toString());
              setPage(1);
              setReload((n) => n + 1);
            }}
          >
            <label>
              검색어
              <input name="q" placeholder="수신 이메일 또는 제목" maxLength={254} />
            </label>
            <label>
              상태
              <select
                name="status"
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              >
                <option value="">전체</option>
                {Object.entries(statuses).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              시작일
              <input
                type="date"
                name="from"
                value={filters.from}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
            </label>
            <label>
              종료일
              <input
                type="date"
                name="to"
                value={filters.to}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
            </label>
            <button className="primary" disabled={busy}>
              조회
            </button>
            <button type="button" disabled={busy} onClick={() => setReload((n) => n + 1)}>
              새로고침
            </button>
          </form>
          {data && (
            <section className="admin-panel">
              <div className="admin-panel-toolbar">
                <h2>발송 이력</h2>
                <span>총 {data.total.toLocaleString('ko-KR')}건</span>
              </div>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>수신 이메일</th>
                      <th>제목</th>
                      <th>상태</th>
                      <th>시도</th>
                      <th>등록 일시</th>
                      <th>발송 일시</th>
                      <th>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.recipient}</td>
                        <td>{item.subject}</td>
                        <td>{statuses[item.status]}</td>
                        <td>{item.attemptCount}</td>
                        <td>{date(item.createdAt)}</td>
                        <td>{date(item.sentAt)}</td>
                        <td>
                          <button
                            onClick={() => setSelected(item.id)}
                            aria-label={`${item.recipient} 발송 상세`}
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.items.length && (
                <p className="admin-empty">조회 조건에 해당하는 발송 이력이 없습니다.</p>
              )}
              <div className="admin-pagination">
                <button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>
                  이전
                </button>
                <span>
                  {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                <button
                  disabled={page * data.pageSize >= data.total || busy}
                  onClick={() => setPage(page + 1)}
                >
                  다음
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {busy && <p role="status">발송 이력을 불러오고 있습니다.</p>}
    </>
  );
}
