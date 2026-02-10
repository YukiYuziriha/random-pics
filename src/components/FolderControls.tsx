import { ActionButton } from './ActionButton.tsx';
import { getShortcutDisplayOrder, getShortcutLabel } from '../shortcuts.ts';

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
  const orderedActionIds = getShortcutDisplayOrder('folder-controls', shortcutHintSide);
  const onClickForAction = (actionId: string): (() => void | Promise<void>) => {
    switch (actionId) {
      case 'prev-folder':
        return onPrevFolder;
      case 'next-folder':
        return onNextFolder;
      case 'reindex-folder':
        return onReindexFolder;
      case 'pick-folder':
        return onPickFolder;
      default:
        return () => {};
    }
  };

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
      {orderedActionIds.map((actionId) => (
        <ActionButton
          key={actionId}
          label={getShortcutLabel(actionId, shortcutHintSide, shortcutHintsVisible)}
          onClick={onClickForAction(actionId)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
