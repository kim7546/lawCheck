import { useEffect, useState, type CSSProperties } from 'react';
import { CheckCheck, Clock3, MessageSquare, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AdminSummary } from '@lawcheck/contracts';
import { adminApi } from './api';

const number = (n: number) => n.toLocaleString('ko-KR');
const percent = (n: number | null) => (n === null ? '—' : `${n}%`);
export function AdminOverview({ onError }: { onError: (e: unknown) => void }) {
  const [days, setDays] = useState(30);
  const [reload, setReload] = useState(0);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setBusy(true);
    setSummary(null);
    setError('');
    adminApi<AdminSummary>(`/summary?days=${days}`)
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : '집계에 실패했습니다.');
          onError(e);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [days, reload, onError]);
  const max = Math.max(1, ...(summary?.daily.map((d) => Math.max(d.questions, d.requests)) ?? []));
  return (
    <>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <div className="admin-toolbar">
        <div className="admin-periods" aria-label="조회 기간">
          {[7, 30, 90].map((value) => (
            <button key={value} aria-pressed={days === value} onClick={() => setDays(value)}>
              최근 {value}일
            </button>
          ))}
        </div>
        <button disabled={busy} onClick={() => setReload((v) => v + 1)}>
          <RefreshCw size={15} />
          새로고침
        </button>
      </div>
      {busy ? (
        <p role="status" className="admin-loading">
          운영 현황을 집계하고 있습니다.
        </p>
      ) : !summary ? (
        <p className="admin-loading">현황을 불러오지 못했습니다. 새로고침해 주세요.</p>
      ) : (
        <>
          <p className="admin-meta">
            {new Date(summary.since).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} –{' '}
            {new Date(summary.generatedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}{' '}
            · 한국 시간 기준 ·{' '}
            {new Date(summary.generatedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })}{' '}
            집계
          </p>
          <div className="admin-stats">
            {[
              {
                label: '접수 질문',
                value: number(summary.questions),
                note: '접수된 질문 메시지 수',
                icon: MessageSquare,
              },
              {
                label: '검증 요청',
                value: number(summary.requests),
                note: '전문가 검증을 요청한 질문',
                icon: ShieldCheck,
              },
              {
                label: '검증 완료율',
                value: percent(summary.completionRate),
                note: `${number(summary.verified)}건 완료 / ${number(summary.requests)}건 요청`,
                icon: CheckCheck,
              },
              {
                label: '평균 첫 답변 시간',
                value:
                  summary.averageHours === null ? '—' : `${summary.averageHours.toFixed(1)}시간`,
                note: '요청 접수 → 첫 검증 답변',
                icon: Clock3,
              },
            ].map((item) => (
              <section className="admin-stat" key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <item.icon size={20} />
                </div>
                <strong>{item.value}</strong>
                <small>{item.note}</small>
              </section>
            ))}
          </div>
          <div className="admin-overview-grid">
            <section className="admin-panel admin-progress">
              <div className="admin-panel-toolbar">
                <h2>검증 진행 현황</h2>
                <span className="admin-pill">질문 기준</span>
              </div>
              <div className="admin-progress-body">
                {[
                  { name: '검증 대기', value: summary.waiting, color: '#c3cee0' },
                  { name: '검증 중', value: summary.reviewing, color: '#e4a33a' },
                  { name: '검증 완료', value: summary.verified, color: '#2563eb' },
                ].map((item) => (
                  <div className="admin-progress-row" key={item.name}>
                    <span>{item.name}</span>
                    <progress
                      aria-label={item.name}
                      max={Math.max(summary.requests, 1)}
                      value={item.value}
                      style={{ '--progress-color': item.color } as CSSProperties}
                    />
                    <strong>{number(item.value)}건</strong>
                  </div>
                ))}
                <p className="admin-attention">
                  <Clock3 size={17} />
                  48시간 이상 미완료 <strong>{number(summary.overdue)}건</strong>
                </p>
                <p className="admin-meta">
                  선택 기간에 접수된 요청의 현재 상태입니다. 완료 답변이 하나 이상이면 완료로
                  집계합니다.
                </p>
              </div>
            </section>
            <section className="admin-panel">
              <div className="admin-panel-toolbar">
                <h2>검증 활동 지표</h2>
                <span className="admin-pill">처리 실적</span>
              </div>
              <dl className="admin-quality">
                <div>
                  <dt>완료된 전문가 답변</dt>
                  <dd>{number(summary.completedAnswers)}건</dd>
                </div>
                <div>
                  <dt>이용자가 답변을 선택한 요청</dt>
                  <dd>{number(summary.selectedAnswers)}건</dd>
                </div>
                <div>
                  <dt>
                    답변 선택률 <small>선택 요청 / 완료 요청</small>
                  </dt>
                  <dd>{percent(summary.selectionRate)}</dd>
                </div>
                <div>
                  <dt>검증 참여 활성 회원</dt>
                  <dd>{number(summary.activeExperts)}명</dd>
                </div>
              </dl>
              <p className="admin-quality-note">
                답변 선택률은 이용자의 선택 행동을 나타냅니다. 답변의 정확성에 대한 평가는 아닙니다.
              </p>
            </section>
          </div>
          <section className="admin-panel">
            <div className="admin-panel-toolbar">
              <h2>일별 질문과 검증 요청</h2>
              <span className="admin-meta">질문 / 요청 / 완료 요청</span>
            </div>
            <div className="admin-trend" aria-label="일별 접수 현황">
              {summary.daily.map((day) => (
                <div
                  className="admin-trend-day"
                  key={day.date}
                  title={`${day.date}: 질문 ${day.questions}, 검증 요청 ${day.requests}, 완료 ${day.verified}`}
                >
                  <div className="admin-trend-bars">
                    <span style={{ height: `${(day.questions / max) * 100}%` }} />
                    <span style={{ height: `${(day.requests / max) * 100}%` }} />
                  </div>
                  <small>{day.date.slice(5)}</small>
                </div>
              ))}
            </div>
            <div className="admin-legend">
              <span>● 질문</span>
              <span>● 검증 요청</span>
            </div>
            <details className="admin-trend-data">
              <summary>일별 수치 보기</summary>
              <div className="admin-table-scroll">
                <table>
                  <caption className="admin-sr-only">일별 질문·검증 수치</caption>
                  <thead>
                    <tr>
                      <th>접수일</th>
                      <th>질문</th>
                      <th>검증 요청</th>
                      <th>완료 요청</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.daily.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{d.questions}</td>
                        <td>{d.requests}</td>
                        <td>{d.verified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-toolbar">
              <h2>전문가별 검증 실적</h2>
              <span className="admin-meta">완료 답변 수 기준 상위 10명</span>
            </div>
            <div className="admin-table-scroll">
              <table>
                <caption className="admin-sr-only">전문가별 검증 실적</caption>
                <thead>
                  <tr>
                    <th>전문가</th>
                    <th>전문가 그룹</th>
                    <th>검증 중</th>
                    <th>완료 답변</th>
                    <th>선택된 답변</th>
                    <th>처리 완료율</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.experts.map((expert) => (
                    <tr key={expert.id}>
                      <td>{expert.name}</td>
                      <td>{expert.group}</td>
                      <td>{expert.reviewing}건</td>
                      <td>{expert.completed}건</td>
                      <td>{expert.selected}건</td>
                      <td>
                        {percent(
                          expert.completed + expert.reviewing
                            ? Math.round(
                                (expert.completed / (expert.completed + expert.reviewing)) * 1000,
                              ) / 10
                            : null,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!summary.experts.length && (
              <p className="admin-loading">이 기간에 참여한 전문가가 없습니다.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
