import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import {
  questionTopics,
  type AdminQuestionsPage,
  type AdminQuestionStatistics as Statistics,
  type QuestionTopic,
} from '@lawcheck/contracts';
import { adminApi } from './api';

const koreaToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const defaultQuery = () => `year=${koreaToday().slice(0, 4)}`;
const number = (value: number) => value.toLocaleString('ko-KR');
const topicLabel = (topic: QuestionTopic) =>
  questionTopics.find((item) => item.code === topic)?.label ?? '기타·미분류';
const dateTime = (value: string) =>
  new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const statuses = {
  RECEIVED: '접수',
  PROCESSING: '답변 생성 중',
  COMPLETED: '답변 완료',
  FAILED: '답변 생성 실패',
};
const classificationNote =
  '질문 키워드로 자동 분류하며 복합 주제는 한 항목에만 집계합니다. 분류가 어려운 질문은 기타·미분류에 포함됩니다.';
type Props = { onError: (error: unknown) => void };

function useQuestionData<T>(path: string, onError: Props['onError']) {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setData(null);
    setError('');
    adminApi<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : '조회에 실패했습니다. 다시 시도해 주세요.',
          );
          onError(cause);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [path, reload, onError]);
  return { data, busy, error, refresh: () => setReload((value) => value + 1) };
}

function QuestionFilters({
  busy,
  onApply,
  onRefresh,
}: {
  busy: boolean;
  onApply: (query: string) => void;
  onRefresh: () => void;
}) {
  const [mode, setMode] = useState('year');
  const [year, setYear] = useState(() => koreaToday().slice(0, 4));
  const [startDate, setStartDate] = useState(() => `${koreaToday().slice(0, 4)}-01-01`);
  const [endDate, setEndDate] = useState(koreaToday);
  const [error, setError] = useState('');
  return (
    <>
      <form
        className="admin-question-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          if (mode === 'dates' && startDate > endDate) {
            setError('시작일은 종료일보다 늦을 수 없습니다.');
            return;
          }
          const params =
            mode === 'year'
              ? new URLSearchParams({ year })
              : new URLSearchParams({ startDate, endDate });
          onApply(params.toString());
        }}
      >
        <label>
          조회 기준
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setError('');
            }}
          >
            <option value="year">년도별</option>
            <option value="dates">일자별</option>
          </select>
        </label>
        {mode === 'year' ? (
          <label>
            년도
            <input
              type="number"
              min="1900"
              max="9999"
              required
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              시작일
              <input
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              종료일
              <input
                type="date"
                required
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </>
        )}
        <button className="primary" disabled={busy}>
          <Search size={16} />
          조회
        </button>
        <button type="button" disabled={busy} onClick={onRefresh}>
          <RefreshCw size={16} />
          새로고침
        </button>
      </form>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
    </>
  );
}

