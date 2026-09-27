import type { ChatAnswer, ChatRequest } from '@lawcheck/contracts';

export class ChatError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createAnswerGenerator(
  options: {
    apiKey?: string;
    model?: string;
    fetch?: typeof fetch;
  } = {},
) {
  return async ({ question, history }: ChatRequest): Promise<ChatAnswer> => {
    if (!options.apiKey?.trim()) {
      throw new ChatError(
        503,
        'AI_NOT_CONFIGURED',
        'AI 연결이 아직 설정되지 않았어요. 관리자에게 문의해 주세요.',
      );
    }
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          model: options.model?.trim() || 'gpt-4.1-mini',
          store: false,
          max_output_tokens: 8000,
          text: {
            format: {
              type: 'json_schema',
              name: 'chat_answer',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  answer: { type: 'string' },
                },
                required: ['answer'],
                additionalProperties: false,
              },
            },
          },
          instructions:
            '사용자의 질문과 이전 대화 맥락을 참고해 정확하고 이해하기 쉽게 답하세요. ' +
            '질문의 주제를 제한하지 마세요. 사용자가 요청한 언어와 형식을 따르세요. ' +
            '확실하지 않은 내용은 불확실성을 설명하고, 확인하지 않은 정보를 검증했다고 말하지 마세요. ' +
            'answer에 답변 본문을 담으세요.',
          input: [
            ...history.flatMap((turn) => [
              { role: 'user', content: turn.question },
              { role: 'assistant', content: turn.answer },
            ]),
            { role: 'user', content: question },
          ],
        }),
      });
    } catch (error) {
      const timeout = error instanceof Error && error.name === 'TimeoutError';
      throw new ChatError(
        timeout ? 504 : 502,
        timeout ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE',
        timeout
          ? '답변 시간이 길어지고 있어요. 다시 시도해 주세요.'
          : 'AI에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { code?: unknown; type?: unknown };
      } | null;
      const quotaCodes = [
        'credit_balance_exhausted',
        'insufficient_quota',
        'billing_hard_limit_reached',
        'billing_not_active',
        'organization_spend_limit_exceeded',
        'project_spend_limit_exceeded',
        'organization_usage_limit_exceeded',
      ];
      const knownCodes = [...quotaCodes, 'rate_limit_exceeded', 'slow_down', 'invalid_api_key'];
      const providerCode =
        typeof body?.error?.code === 'string' && knownCodes.includes(body.error.code)
          ? body.error.code
          : 'unknown';
      const quotaExceeded =
        response.status === 429 &&
        (quotaCodes.includes(providerCode) || body?.error?.type === 'insufficient_quota');
      // Never log the provider message, credentials, or conversation contents.
      console.error('[lawCheck AI] OpenAI request failed', {
        status: response.status,
        providerCode,
        quotaExceeded,
      });
      if (quotaExceeded) {
        throw new ChatError(
          503,
          'AI_QUOTA_EXCEEDED',
          'AI 서비스 이용 한도에 도달했어요. 관리자에게 문의해 주세요.',
        );
      }
      throw new ChatError(
        response.status === 429 ? 429 : 502,
        response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_UNAVAILABLE',
        response.status === 429
          ? 'AI 사용량이 많아요. 잠시 후 다시 시도해 주세요.'
          : 'AI 답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    }
    const body = (await response.json()) as {
      status?: string;
      output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
    };
    const answer = body.output
      ?.filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .map((item) =>
        item.type === 'output_text'
          ? (item.text ?? '')
          : item.type === 'refusal'
            ? (item.refusal ?? '')
            : '',
      )
      .join('\n')
      .trim();
    if (body.status !== 'completed' || !answer) {
      throw new ChatError(
        502,
        'AI_EMPTY_RESPONSE',
        '완전한 답변을 받지 못했어요. 다시 시도해 주세요.',
      );
    }
    const refusal = body.output?.some((item) =>
      item.content?.some((part) => part.type === 'refusal'),
    );
    if (refusal) return { answer };
    let parsed: Partial<ChatAnswer> | null;
    try {
      parsed = JSON.parse(answer);
    } catch {
      parsed = null;
    }
    if (typeof parsed?.answer !== 'string' || !parsed.answer.trim()) {
      throw new ChatError(
        502,
        'AI_INVALID_RESPONSE',
        '답변을 확인하지 못했어요. 다시 시도해 주세요.',
      );
    }
    return { answer: parsed.answer.trim() };
  };
}
