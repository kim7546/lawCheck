import { useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

export function BoardDetail({
  children,
  busy,
  onBack,
}: {
  children: ReactNode;
  busy: boolean;
  onBack: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="board-detail"
      onTouchStart={(event) => {
        start.current = null;
        if (busy || !window.matchMedia('(max-width: 760px)').matches || event.touches.length !== 1)
          return;
        if (
          event.target instanceof Element &&
          event.target.closest('input, textarea, select, button, a, [contenteditable]')
        )
          return;
        const touch = event.touches[0]!;
        start.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(event) => {
        const touch = event.touches[0];
        if (
          event.touches.length !== 1 ||
          !touch ||
          (start.current && Math.abs(touch.clientY - start.current.y) > 40)
        )
          start.current = null;
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
      onTouchEnd={(event) => {
        const origin = start.current;
        start.current = null;
        const touch = event.changedTouches[0];
        if (!origin || !touch || busy || event.touches.length) return;
        const dx = touch.clientX - origin.x;
        const dy = Math.abs(touch.clientY - origin.y);
        if (dx >= 80 && dy <= 40 && dx > dy * 2) onBack();
      }}
    >
      {children}
      <div className="detail-actions">
        <button disabled={busy} onClick={onBack}>
          <ArrowLeft size={16} />
          목록으로
        </button>
      </div>
    </div>
  );
}
