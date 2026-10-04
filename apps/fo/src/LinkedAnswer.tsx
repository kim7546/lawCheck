import { useEffect, useState } from 'react';
export function LinkedAnswer({
  token,
  onRestored,
}: {
  token: string;
  onRestored: (sessionId: string) => void;
}) {
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/review-answer/${encodeURIComponent(token)}/restore`, {
      method: 'POST',
      credentials: 'same-origin',
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? '대화를 복원하지 못했습니다.');
        if (!controller.signal.aborted) onRestored(result.data.sessionId);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '대화를 복원하지 못했습니다.');
      });
    return () => controller.abort();
  }, [token, onRestored]);
  return (
    <main className="linked-answer">
      <a href="/">AI QAVER 홈으로</a>
      <h1>질문 대화 복원</h1>
      {error ? <p role="alert">{error}</p> : <p role="status">질문과 답변을 불러오고 있습니다.</p>}
    </main>
  );
}
