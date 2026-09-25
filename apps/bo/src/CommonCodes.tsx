import { useEffect, useState } from 'react';
import type { CommonCodeRecord } from '@lawcheck/contracts';
import { api } from './api';
import { RefreshCw } from 'lucide-react';

type Draft = Pick<CommonCodeRecord, 'code' | 'name' | 'description' | 'sortOrder' | 'isActive'> & {
  updatedAt?: string;
};
function CodeForm({
  value,
  busy,
  onSave,
  onCancel,
}: {
  value?: CommonCodeRecord;
  busy: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    value ?? { code: '', name: '', description: '', sortOrder: 0, isActive: true },
  );
  return (
    <form
      className="code-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <fieldset disabled={busy}>
        <label>
          코드
          <input
            value={draft.code}
            disabled={!!value}
            required
            maxLength={50}
            pattern="[A-Z][A-Z0-9_]{0,49}"
            placeholder="영문 대문자·숫자·밑줄"
            onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
          />
        </label>
        <label>
          코드명
          <input
            value={draft.name}
            required
            maxLength={100}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          설명
          <textarea
            value={draft.description}
            maxLength={500}
            rows={2}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label>
          정렬순서
          <input
            type="number"
            min={0}
            max={99999}
            step={1}
            required
            value={draft.sortOrder}
            onChange={(event) => setDraft({ ...draft, sortOrder: event.target.valueAsNumber })}
          />
        </label>
        <label className="code-active">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
          />
          사용
        </label>
        <div className="detail-actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button className="primary" disabled={!draft.name.trim()}>
            저장
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function CommonCodes({ onError }: { onError: (error: unknown) => void }) {
  const [groups, setGroups] = useState<CommonCodeRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<CommonCodeRecord[]>([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{
    kind: 'group' | 'detail';
    value?: CommonCodeRecord;
  } | null>(null);
  useEffect(() => {
    let active = true;
    api<CommonCodeRecord[]>('/code-groups')
      .then((data) => {
        if (active) setGroups(data);
      })
      .catch((e: unknown) => {
        if (active) {
          setError('공통 코드를 불러오지 못했습니다. 새로고침해 주세요.');
          onError(e);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  function select(group: string) {
    void run(async () => {
      const next = await api<CommonCodeRecord[]>(`/code-groups/${group}/details`);
      setSelected(group);
      setDetails(next);
      setEditor(null);
    });
  }
  async function refresh() {
    setGroups(await api<CommonCodeRecord[]>('/code-groups'));
    if (selected) setDetails(await api<CommonCodeRecord[]>(`/code-groups/${selected}/details`));
  }
  const current = groups.find((item) => item.code === selected);
  return (
    <>
      <div className="board-heading">
        <div>
          <span className="eyebrow">SYSTEM SETTINGS</span>
          <h1>공통 코드 관리</h1>
          <p>그룹과 상세 코드의 이름, 정렬순서, 사용 여부를 관리합니다.</p>
        </div>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await refresh();
              setEditor(null);
            })
          }
        >
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>
      <p className="muted">
        기존 코드 값은 변경·삭제하지 않으며 미사용으로 전환할 수 있습니다. 전문가 그룹 사용 여부와
        별개로 현재 Office 가입은 변호사만 가능합니다.
      </p>
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
      {busy && <p role="status">처리 중입니다.</p>}
      <div className="code-panels">
        <section className="content-card" aria-label="코드 그룹">
          <div className="panel-heading">
            <h2>코드 그룹</h2>
            <button
              disabled={busy}
              onClick={() => {
                setEditor({ kind: 'group' });
                setError('');
                setNotice('');
              }}
            >
              그룹 추가
            </button>
          </div>
          {groups.map((item) => (
            <div className="code-list-row" key={item.code}>
              <button
                className={selected === item.code ? 'selected-code' : ''}
                disabled={busy}
                onClick={() => select(item.code)}
              >
                <strong>{item.name}</strong>
                <small>
                  {item.code} · 순서 {item.sortOrder} · {item.isActive ? '사용' : '미사용'}
                </small>
              </button>
              <button
                aria-label={`${item.name} 그룹 수정`}
                disabled={busy}
                onClick={() => setEditor({ kind: 'group', value: item })}
              >
                수정
              </button>
            </div>
          ))}
          {!busy && !groups.length && <p className="muted">등록된 그룹이 없습니다.</p>}
        </section>
        <section className="content-card" aria-label="상세 코드">
          <div className="panel-heading">
            <h2>{current ? `${current.name} 상세` : '상세 코드'}</h2>
            <button
              disabled={busy || !selected}
              onClick={() => {
                setEditor({ kind: 'detail' });
                setError('');
                setNotice('');
              }}
            >
              상세 추가
            </button>
          </div>
          {current && !current.isActive && (
            <p className="muted">
              이 그룹은 미사용입니다. 상세가 사용 상태여도 서비스에서는 비활성으로 처리됩니다.
            </p>
          )}
          {!selected ? (
            <p className="muted">왼쪽에서 그룹을 선택해 주세요.</p>
          ) : (
            details.map((item) => (
              <div className="code-list-row" key={item.code}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.code} · 순서 {item.sortOrder} · {item.isActive ? '사용' : '미사용'}
                  </small>
                  {item.description && <p className="muted">{item.description}</p>}
                </div>
                <button
                  aria-label={`${item.name} 상세 수정`}
                  disabled={busy}
                  onClick={() => setEditor({ kind: 'detail', value: item })}
                >
                  수정
                </button>
              </div>
            ))
          )}
          {selected && !busy && !details.length && (
            <p className="muted">등록된 상세 코드가 없습니다.</p>
          )}
        </section>
      </div>
      {editor && (
        <section className="content-card" aria-label="코드 편집">
          <h2>
            {editor.kind === 'group' ? '그룹' : `${current?.name ?? ''} 상세`}{' '}
            {editor.value ? '수정' : '추가'}
          </h2>
          <CodeForm
            key={`${editor.kind}:${selected}:${editor.value?.code ?? 'new'}:${editor.value?.updatedAt ?? ''}`}
            value={editor.value}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSave={(draft) =>
              void run(async () => {
                const base =
                  editor.kind === 'group' ? '/code-groups' : `/code-groups/${selected}/details`;
                await api(editor.value ? `${base}/${editor.value.code}` : base, draft);
                setEditor(null);
                await refresh();
                setNotice('저장했습니다. 가입 화면은 다음 조회부터 변경된 코드를 사용합니다.');
              })
            }
          />
        </section>
      )}
    </>
  );
}
