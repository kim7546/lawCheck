import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type {
  AdminIdentity,
  AdminUser,
  AdminUsersPage,
  CommonCodeRecord,
} from '@lawcheck/contracts';
import { adminApi } from './api';

export function AdminUsers({
  selfId,
  onError,
  onSelfUpdate,
}: {
  selfId: string;
  onError: (e: unknown) => void;
  onSelfUpdate: (user: AdminIdentity) => void;
}) {
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [groups, setGroups] = useState<CommonCodeRecord[]>([]);
  const [plans, setPlans] = useState<CommonCodeRecord[]>([]);
  const [query, setQuery] = useState({ search: '', group: '', role: '', page: 1 });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<AdminUser | null>(null);
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (editor) editorRef.current?.focus();
  }, [editor]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      adminApi<CommonCodeRecord[]>('/code-groups/EXPERT_GROUP/details'),
      adminApi<CommonCodeRecord[]>('/code-groups/PLAN/details'),
    ])
      .then(([nextGroups, nextPlans]) => {
        if (active) {
          setGroups(nextGroups);
          setPlans(nextPlans);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError('전문그룹 또는 요금제 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
          onError(e);
        }
      });
    return () => {
      active = false;
    };
  }, [onError]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setData(null);
    setEditor(null);
    setError('');
    const params = new URLSearchParams({ ...query, page: String(query.page) });
    adminApi<AdminUsersPage>(`/users?${params}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e: unknown) => {
        if (active) {
          setError('목록을 불러오지 못했습니다. 새로고침해 주세요.');
          onError(e);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [query, reload, onError]);
  return (
    <>
      <p className="admin-info">
        한 회원은 전문가와 관리자 역할을 함께 가질 수 있습니다. 관리자 권한을 부여해도 기존 전문그룹
        정보는 유지됩니다.
      </p>
      <form
        className="admin-user-filters"
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          setNotice('');
          setQuery({
            search: String(values.get('search') ?? ''),
            group: String(values.get('group') ?? ''),
            role: String(values.get('role') ?? ''),
            page: 1,
          });
        }}
      >
        <label className="admin-search">
          <Search size={16} />
          <input
            name="search"
            aria-label="사용자 검색"
            maxLength={100}
            placeholder="이름, 아이디, 이메일 검색"
          />
        </label>
        <label>
          <span className="admin-sr-only">전문가 그룹 필터</span>
          <select name="group" aria-label="전문가 그룹 필터">
            <option value="">모든 전문그룹</option>
            <option value="NONE">직역 미선택</option>
            {groups.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="admin-sr-only">사용자 상태 필터</span>
          <select name="role" aria-label="사용자 상태 필터">
            <option value="">전체 사용자</option>
            <option value="admin">관리자</option>
            <option value="inactive">중지된 계정</option>
          </select>
        </label>
        <button className="primary" disabled={busy || saving}>
          검색
        </button>
        <button
          type="button"
          aria-label="사용자 새로고침"
          disabled={busy || saving}
          onClick={() => {
            setNotice('');
            setReload((v) => v + 1);
          }}
        >
          <RefreshCw size={16} />
        </button>
      </form>
      {notice && (
        <p role="status" className="admin-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <section className="admin-panel">
        <div className="admin-panel-toolbar">
          <h2>BO 회원 목록</h2>
          <span className="admin-meta">
            {data ? `총 ${data.total.toLocaleString('ko-KR')}명` : '조회 중'}
          </span>
        </div>
        {busy ? (
          <p role="status" className="admin-loading">
            사용자를 불러오는 중입니다.
          </p>
        ) : (
          data && (
            <>
              <div className="admin-table-scroll">
                <table>
                  <caption className="admin-sr-only">BO 회원 목록</caption>
                  <thead>
                    <tr>
                      <th>이름 / 아이디</th>
                      <th>이메일</th>
                      <th>전문가 그룹 / 소속</th>
                      <th>요금제</th>
                      <th>역할 / 상태</th>
                      <th>가입일</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <small>{user.username ?? '아이디 미등록'}</small>
                        </td>
                        <td>{user.email}</td>
                        <td>
                          {user.expertCode?.name ?? '직역 미선택'}
                          <small>{user.lawyerProfile?.officeName ?? '—'}</small>
                        </td>
                        <td>{user.planCode.name}</td>
                        <td>
                          <span
                            className={`admin-pill ${user.adminProfile?.isActive ? 'blue' : ''}`}
                          >
                            {user.adminProfile?.isActive ? '관리자' : '일반 회원'}
                          </span>
                          <small>{user.isActive ? '사용 중' : '사용 중지'}</small>
                        </td>
                        <td>{new Date(user.createdAt).toLocaleDateString('ko-KR')}</td>
                        <td>
                          <button
                            disabled={saving}
                            aria-label={`${user.name} 회원 수정`}
                            onClick={() => {
                              setEditor(user);
                              setError('');
                              setNotice('');
                            }}
                          >
                            수정
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.items.length && (
                <p className="admin-loading">조회 조건에 맞는 사용자가 없습니다.</p>
              )}
            </>
          )
        )}
      </section>
      {data && (
        <nav className="admin-pagination" aria-label="사용자 목록 페이지">
          <button
            disabled={busy || saving || query.page <= 1}
            onClick={() => setQuery({ ...query, page: query.page - 1 })}
          >
            이전
          </button>
          <span>
            {data.page} / {Math.max(1, Math.ceil(data.total / 20))}
          </span>
          <button
            disabled={busy || saving || query.page * 20 >= data.total}
            onClick={() => setQuery({ ...query, page: query.page + 1 })}
          >
            다음
          </button>
        </nav>
      )}
      {editor && (
        <section
          ref={editorRef}
          tabIndex={-1}
          className="admin-panel admin-editor"
          aria-label="회원 정보 수정"
        >
          <h2>{editor.name} 회원 수정</h2>
          <p className="admin-meta">
            {editor.email} · {editor.expertCode?.name ?? '직역 미선택'}
          </p>
          <form
            key={`${editor.id}:${editor.updatedAt}`}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setSaving(true);
              setError('');
              setNotice('');
              try {
                const changed = await adminApi<AdminUser>(`/users/${editor.id}`, {
                  name: form.get('name'),
                  plan: form.get('plan'),
                  isActive: editor.id === selfId || form.get('isActive') === 'on',
                  isAdmin: editor.id === selfId || form.get('isAdmin') === 'on',
                  updatedAt: editor.updatedAt,
                });
                if (changed.id === selfId) onSelfUpdate(changed);
                setEditor(null);
                setReload((v) => v + 1);
                setNotice(
                  '회원 정보를 저장했습니다. 권한 및 계정 상태는 다음 요청부터 적용됩니다.',
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
                onError(e);
              } finally {
                setSaving(false);
              }
            }}
          >
            <fieldset disabled={saving}>
              <div className="admin-form-grid">
                <label>
                  이름
                  <input name="name" defaultValue={editor.name} maxLength={100} required />
                </label>
                <label>
                  요금제
                  <select name="plan" defaultValue={editor.plan}>
                    {!plans.some((p) => p.code === editor.plan) && (
                      <option value={editor.plan}>{editor.planCode.name}</option>
                    )}
                    {plans.map((p) => (
                      <option
                        key={p.code}
                        value={p.code}
                        disabled={!p.isActive && p.code !== editor.plan}
                      >
                        {p.name}
                        {!p.isActive ? ' (미사용)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={editor.isActive}
                  disabled={editor.id === selfId}
                />
                계정 사용
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  name="isAdmin"
                  defaultChecked={editor.adminProfile?.isActive ?? false}
                  disabled={editor.id === selfId}
                />
                관리자 권한 부여
              </label>
              <p className="admin-meta">
                관리자는 전체 회원, 공통코드와 BO 메뉴를 관리할 수 있습니다. 현재 로그인한 자신의
                권한은 중지할 수 없습니다.
              </p>
              <div className="admin-actions">
                <button type="button" onClick={() => setEditor(null)}>
                  취소
                </button>
                <button className="primary">{saving ? '저장 중…' : '회원 정보 저장'}</button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
    </>
  );
}
