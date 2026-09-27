import type { Page } from '@playwright/test';

export interface VoiceHarness {
  emit: (event: object, channelIndex?: number) => void;
  disconnect: () => void;
  releasePermission: () => void;
  snapshot: () => {
    stopped: boolean[];
    closed: boolean[];
    commits: number;
    permissionRequests: number;
  };
}

declare global {
  interface Window {
    voiceHarness: VoiceHarness;
  }
}

export async function mockVoice(
  page: Page,
  options: {
    permission?: 'allow' | 'deny' | 'pending';
    finalText?: string;
    autoComplete?: boolean;
    enabled?: boolean;
    sessionStatus?: number;
    maxSeconds?: number;
  } = {},
) {
  const calls = { sessions: [] as object[], questions: [] as { question: string }[] };
  const firstId = '11111111-1111-4111-8111-111111111111';
  const nextId = '22222222-2222-4222-8222-222222222222';
  let currentId = firstId;
  const history: object[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === '/api/v1/config')
      data = {
        officeName: '테스트',
        mode: 'prototype',
        maxQuestions: 3,
        questionLimitEnabled: false,
        voiceInputEnabled: options.enabled !== false,
      };
    if (path === '/api/v1/chat/history') data = { sessionId: currentId, messages: history };
    if (path === '/api/v1/chat/session') {
      currentId = nextId;
      data = { sessionId: nextId };
    }
    if (path === '/api/v1/voice/session') {
      calls.sessions.push(route.request().postDataJSON());
      if (options.sessionStatus) {
        await route.fulfill({
          status: options.sessionStatus,
          json: {
            success: false,
            error: {
              code: 'VOICE_RATE_LIMITED',
              message: '음성 입력 요청이 많아요. 1분 후 다시 시도해 주세요.',
            },
          },
        });
        return;
      }
      data = {
        clientSecret: 'ek_test',
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        maxDurationSeconds: options.maxSeconds ?? 120,
      };
    }
    if (path === '/api/v1/chat') {
      const body = route.request().postDataJSON();
      calls.questions.push(body);
      const questionId = `question-${calls.questions.length}`;
      const answerId = `answer-${calls.questions.length}`;
      history.push(
        {
          id: questionId,
          role: 'USER',
          content: body.question,
          parentMessageId: null,
          messageType: 'USER_QUESTION',
          processingStatus: 'COMPLETED',
        },
        {
          id: answerId,
          role: 'ASSISTANT',
          content: '계약서와 입금 내역을 확인해 주세요.',
          parentMessageId: questionId,
          messageType: 'AI_ANSWER',
          processingStatus: 'COMPLETED',
        },
      );
      data = {
        sessionId: currentId,
        answer: '계약서와 입금 내역을 확인해 주세요.',
        answerMessageId: answerId,
      };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.route('https://api.openai.com/v1/realtime/calls', async (route) => {
    if (route.request().headers().authorization !== 'Bearer ek_test')
      throw new Error('Unexpected voice credential');
    await route.fulfill({ contentType: 'application/sdp', body: 'v=0\r\nmock answer\r\n' });
  });
  await page.addInitScript(
    ({ permission, finalText, autoComplete }) => {
      const tracks: FakeTrack[] = [];
      const peers: FakePeer[] = [];
      const channels: FakeChannel[] = [];
      let releasePermission: () => void = () => {};
      let permissionRequests = 0;
      let commits = 0;
      class FakeTrack extends EventTarget {
        enabled = true;
        stopped = false;
        stop() {
          this.stopped = true;
        }
      }
      class FakeChannel extends EventTarget {
        readyState = 'connecting';
        send(value: string) {
          const event = JSON.parse(value);
          if (event.type !== 'input_audio_buffer.commit')
            throw new Error('Only transcription commits are allowed');
          commits++;
          if (!autoComplete) return;
          // Completion may arrive before the commit acknowledgement. The client
          // must reconcile by item_id, and must not append duplicate completions.
          const final = {
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: 'speech-1',
            transcript: finalText,
          };
          for (const data of [
            final,
            { type: 'input_audio_buffer.committed', item_id: 'speech-1' },
            final,
          ])
            this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
        }
        close() {
          this.readyState = 'closed';
          this.dispatchEvent(new Event('close'));
        }
      }
      class FakePeer extends EventTarget {
        connectionState = 'new';
        localDescription: { sdp?: string } | null = null;
        channel?: FakeChannel;
        constructor() {
          super();
          peers.push(this);
        }
        addTrack() {}
        createDataChannel() {
          this.channel = new FakeChannel();
          channels.push(this.channel);
          return this.channel;
        }
        async createOffer() {
          return { type: 'offer', sdp: 'v=0\r\nmock offer\r\n' };
        }
        async setLocalDescription(offer: { sdp?: string }) {
          this.localDescription = offer;
        }
        async setRemoteDescription() {
          this.connectionState = 'connected';
          if (this.channel) {
            this.channel.readyState = 'open';
            this.channel.dispatchEvent(new Event('open'));
          }
        }
        close() {
          this.connectionState = 'closed';
          this.dispatchEvent(new Event('connectionstatechange'));
        }
      }
      Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: FakePeer });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          permissionRequests++;
          if (permission === 'deny') throw new DOMException('Denied', 'NotAllowedError');
          if (permission === 'pending')
            await new Promise<void>((resolve) => {
              releasePermission = resolve;
            });
          const track = new FakeTrack();
          tracks.push(track);
          return { getTracks: () => [track] };
        },
      });
      window.voiceHarness = {
        emit(event, index) {
          const channel = index === undefined ? channels.at(-1) : channels[index];
          channel?.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }));
        },
        disconnect() {
          const peer = peers.at(-1);
          if (peer) {
            peer.connectionState = 'disconnected';
            peer.dispatchEvent(new Event('connectionstatechange'));
          }
        },
        releasePermission: () => releasePermission(),
        snapshot: () => ({
          stopped: tracks.map((track) => track.stopped),
          closed: peers.map((peer) => peer.connectionState === 'closed'),
          commits,
          permissionRequests,
        }),
      };
    },
    {
      permission: options.permission ?? 'allow',
      finalText: options.finalText ?? '보증금 500만 원을 돌려받지 못했어요.',
      autoComplete: options.autoComplete !== false,
    },
  );
  return calls;
}
