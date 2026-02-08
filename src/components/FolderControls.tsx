import { ActionButton } from './ActionButton.tsx';

type FolderControlsProps = {
  onPrevFolder: () => void | Promise<void>;
  onPickFolder: () => void | Promise<void>;
  onReindexFolder: () => void | Promise<void>;
  onNextFolder: () => void | Promise<void>;
};

export function FolderControls({
  onPrevFolder,
  onPickFolder,
  onReindexFolder,
  onNextFolder,
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
      <ActionButton label="prev-folder" onClick={onPrevFolder} />
      <ActionButton label="pick-folder" onClick={onPickFolder} />
      <ActionButton label="reindex-folder" onClick={onReindexFolder} />
      <ActionButton label="next-folder" onClick={onNextFolder} />
    </div>
  );
}
