import { useEffect, useState } from 'react';
import type { LinkedReviewAnswer } from '@lawcheck/contracts';
export function LinkedAnswer({ token }: { token: string }) {
  const [answer, setAnswer] = useState<LinkedReviewAnswer | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/review-answer/${encodeURIComponent(token)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? '답변을 불러오지 못했습니다.');
        setAnswer(result.data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '답변을 불러오지 못했습니다.');
      });
    return () => controller.abort();
  }, [token]);
  return (
    <main className="linked-answer">
      <a href="/">AI QAVER 홈으로</a>
      <h1>전문가 답변</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : answer ? (
        <>
          <h2>질문</h2>
          <p>{answer.question}</p>
          <h2>{answer.author}님의 답변</h2>
          <p>{answer.reply}</p>
          <small>
            {new Date(answer.completedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
          </small>
        </>
      ) : (
        <p role="status">답변을 불러오고 있습니다.</p>
      )}
    </main>
  );
}
