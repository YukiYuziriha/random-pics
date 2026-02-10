import { ActionButton } from './ActionButton.tsx';
import { getShortcutLabel } from '../shortcuts.ts';

type FolderControlsProps = {
  onPrevFolder: () => void | Promise<void>;
  onPickFolder: () => void | Promise<void>;
  onReindexFolder: () => void | Promise<void>;
  onNextFolder: () => void | Promise<void>;
  disabled?: boolean;
  shortcutHintsVisible?: boolean;
  shortcutHintSide?: 'left' | 'right';
};

export function FolderControls({
  onPrevFolder,
  onPickFolder,
  onReindexFolder,
  onNextFolder,
  disabled = false,
  shortcutHintsVisible = false,
  shortcutHintSide = 'left',
}: FolderControlsProps) {
  return (
    <div
      data-testid="folder-buttons-row"
      style={{
        flexDirection: 'row',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        padding: '8px',
        border: '1px solid #414868',
        background: '#1f2335',
      }}
    >
      <ActionButton label={getShortcutLabel('prev-folder', shortcutHintSide, shortcutHintsVisible)} onClick={onPrevFolder} disabled={disabled} />
      <ActionButton label={getShortcutLabel('pick-folder', shortcutHintSide, shortcutHintsVisible)} onClick={onPickFolder} disabled={disabled} />
      <ActionButton label={getShortcutLabel('reindex-folder', shortcutHintSide, shortcutHintsVisible)} onClick={onReindexFolder} disabled={disabled} />
      <ActionButton label={getShortcutLabel('next-folder', shortcutHintSide, shortcutHintsVisible)} onClick={onNextFolder} disabled={disabled} />
    </div>
  );
}
