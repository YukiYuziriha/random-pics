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
  onStartTimer: () => void | Promise<void>;
  remaining: number;
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
  onStartTimer,
  remaining,
}: ImageControlsProps) {
  return (
    <div
      data-testid="image-buttons-row"
      style={{
        flexDirection: 'row',
        display: 'flex',
        marginTop: 'auto',
        alignItems: 'center',
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
      <ActionButton label={`start-${remaining}`} onClick={onStartTimer} />
    </div>
  );
}
