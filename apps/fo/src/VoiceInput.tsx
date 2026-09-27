import { Mic, Square, X } from 'lucide-react';
import type { VoiceInputState } from './useVoiceInput';

export function VoiceButton({ voice, disabled }: { voice: VoiceInputState; disabled: boolean }) {
  return (
    <button
      type="button"
      className={`voice-button${voice.busy ? ' active' : ''}`}
      disabled={disabled || voice.busy}
      onClick={() => void voice.start()}
      aria-label="음성으로 질문 입력"
      title="음성으로 질문 입력"
      aria-pressed={voice.busy}
    >
      <Mic size={19} aria-hidden="true" />
    </button>
  );
}

export function VoiceInput({ voice }: { voice: VoiceInputState }) {
  if (!voice.busy && !voice.message) return null;
  const status =
    voice.phase === 'connecting'
      ? '마이크에 연결하고 있어요'
      : voice.phase === 'listening'
        ? '듣고 있어요 · 최대 2분'
        : voice.phase === 'finalizing'
          ? '인식한 내용을 마무리하고 있어요'
          : voice.message;
  return (
    <section
      className={`voice-panel${voice.phase === 'error' ? ' voice-error' : ''}`}
      aria-label="음성 입력"
    >
      <div className="voice-heading">
        <p role="status" aria-live="polite">
          {voice.phase === 'listening' && <span className="voice-indicator" aria-hidden="true" />}
          {status}
        </p>
        <button
          type="button"
          className="icon-button"
          onClick={voice.cancel}
          aria-label={voice.busy ? '음성 입력 취소' : '음성 안내 닫기'}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      {voice.transcript && (
        <p className="voice-transcript" aria-label="인식 중인 내용">
          {voice.transcript}
        </p>
      )}
      {voice.busy && (
        <p className="voice-disclosure">
          음성은 인식을 위해 OpenAI로 전송됩니다. 질문은 내용을 확인한 뒤 전송할 수 있어요.
        </p>
      )}
      {voice.phase === 'listening' && (
        <button type="button" className="voice-finish" onClick={voice.finish}>
          <Square size={13} fill="currentColor" aria-hidden="true" /> 말하기 완료
        </button>
      )}
      {voice.phase === 'error' && voice.transcript.trim() && (
        <button type="button" className="voice-finish" onClick={voice.usePartial}>
          인식한 내용 사용
        </button>
      )}
    </section>
  );
}
