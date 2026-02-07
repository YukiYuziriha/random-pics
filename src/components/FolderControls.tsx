import { ActionButton } from './ActionButton.tsx';

type FolderControlsProps = {
  onPrevFolder: () => void | Promise<void>;
  onPickFolder: () => void | Promise<void>;
  onReindexFolder: () => void | Promise<void>;
  onNextFolder: () => void | Promise<void>;
  onFullWipe: () => void | Promise<void>;
};

export function FolderControls({
  onPrevFolder,
  onPickFolder,
  onReindexFolder,
  onNextFolder,
  onFullWipe,
}: FolderControlsProps) {
  return (
    <div
      data-testid="folder-buttons-row"
      style={{
        flexDirection: 'row',
        display: 'flex',
        marginBottom: 'auto',
        alignItems: 'center',
      }}
    >
      <ActionButton label="prev-folder" onClick={onPrevFolder} />
      <ActionButton label="pick-folder" onClick={onPickFolder} />
      <ActionButton label="reindex-folder" onClick={onReindexFolder} />
      <ActionButton label="next-folder" onClick={onNextFolder} />
      <ActionButton label="full_wipe" onClick={onFullWipe} />
    </div>
  );
}
