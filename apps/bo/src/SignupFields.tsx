import { useEffect, useRef, useState } from 'react';
import type { ExpertGroupCode, OfficeSignupConsent, OfficeSignupPolicy } from '@lawcheck/contracts';
import { api } from './api';
import { RequiredMark } from './RequiredMark';

export function SignupFields({
  busy,
  onChange,
}: {
  busy: boolean;
  onChange: (value: OfficeSignupConsent | null) => void;
}) {
  const [policy, setPolicy] = useState<OfficeSignupPolicy | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [group, setGroup] = useState<ExpertGroupCode | ''>('');
  const [checked, setChecked] = useState<string[]>([]);
  const allRef = useRef<HTMLInputElement>(null);
  const allChecked = !!policy && checked.length === policy.agreements.length;
  useEffect(() => {
    let active = true;
    setError('');
    api<OfficeSignupPolicy>('/signup-policy')
      .then((data) => {
        if (active) setPolicy(data);
      })
      .catch(() => {
        if (active) setError('가입 약관을 불러오지 못했습니다. 다시 시도해 주세요.');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = checked.length > 0 && !allChecked;
  }, [checked, allChecked]);
  function update(nextGroup: ExpertGroupCode | '', nextChecked: string[]) {
    setGroup(nextGroup);
    setChecked(nextChecked);
    onChange(
      policy && nextGroup && policy.agreements.every((item) => nextChecked.includes(item.kind))
        ? {
            expertGroup: nextGroup,
            consents: policy.agreements.map(({ kind, version }) => ({
              kind,
              version,
              accepted: true,
            })),
          }
        : null,
    );
  }
  if (!policy)
    return (
      <div>
        {error ? (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button type="button" onClick={() => setAttempt(attempt + 1)}>
              약관 다시 불러오기
            </button>
          </>
        ) : (
          <p role="status">가입 정보를 불러오는 중입니다.</p>
        )}
      </div>
    );
  return (
    <>
      <fieldset className="signup-fieldset" disabled={busy}>
        <legend>
          <RequiredMark />
          전문가 그룹 선택 <span className="muted">(필수)</span>
        </legend>
        <p className="muted">현재 변호사 Office만 가입할 수 있습니다.</p>
        <div className="expert-groups">
          {policy.groups.map((item) => (
            <label
              key={item.code}
              className={`expert-option ${item.signupEnabled ? '' : 'unavailable'}`}
            >
              <input
                type="radio"
                name="expertGroup"
                value={item.code}
                checked={group === item.code}
                disabled={!item.signupEnabled}
                required
                onChange={() => update(item.code, checked)}
              />
              <span>
                {item.name}
                {!item.signupEnabled && <small>준비 중</small>}
              </span>
            </label>
          ))}
        </div>
        <p className="muted">전문가 그룹 선택은 자격 인증을 의미하지 않습니다.</p>
      </fieldset>
      <fieldset className="signup-fieldset" disabled={busy}>
        <legend>가입 약관 동의</legend>
        <label className="consent-check consent-all">
          <input
            ref={allRef}
            type="checkbox"
            checked={allChecked}
            onChange={(event) =>
              update(group, event.target.checked ? policy.agreements.map((item) => item.kind) : [])
            }
          />
          모두 동의
        </label>
        {policy.agreements.map((item) => (
          <div key={item.kind} className="consent-item">
            <label className="consent-check">
              <input
                type="checkbox"
                required
                checked={checked.includes(item.kind)}
                onChange={(event) =>
                  update(
                    group,
                    event.target.checked
                      ? [...checked, item.kind]
                      : checked.filter((kind) => kind !== item.kind),
                  )
                }
              />
              <span>
                <RequiredMark />
                [필수] {item.title}
                {item.title.endsWith('동의') ? '' : ' 동의'}
              </span>
            </label>
            <details>
              <summary>{item.title} 전문 보기</summary>
              <div className="agreement-document" tabIndex={0} aria-label={item.title}>
                <p className="muted">문안 버전 {item.version}</p>
                {item.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </details>
          </div>
        ))}
        <p className="muted">
          각 약관을 확인한 뒤 동의해 주세요. 필수 항목에 모두 동의해야 가입할 수 있습니다.
        </p>
      </fieldset>
    </>
  );
}
