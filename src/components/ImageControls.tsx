import { ActionButton } from './ActionButton.tsx';

type ImageControlsProps = {
  onPrev: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onPrevRandom: () => void | Promise<void>;
  onForceRandom: () => void | Promise<void>;
  onNextRandom: () => void | Promise<void>;
  onResetRandomHistory: () => void | Promise<void>;
  onResetNormalHistory: () => void | Promise<void>;
  onToggleVerticalMirror: () => void | Promise<void>;
  onToggleHorizontalMirror: () => void | Promise<void>;
  onToggleGreyscale: () => void | Promise<void>;
  onToggleStartStop: () => void | Promise<void>;
  onTogglePausePlay: () => void | Promise<void>;
  onInitialSecondsChange: (seconds: number) => void;
  onRemainingSecondsChange: (seconds: number) => void;
  initialSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
};

export function ImageControls({
  onPrev,
  onNext,
  onPrevRandom,
  onForceRandom,
  onNextRandom,
  onResetRandomHistory,
  onResetNormalHistory,
  onToggleVerticalMirror,
  onToggleHorizontalMirror,
  onToggleGreyscale,
  onToggleStartStop,
  onTogglePausePlay,
  onInitialSecondsChange,
  onRemainingSecondsChange,
  initialSeconds,
  remainingSeconds,
  isRunning,
}: ImageControlsProps) {
  return (
    <div
      data-testid="image-buttons-row"
      style={{
        flexDirection: 'row',
        display: 'flex',
        marginTop: 'auto',
        marginBottom: '10px',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        padding: '8px',
        border: '1px solid #414868',
        background: '#1f2335',
      }}
    >
      <ActionButton label="prev" onClick={onPrev} />
      <ActionButton label="next" onClick={onNext} />
      <ActionButton label="prev-random" onClick={onPrevRandom} />
      <ActionButton label="new-random" onClick={onForceRandom} />
      <ActionButton label="next-random" onClick={onNextRandom} />
      <ActionButton label="reset-random-history" onClick={onResetRandomHistory} />
      <ActionButton label="reset_normal_history" onClick={onResetNormalHistory} />
      <ActionButton label="vertical-mirror" onClick={onToggleVerticalMirror} />
      <ActionButton label="horizontal-mirror" onClick={onToggleHorizontalMirror} />
      <ActionButton label="greyscale" onClick={onToggleGreyscale} />
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
    </div>
  );
}
