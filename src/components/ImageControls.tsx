import { ActionButton } from './ActionButton.tsx';

type ImageControlsProps = {
  onPrev: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onPrevRandom: () => void | Promise<void>;
  onForceRandom: () => void | Promise<void>;
  onNextRandom: () => void | Promise<void>;
  onToggleVerticalMirror: () => void | Promise<void>;
  onToggleHorizontalMirror: () => void | Promise<void>;
  onToggleGreyscale: () => void | Promise<void>;
  onToggleStartStop: () => void | Promise<void>;
  onTogglePausePlay: () => void | Promise<void>;
  onToggleTimerFlowMode: () => void | Promise<void>;
  onInitialSecondsChange: (seconds: number) => void;
  onRemainingSecondsChange: (seconds: number) => void;
  initialSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  timerFlowMode: 'random' | 'normal';
};

export function ImageControls({
  onPrev,
  onNext,
  onPrevRandom,
  onForceRandom,
  onNextRandom,
  onToggleVerticalMirror,
  onToggleHorizontalMirror,
  onToggleGreyscale,
  onToggleStartStop,
  onTogglePausePlay,
  onToggleTimerFlowMode,
  onInitialSecondsChange,
  onRemainingSecondsChange,
  initialSeconds,
  remainingSeconds,
  isRunning,
  timerFlowMode,
}: ImageControlsProps) {
  return (
    <div
      data-testid="image-buttons-row"
      style={{
        display: 'flex',
        flexDirection: 'row',
        marginTop: 'auto',
        marginBottom: '10px',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          border: '1px solid #414868',
          background: '#1f2335',
          padding: '8px',
          flexDirection: 'row',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            background: '#24283b',
            color: '#c0caf5',
            border: '1px solid #565f89',
            borderRadius: '2px',
            fontFamily: 'monospace',
            fontSize: '12px',
            letterSpacing: '0.04em',
            minHeight: '24px',
            display: 'flex',
            alignItems: 'center',
            padding: '2px 6px',
            gap: '4px',
          }}
        >
          <span>[</span>
          <button
            onClick={onToggleStartStop}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#c0caf5',
              fontFamily: 'monospace',
              fontSize: '12px',
              letterSpacing: '0.04em',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {isRunning ? 'stop' : 'start'}
          </button>
          <span>-</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={initialSeconds}
            onChange={(e) => {
              onInitialSecondsChange(Number(e.target.value));
            }}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: '#c0caf5',
              fontFamily: 'monospace',
              fontSize: '12px',
              width: '3ch',
              padding: 0,
              margin: 0,
              textAlign: 'right',
            }}
          />
          <span>]</span>
        </div>

        <div
          style={{
            background: '#24283b',
            color: '#c0caf5',
            border: '1px solid #565f89',
            borderRadius: '2px',
            fontFamily: 'monospace',
            fontSize: '12px',
            letterSpacing: '0.04em',
            minHeight: '24px',
            display: 'flex',
            alignItems: 'center',
            padding: '2px 6px',
            gap: '4px',
          }}
        >
          <span>[</span>
          <button
            onClick={onTogglePausePlay}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#c0caf5',
              fontFamily: 'monospace',
              fontSize: '12px',
              letterSpacing: '0.04em',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {isRunning ? 'pause' : 'play'}
          </button>
          <span>-</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={remainingSeconds}
            onChange={(e) => {
              onRemainingSecondsChange(Number(e.target.value));
            }}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: '#c0caf5',
              fontFamily: 'monospace',
              fontSize: '12px',
              width: '3ch',
              padding: 0,
              margin: 0,
              textAlign: 'right',
            }}
          />
          <span>]</span>
        </div>

        <button
          onClick={onToggleTimerFlowMode}
          style={{
            background: '#24283b',
            color: '#c0caf5',
            border: '1px solid #565f89',
            borderRadius: '2px',
            fontFamily: 'monospace',
            fontSize: '12px',
            letterSpacing: '0.04em',
            minHeight: '28px',
            cursor: 'pointer',
            padding: '5px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ color: timerFlowMode === 'random' ? '#f7768e' : '#8f93aa' }}>random</span>
          <span style={{ color: '#8f93aa' }}>|</span>
          <span style={{ color: timerFlowMode === 'normal' ? '#7aa2f7' : '#8f93aa' }}>normal</span>
        </button>
      </div>

      <div
        style={{
          border: '1px solid #414868',
          background: '#1f2335',
          padding: '8px',
          flexDirection: 'row',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        <ActionButton label="vertical-mirror" onClick={onToggleVerticalMirror} />
        <ActionButton label="horizontal-mirror" onClick={onToggleHorizontalMirror} />
        <ActionButton label="greyscale" onClick={onToggleGreyscale} />
      </div>

      <div
        style={{
          border: '1px solid #414868',
          background: '#1f2335',
          padding: '8px',
          flexDirection: 'row',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        <ActionButton label="prev" onClick={onPrev} />
        <ActionButton label="next" onClick={onNext} />
        <ActionButton label="prev-random" onClick={onPrevRandom} />
        <ActionButton label="new-random" onClick={onForceRandom} />
        <ActionButton label="next-random" onClick={onNextRandom} />
      </div>
    </div>
  );
}
