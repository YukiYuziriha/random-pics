import { ActionButton } from './ActionButton.tsx';
import { getShortcutDisplayOrder, getShortcutKey, getShortcutLabel } from '../shortcuts.ts';

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
  disabled?: boolean;
  shortcutHintsVisible?: boolean;
  shortcutHintSide?: 'left' | 'right';
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
  disabled = false,
  shortcutHintsVisible = false,
  shortcutHintSide = 'left',
}: ImageControlsProps) {
  const startStopLabel = getShortcutLabel('start-stop', shortcutHintSide, shortcutHintsVisible).replace('start-stop', isRunning ? 'stop' : 'start');
  const playPauseLabel = getShortcutLabel('play-pause', shortcutHintSide, shortcutHintsVisible).replace('play-pause', isRunning ? 'pause' : 'play');
  const row1ActionIds = getShortcutDisplayOrder('bottom-row-1', shortcutHintSide);
  const row2ActionIds = getShortcutDisplayOrder('bottom-row-2', shortcutHintSide);
  const row2EffectActionIds = getShortcutDisplayOrder('bottom-row-2-effects', shortcutHintSide);

  const renderRow1Action = (actionId: string) => {
    if (actionId === 'start-stop') {
      return (
        <div
          key={actionId}
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
          <button
            onClick={onToggleStartStop}
            disabled={disabled}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#c0caf5',
              fontFamily: 'monospace',
              fontSize: '12px',
              letterSpacing: '0.04em',
              padding: 0,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {startStopLabel}
          </button>
          <span>-</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={initialSeconds}
            disabled={disabled}
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
        </div>
      );
    }

    if (actionId === 'play-pause') {
      return (
        <div
          key={actionId}
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
          <button
            onClick={onTogglePausePlay}
            disabled={disabled}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#c0caf5',
              fontFamily: 'monospace',
              fontSize: '12px',
              letterSpacing: '0.04em',
              padding: 0,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {playPauseLabel}
          </button>
          <span>-</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={remainingSeconds}
            disabled={disabled}
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
        </div>
      );
    }

    if (actionId === 'toggle-flow-mode') {
      const flowKey = getShortcutKey('toggle-flow-mode', shortcutHintSide);
      return (
        <button
          key={actionId}
          onClick={onToggleTimerFlowMode}
          disabled={disabled}
          style={{
            background: '#24283b',
            color: '#c0caf5',
            border: '1px solid #565f89',
            borderRadius: '2px',
            fontFamily: 'monospace',
            fontSize: '12px',
            letterSpacing: '0.04em',
            minHeight: '28px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: '5px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {shortcutHintsVisible && flowKey && <span>[{flowKey}]</span>}
          <span style={{ color: timerFlowMode === 'random' ? '#f7768e' : '#8f93aa' }}>random</span>
          <span style={{ color: '#8f93aa' }}>|</span>
          <span style={{ color: timerFlowMode === 'normal' ? '#7aa2f7' : '#8f93aa' }}>normal</span>
        </button>
      );
    }

    if (actionId === 'force-random') {
      return (
        <ActionButton
          key={actionId}
          label={getShortcutLabel('force-random', shortcutHintSide, shortcutHintsVisible)}
          onClick={onForceRandom}
          disabled={disabled}
        />
      );
    }

    return null;
  };

  const renderRow2Action = (actionId: string) => {
    switch (actionId) {
      case 'prev-random':
        return <ActionButton key={actionId} label={getShortcutLabel(actionId, shortcutHintSide, shortcutHintsVisible)} onClick={onPrevRandom} disabled={disabled} />;
      case 'prev-normal':
        return <ActionButton key={actionId} label={getShortcutLabel(actionId, shortcutHintSide, shortcutHintsVisible)} onClick={onPrev} disabled={disabled} />;
      case 'next-normal':
        return <ActionButton key={actionId} label={getShortcutLabel(actionId, shortcutHintSide, shortcutHintsVisible)} onClick={onNext} disabled={disabled} />;
      case 'next-random':
        return <ActionButton key={actionId} label={getShortcutLabel(actionId, shortcutHintSide, shortcutHintsVisible)} onClick={onNextRandom} disabled={disabled} />;
      default:
        return null;
    }
  };

  const renderRow2EffectAction = (actionId: string) => {
    switch (actionId) {
      case 'vertical-mirror':
        return <ActionButton key={actionId} label={getShortcutLabel(actionId, shortcutHintSide, shortcutHintsVisible)} onClick={onToggleVerticalMirror} disabled={disabled} />;
      case 'horizontal-mirror':
        return <ActionButton key={actionId} label={getShortcutLabel(actionId, shortcutHintSide, shortcutHintsVisible)} onClick={onToggleHorizontalMirror} disabled={disabled} />;
      case 'grayscale':
        return <ActionButton key={actionId} label={getShortcutLabel(actionId, shortcutHintSide, shortcutHintsVisible)} onClick={onToggleGreyscale} disabled={disabled} />;
      default:
        return null;
    }
  };

  return (
    <div
      data-testid="image-buttons-row"
      style={{
        display: 'flex',
        flexDirection: 'column',
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
        {row1ActionIds.map(renderRow1Action)}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
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
          {row2ActionIds.map(renderRow2Action)}
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
          {row2EffectActionIds.map(renderRow2EffectAction)}
        </div>
      </div>
    </div>
  );
}
