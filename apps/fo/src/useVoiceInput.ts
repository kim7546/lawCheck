import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSessionResponse } from '@lawcheck/contracts';

type Phase = 'idle' | 'connecting' | 'listening' | 'finalizing' | 'error';
type Transcript = { text: string; complete: boolean };
type Recording = {
  phase: Phase;
  closed: boolean;
  abort: AbortController;
  stream?: MediaStream;
  peer?: RTCPeerConnection;
  channel?: RTCDataChannel;
  timers: Set<number>;
  items: Map<string, Transcript>;
  seenEvents: Set<string>;
  committedId?: string;
  commitSent: boolean;
  finish?: () => void;
};

function closeRecording(recording: Recording) {
  recording.closed = true;
  recording.abort.abort();
  for (const timer of recording.timers) window.clearTimeout(timer);
  recording.stream?.getTracks().forEach((track) => track.stop());
  recording.channel?.close();
  recording.peer?.close();
}

function draftText(recording: Recording) {
  return [...recording.items.values()].map((item) => item.text).join('\n');
}

export function useVoiceInput(options: {
  conversationId: string;
  enabled: boolean;
  disabled: boolean;
  draftLength: number;
  onTranscript: (text: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef<Recording | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const cancel = useCallback(() => {
    const recording = active.current;
    active.current = null;
    if (recording) closeRecording(recording);
    setPhase('idle');
    setTranscript('');
    setMessage('');
  }, []);

  useEffect(() => {
    cancel();
    return () => {
      const recording = active.current;
      active.current = null;
      if (recording) closeRecording(recording);
    };
  }, [options.conversationId, options.enabled, cancel]);

  useEffect(() => {
    const suspend = () => {
      const recording = active.current;
      if (!recording) return;
      active.current = null;
      closeRecording(recording);
      setTranscript(draftText(recording));
      setPhase('error');
      setMessage(
        '화면을 벗어나 음성 입력을 중지했어요. 인식한 내용을 확인하거나 다시 시작해 주세요.',
      );
    };
    const visibility = () => {
      if (document.hidden) suspend();
    };
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pagehide', suspend);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  async function start() {
    if (active.current || !latest.current.enabled || latest.current.disabled) return;
    setTranscript('');
    setMessage('');
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.RTCPeerConnection
    ) {
      setPhase('error');
      setMessage(
        '이 환경에서는 마이크를 사용할 수 없어요. HTTPS로 접속하거나 질문을 직접 입력해 주세요.',
      );
      return;
    }
    const context = latest.current.conversationId;
    const recording: Recording = {
      phase: 'connecting',
      closed: false,
      abort: new AbortController(),
      timers: new Set(),
      items: new Map(),
      seenEvents: new Set(),
      commitSent: false,
    };
    active.current = recording;
    setPhase('connecting');
    const current = () =>
      active.current === recording &&
      !recording.closed &&
      latest.current.conversationId === context;
    const timer = (callback: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        recording.timers.delete(id);
        if (current()) callback();
      }, ms);
      recording.timers.add(id);
      return id;
    };
    const fail = (reason: string) => {
      if (!current()) return;
      active.current = null;
      closeRecording(recording);
      setTranscript(draftText(recording));
      setMessage(reason);
      setPhase('error');
    };
    const complete = () => {
      if (!current() || recording.phase !== 'finalizing' || !recording.committedId) return;
      const item = recording.items.get(recording.committedId);
      if (!item?.complete) return;
      const text = item.text.trim();
      if (!text) {
        fail('음성을 인식하지 못했어요. 마이크를 확인하고 다시 말하거나 직접 입력해 주세요.');
        return;
      }
      active.current = null;
      closeRecording(recording);
      setPhase('idle');
      setTranscript('');
      setMessage('음성을 질문에 입력했어요. 금액·날짜·이름을 확인한 뒤 보내 주세요.');
      latest.current.onTranscript(text);
    };
    recording.finish = () => {
      if (!current() || recording.phase !== 'listening') return;
      recording.phase = 'finalizing';
      setPhase('finalizing');
      // Stop capturing immediately. Allow the last in-flight RTP packets to
      // arrive before committing the buffer on the separate data channel.
      recording.stream?.getTracks().forEach((track) => track.stop());
      timer(() => {
        if (recording.channel?.readyState !== 'open') {
          fail('음성 연결이 끊겼어요. 인식한 내용을 확인하거나 다시 시도해 주세요.');
          return;
        }
        recording.commitSent = true;
        try {
          recording.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        } catch {
          fail('음성 연결이 끊겼어요. 인식한 내용을 확인하거나 다시 시도해 주세요.');
        }
      }, 350);
      timer(
        () => fail('최종 인식 결과를 기다리다 연결이 종료됐어요. 인식한 내용을 확인해 주세요.'),
        15_000,
      );
    };
    const connectingTimeout = timer(
      () =>
        fail('마이크 연결 시간이 길어지고 있어요. 브라우저 권한을 확인하고 다시 시도해 주세요.'),
      30_000,
    );

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (!current()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      recording.stream = stream;
      const peer = new RTCPeerConnection();
      recording.peer = peer;
      for (const track of stream.getTracks()) {
        track.enabled = false;
        track.addEventListener('ended', () => {
          if (recording.phase === 'listening' || recording.phase === 'connecting')
            fail('마이크 연결이 끊겼어요. 장치를 확인하거나 직접 입력해 주세요.');
        });
        peer.addTrack(track, stream);
      }
      peer.addEventListener('connectionstatechange', () => {
        if (['failed', 'disconnected', 'closed'].includes(peer.connectionState))
          fail('음성 연결이 끊겼어요. 인식한 내용을 확인하거나 다시 시도해 주세요.');
      });
      const channel = peer.createDataChannel('oai-events');
      recording.channel = channel;
      channel.addEventListener('close', () =>
        fail('음성 연결이 종료됐어요. 인식한 내용을 확인해 주세요.'),
      );
      channel.addEventListener('error', () =>
        fail('음성 연결에 문제가 생겼어요. 다시 시도해 주세요.'),
      );
      channel.addEventListener('message', (event: MessageEvent) => {
        if (!current() || typeof event.data !== 'string') return;
        let data: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
          data = parsed as Record<string, unknown>;
        } catch {
          return;
        }
        if (typeof data.event_id === 'string') {
          if (recording.seenEvents.has(data.event_id)) return;
          recording.seenEvents.add(data.event_id);
        }
        if (
          data.type === 'error' ||
          data.type === 'conversation.item.input_audio_transcription.failed'
        ) {
          fail('음성을 인식하지 못했어요. 인식한 내용을 확인하거나 다시 말해 주세요.');
          return;
        }
        if (typeof data.item_id !== 'string') return;
        if (data.type === 'input_audio_buffer.committed' && recording.commitSent) {
          recording.committedId = data.item_id;
          complete();
          return;
        }
        const previous = recording.items.get(data.item_id);
        if (
          data.type === 'conversation.item.input_audio_transcription.delta' &&
          typeof data.delta === 'string'
        ) {
          if (previous?.complete) return;
          recording.items.set(data.item_id, {
            text: (previous?.text ?? '') + data.delta,
            complete: false,
          });
        } else if (
          data.type === 'conversation.item.input_audio_transcription.completed' &&
          typeof data.transcript === 'string'
        ) {
          recording.items.set(data.item_id, { text: data.transcript, complete: true });
        } else return;
        const text = draftText(recording);
        setTranscript(text);
        // Do not truncate recognized numbers or names. The composer lets the
        // user edit an overlong final result before the existing 2,000-char cap.
        if (text.length + latest.current.draftLength >= 2000) recording.finish?.();
        complete();
      });
      const offer = await peer.createOffer();
      if (!current()) return;
      await peer.setLocalDescription(offer);
      if (!current()) return;
      const sessionResponse = await fetch('/api/v1/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context.startsWith('draft') ? {} : { sessionId: context }),
        signal: recording.abort.signal,
      });
      const session: VoiceSessionResponse = await sessionResponse.json();
      if (!current()) return;
      if (!sessionResponse.ok || !session.success) {
        fail(!session.success ? session.error.message : '음성 연결을 시작하지 못했어요.');
        return;
      }
      if (
        typeof session.data.clientSecret !== 'string' ||
        !session.data.clientSecret.startsWith('ek_') ||
        session.data.expiresAt * 1000 <= Date.now()
      ) {
        fail('음성 연결 정보가 만료됐어요. 다시 시작해 주세요.');
        return;
      }
      const maxSeconds = Math.min(120, Math.max(1, session.data.maxDurationSeconds || 120));
      channel.addEventListener('open', () => {
        if (!current() || recording.phase !== 'connecting') return;
        window.clearTimeout(connectingTimeout);
        recording.timers.delete(connectingTimeout);
        recording.phase = 'listening';
        stream.getTracks().forEach((track) => {
          track.enabled = true;
        });
        setPhase('listening');
        timer(() => recording.finish?.(), maxSeconds * 1000);
      });
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.data.clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: peer.localDescription?.sdp ?? offer.sdp,
        signal: recording.abort.signal,
      });
      if (!current()) return;
      if (!response.ok) {
        fail('음성 서비스에 연결하지 못했어요. 다시 시도하거나 직접 입력해 주세요.');
        return;
      }
      const sdp = await response.text();
      if (!current()) return;
      await peer.setRemoteDescription({ type: 'answer', sdp });
    } catch (error) {
      if (!current()) return;
      const name = error instanceof Error ? error.name : '';
      fail(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? '마이크 사용이 허용되지 않았어요. 브라우저의 마이크 권한을 허용하거나 직접 입력해 주세요.'
          : name === 'NotFoundError' || name === 'NotReadableError'
            ? '마이크를 사용할 수 없어요. 장치 연결과 다른 앱의 마이크 사용 여부를 확인해 주세요.'
            : '음성 입력에 연결하지 못했어요. 다시 시도하거나 직접 입력해 주세요.',
      );
    }
  }

  const usePartial = () => {
    if (phase !== 'error' || !transcript.trim() || latest.current.disabled) return;
    const text = transcript.trim();
    cancel();
    latest.current.onTranscript(text);
    setMessage('인식한 내용을 질문에 입력했어요. 빠진 부분과 금액·날짜를 확인해 주세요.');
  };

  return {
    phase,
    transcript,
    message,
    busy: phase === 'connecting' || phase === 'listening' || phase === 'finalizing',
    start,
    finish: () => active.current?.finish?.(),
    cancel,
    usePartial,
  };
}

export type VoiceInputState = ReturnType<typeof useVoiceInput>;
