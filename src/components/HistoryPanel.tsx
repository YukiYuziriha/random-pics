import type { FolderHistoryItem } from '../apiClient.ts';

type HistoryItem = string | FolderHistoryItem;

type HistoryPanelProps = {
  panelTestId: string;
  listContainerTestId: string;
  listItemTestId: string;
  items: Array<HistoryItem | null>;
  currentSlotIndex: number;
  pendingItem?: string | null;
  onItemClick?: (slotIndex: number) => void;
};

function displayLabel(item: HistoryItem): string {
  if (typeof item === 'string') {
    return item.split('/').pop() || item;
  }

  const folderName = item.path.split('/').pop() || item.path;
  return `${folderName} (${item.imageCount})`;
}

function itemPath(item: HistoryItem): string {
  return typeof item === 'string' ? item : item.path;
}

export function HistoryPanel({
  panelTestId,
  listContainerTestId,
  listItemTestId,
  items,
  currentSlotIndex,
  pendingItem = null,
  onItemClick,
}: HistoryPanelProps) {
  return (
    <div
      data-testid={panelTestId}
      style={{
        width: '20vw',
        height: '80vh',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        alignSelf: 'center',
        justifyContent: 'center',
        alignItems: 'stretch',
        overflow: 'hidden',
        background: '#1f2335',
        border: '1px solid #414868',
      }}
    >
      <div
        data-testid={listContainerTestId}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          overflowY: 'auto',
        }}
      >
        {items.map((item, i) => {
          const isCurrent = i === currentSlotIndex;
          const isPending = !!item && pendingItem === itemPath(item);
          const isClickable = !!item && !isCurrent && !!onItemClick;
          return (
            <div
              data-testid={listItemTestId}
              key={`${i}-${item ?? 'empty'}`}
              onClick={isClickable ? () => onItemClick(i) : undefined}
              style={{
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: item ? (isPending ? '#f2d06b' : isCurrent ? '#c0caf5' : '#a9b1d6') : 'transparent',
                background: isCurrent ? '#2f334d' : 'transparent',
                fontWeight: isCurrent ? 700 : 400,
                fontFamily: 'monospace',
                borderRadius: '2px',
                cursor: isClickable ? 'pointer' : 'default',
              }}
            >
              {item ? `${displayLabel(item)}${isPending ? ' [loading...]' : ''}` : 'placeholder'}
            </div>
          );
        })}
      </div>
    </div>
  );
}