export function AdminQuestions({ onError }: Props) {
  const [query, setQuery] = useState(defaultQuery);
  const [page, setPage] = useState(1);
  const { data, busy, error, refresh } = useQuestionData<AdminQuestionsPage>(
    `/questions?${query}&page=${page}`,
    onError,
  );
  return (
    <>
      <QuestionFilters
        busy={busy}
        onRefresh={refresh}
        onApply={(next) => {
          setQuery(next);
          setPage(1);
          refresh();
        }}
      />
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {busy ? (
        <p role="status" className="admin-loading">
          질문과 답변을 불러오는 중입니다.
        </p>
      ) : (
        data && (
          <>
            <div className="admin-question-summary">
              <strong>전체 질문 {number(data.total)}건</strong>
              <span className="admin-meta">
                {data.startDate} ~ {data.endDate} · 질문 접수일 · 한국 시간 기준
              </span>
            </div>
            <p className="admin-meta">{classificationNote}</p>
            {!data.items.length ? (
              <p className="admin-loading">조회 기간에 접수된 질문이 없습니다.</p>
            ) : (
              <div className="admin-question-list">
                {data.items.map((item) => (
                  <article
                    className="admin-panel admin-question-card"
                    key={item.id}
                    aria-label="질문과 답변"
                  >
                    <div className="admin-panel-toolbar">
                      <div className="admin-question-tags">
                        <span className="admin-pill blue">{topicLabel(item.topic)}</span>
                        <span className="admin-pill">{statuses[item.processingStatus]}</span>
                      </div>
                      <time className="admin-meta" dateTime={item.createdAt}>
                        {dateTime(item.createdAt)}
                      </time>
                    </div>
                    <div className="admin-question-content">
                      <h2>질문</h2>
                      <p className="admin-message-text">{item.content}</p>
                    </div>
                    {item.answers.map((answer) => (
                      <section className="admin-question-answer" key={answer.id}>
                        <div className="admin-question-summary">
                          <h3>
                            {answer.kind === 'EXPERT'
                              ? `전문가 답변 · ${answer.author}`
                              : answer.kind === 'NOTICE'
                                ? 'AI 안내'
                                : 'AI 답변'}
                          </h3>
                          <time className="admin-meta" dateTime={answer.createdAt}>
                            {dateTime(answer.createdAt)}
                          </time>
                        </div>
                        <p className="admin-message-text">{answer.content}</p>
                      </section>
                    ))}
                    {!item.answers.length && (
                      <p className="admin-question-empty">
                        {item.processingStatus === 'FAILED'
                          ? '답변 생성에 실패하여 저장된 답변이 없습니다.'
                          : '아직 등록된 답변이 없습니다.'}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
            <div className="admin-pagination">
              <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                이전
              </button>
              <span>
                {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 페이지
              </span>
              <button
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage((value) => value + 1)}
              >
                다음
              </button>
            </div>
          </>
        )
      )}
    </>
  );
}

export function AdminQuestionStatistics({ onError }: Props) {
  const [query, setQuery] = useState(defaultQuery);
  const { data, busy, error, refresh } = useQuestionData<Statistics>(
    `/question-statistics?${query}`,
    onError,
  );
  return (
    <>
      <QuestionFilters
        busy={busy}
        onRefresh={refresh}
        onApply={(next) => {
          setQuery(next);
          refresh();
        }}
      />
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {busy ? (
        <p role="status" className="admin-loading">
          주제별 질문을 집계하고 있습니다.
        </p>
      ) : (
        data && (
          <>
            <div className="admin-question-summary">
              <strong>전체 질문 {number(data.total)}건</strong>
              <span className="admin-meta">
                {data.startDate} ~ {data.endDate} · 질문 접수일 · 한국 시간 기준
              </span>
            </div>
            <p className="admin-meta">{classificationNote}</p>
            <section className="admin-panel">
              <div className="admin-panel-toolbar">
                <h2>주제별 질문 통계</h2>
                <span className="admin-meta">질문 수 내림차순</span>
              </div>
              {data.total === 0 && (
                <p className="admin-loading">조회 기간에 접수된 질문이 없습니다.</p>
              )}
              <div className="admin-table-scroll">
                <table className="admin-topic-table">
                  <caption className="admin-sr-only">주제별 질문 수와 전체 질문 대비 비중</caption>
                  <thead>
                    <tr>
                      <th scope="col">주제</th>
                      <th scope="col">질문 수</th>
                      <th scope="col">비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topics.map((item) => (
                      <tr key={item.topic}>
                        <th scope="row">{topicLabel(item.topic)}</th>
                        <td>{number(item.count)}건</td>
                        <td>
                          <div className="admin-topic-share">
                            <progress
                              aria-label={`${topicLabel(item.topic)} 비중`}
                              max={100}
                              value={item.percentage}
                            />
                            <span>{item.percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="admin-quality-note">
                답변 생성 실패·처리 중 질문도 포함합니다. 비중은 소수점 첫째 자리까지 반올림하여
                합계가 100%와 다를 수 있습니다.
              </p>
            </section>
          </>
        )
      )}
    </>
  );
}
