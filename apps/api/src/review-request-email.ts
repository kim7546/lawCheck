import type { Prisma } from '@prisma/client';

export function officeOrigin(env: NodeJS.ProcessEnv = process.env) {
  let url: URL;
  try {
    url = new URL(
      env.BO_PUBLIC_URL ??
        (env.NODE_ENV === 'production' ? 'https://office.aiqaver.com' : 'http://localhost:5174'),
    );
  } catch {
    throw new Error('CONFIG: BO_PUBLIC_URL must be a public HTTPS URL');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (env.NODE_ENV === 'production' && url.protocol !== 'https:')
  )
    throw new Error('CONFIG: BO_PUBLIC_URL must be a public HTTPS URL');
  return url.origin;
}

// Called only for a newly created request, in the same database transaction.
export async function enqueueReviewRequestEmails(
  tx: Prisma.TransactionClient,
  post: { id: string; question: string; aiAnswer: string },
  origin: string,
) {
  const lawyers = await tx.expertAccount.findMany({
    where: { isActive: true, expertGroup: 'LAWYER' },
    select: { id: true, email: true },
  });
  const body = `검증을 원하는 질문이 등록되었습니다.\n\n질문\n${post.question}\n\nAI 답변\n${post.aiAnswer}\n\nOffice에서 검증하기\n${origin}/\n\nOffice에 로그인한 뒤 검증 게시판에서 질문과 AI 답변을 확인하고 검증해 주세요.`;
  // Batches avoid an oversized insert while retaining atomic registration.
  for (let i = 0; i < lawyers.length; i += 200) {
    await tx.answerEmailDelivery.createMany({
      data: lawyers.slice(i, i + 200).map((lawyer) => ({
        kind: 'REVIEW_REQUEST',
        requestPostId: post.id,
        requestExpertId: lawyer.id,
        recipient: lawyer.email,
        subject: '[AI QAVER] 검증을 원하는 질문이 등록되었습니다',
        body,
      })),
      skipDuplicates: true,
    });
  }
}
