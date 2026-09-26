import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { BoMenuRecord } from '@lawcheck/contracts';
import { adminApi } from './api';

export function AdminMenus({ onError }: { onError: (e: unknown) => void }) {
  const [menus, setMenus] = useState<BoMenuRecord[]>([]);
  const [busy, setBusy] = useState(true);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<BoMenuRecord | null>(null);
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (editor) editorRef.current?.focus();
  }, [editor]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    setMenus([]);
    setEditor(null);
    adminApi<BoMenuRecord[]>('/menus')
      .then((data) => {
        if (active) setMenus(data);
      })
      .catch((e: unknown) => {
        if (active) {
          setError('메뉴를 불러오지 못했습니다. 새로고침해 주세요.');
          onError(e);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [reload, onError]);
  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-meta">
          구현된 메뉴의 표시를 설정합니다. 변경 사항은 BO를 다시 불러오면 반영됩니다.
        </p>
        <button
          disabled={busy}
          onClick={() => {
            setNotice('');
            setReload((v) => v + 1);
          }}
        >
          <RefreshCw size={15} />
          새로고침
        </button>
      </div>
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
          <h2>BO 메뉴 목록</h2>
          <span className="admin-meta">작은 순서부터 표시</span>
        </div>
        {busy ? (
          <p role="status" className="admin-loading">
            메뉴를 불러오는 중입니다.
          </p>
        ) : (
          <div className="admin-table-scroll">
            <table>
              <caption className="admin-sr-only">BO 메뉴 설정</caption>
              <thead>
                <tr>
                  <th>순서</th>
                  <th>메뉴명</th>
                  <th>화면 코드</th>
                  <th>표시 여부</th>
                  <th>접근 대상</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {menus.map((menu) => (
                  <tr key={menu.key}>
                    <td>{menu.sortOrder}</td>
                    <td>
                      <strong>{menu.label}</strong>
                    </td>
                    <td>{menu.key}</td>
                    <td>
                      <span className={`admin-pill ${menu.isActive ? 'blue' : ''}`}>
                        {menu.isActive ? '표시' : '숨김'}
                      </span>
                    </td>
                    <td>{menu.key === 'codes' ? '공통코드 관리 권한 보유자' : '로그인 회원'}</td>
                    <td>
                      <button
                        aria-label={`${menu.label} 메뉴 수정`}
                        onClick={() => {
                          setEditor(menu);
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
        )}
      </section>
      <p className="admin-info">
        대시보드는 BO 첫 화면으로 항상 표시합니다. 메뉴 숨김은 화면 노출 설정이며 회원 권한을
        변경하지 않습니다.
      </p>
      {editor && (
        <section
          ref={editorRef}
          tabIndex={-1}
          className="admin-panel admin-editor"
          aria-label="메뉴 수정"
        >
          <h2>{editor.label} 메뉴 수정</h2>
          <form
            key={`${editor.key}:${editor.updatedAt}`}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              setError('');
              setNotice('');
              try {
                const updated = await adminApi<BoMenuRecord>(`/menus/${editor.key}`, {
                  label: form.get('label'),
                  sortOrder: Number(form.get('sortOrder')),
                  isActive: editor.key === 'dashboard' || form.get('isActive') === 'on',
                  updatedAt: editor.updatedAt,
                });
                setMenus((items) =>
                  items
                    .map((m) => (m.key === updated.key ? updated : m))
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)),
                );
                setEditor(null);
                setNotice('메뉴 설정을 저장했습니다. BO를 새로고침하면 적용됩니다.');
              } catch (e) {
                setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
                onError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <div className="admin-form-grid">
                <label>
                  메뉴명
                  <input name="label" defaultValue={editor.label} maxLength={50} required />
                </label>
                <label>
                  표시 순서
                  <input
                    type="number"
                    name="sortOrder"
                    defaultValue={editor.sortOrder}
                    min={0}
                    max={99999}
                    step={1}
                    required
                  />
                </label>
              </div>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={editor.isActive}
                  disabled={editor.key === 'dashboard'}
                />
                메뉴 표시
              </label>
              <div className="admin-actions">
                <button type="button" onClick={() => setEditor(null)}>
                  취소
                </button>
                <button className="primary">메뉴 저장</button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
    </>
  );
}
