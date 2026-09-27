import { createHash } from 'node:crypto';
import type { VoiceSession } from '@lawcheck/contracts';
import { ChatError } from './chat.js';

export interface VoiceOptions {
  enabled?: boolean;
  apiKey?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

// These are token-issuance limits per API process, not billing caps or a limit
// on the lifetime of an already-connected OpenAI session.
const WINDOW_MS = 60_000;
const BROWSER_LIMIT = 5;
const INSTANCE_LIMIT = 60;

export function createVoiceService(options: VoiceOptions = {}) {
  const now = options.now ?? Date.now;
  const attempts = new Map<string, number[]>();
  const pending = new Set<string>();
  let instanceAttempts: number[] = [];
  const enabled = options.enabled !== false && Boolean(options.apiKey?.trim());

  return {
    enabled,
    async createSession(browserId: string): Promise<VoiceSession> {
      if (options.enabled === false)
        throw new ChatError(503, 'VOICE_DISABLED', '음성 입력이 비활성화되어 있어요.');
      if (!options.apiKey?.trim())
        throw new ChatError(
          503,
          'VOICE_NOT_CONFIGURED',
          '음성 입력 연결이 아직 설정되지 않았어요.',
        );
      if (pending.has(browserId))
        throw new ChatError(
          409,
          'VOICE_CONNECTING',
          '음성 입력에 연결하고 있어요. 잠시 기다려 주세요.',
        );

      const startedAt = now();
      const cutoff = startedAt - WINDOW_MS;
      for (const [id, times] of attempts) {
        const recent = times.filter((time) => time > cutoff);
        if (recent.length) attempts.set(id, recent);
        else attempts.delete(id);
      }
      instanceAttempts = instanceAttempts.filter((time) => time > cutoff);
      const browserAttempts = attempts.get(browserId) ?? [];
      if (browserAttempts.length >= BROWSER_LIMIT || instanceAttempts.length >= INSTANCE_LIMIT)
        throw new ChatError(
          429,
          'VOICE_RATE_LIMITED',
          '음성 입력 요청이 많아요. 1분 후 다시 시도해 주세요.',
        );
      attempts.set(browserId, [...browserAttempts, startedAt]);
      instanceAttempts.push(startedAt);
      pending.add(browserId);

      try {
        const response = await (options.fetch ?? fetch)(
          'https://api.openai.com/v1/realtime/client_secrets',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
              'OpenAI-Safety-Identifier': createHash('sha256').update(browserId).digest('hex'),
            },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              expires_after: { anchor: 'created_at', seconds: 60 },
              session: {
                type: 'transcription',
                audio: {
                  input: {
                    transcription: {
                      model: 'gpt-live-transcribe',
                      languages: ['ko'],
                      delay: 'low',
                      prompt:
                        '한국어 법률 상담 질문. 금액, 날짜, 이름과 부정 표현을 정확하게 받아쓰기.',
                      keywords: [
                        '임대차',
                        '보증금',
                        '전세',
                        '퇴직금',
                        '상속',
                        '내용증명',
                        '지급명령',
                      ],
                    },
                    turn_detection: null,
                  },
                },
              },
            }),
          },
        );
        if (!response.ok)
          throw new ChatError(
            response.status === 429 ? 429 : 502,
            response.status === 429 ? 'VOICE_PROVIDER_LIMIT' : 'VOICE_UNAVAILABLE',
            response.status === 429
              ? '음성 서비스 이용 한도에 도달했어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.'
              : '음성 서비스에 연결하지 못했어요. 다시 시도하거나 직접 입력해 주세요.',
          );
        const body = (await response.json()) as { value?: unknown; expires_at?: unknown };
        if (
          typeof body.value !== 'string' ||
          !body.value.startsWith('ek_') ||
          typeof body.expires_at !== 'number' ||
          !Number.isFinite(body.expires_at) ||
          body.expires_at * 1000 <= now()
        )
          throw new ChatError(
            502,
            'VOICE_UNAVAILABLE',
            '음성 연결 정보를 받지 못했어요. 다시 시도해 주세요.',
          );
        return { clientSecret: body.value, expiresAt: body.expires_at, maxDurationSeconds: 120 };
      } catch (error) {
        if (error instanceof ChatError) throw error;
        const timeout = error instanceof Error && error.name === 'TimeoutError';
        throw new ChatError(
          timeout ? 504 : 502,
          timeout ? 'VOICE_TIMEOUT' : 'VOICE_UNAVAILABLE',
          timeout
            ? '음성 연결 시간이 길어지고 있어요. 다시 시도해 주세요.'
            : '음성 서비스에 연결하지 못했어요. 다시 시도하거나 직접 입력해 주세요.',
        );
      } finally {
        pending.delete(browserId);
      }
    },
  };
}
