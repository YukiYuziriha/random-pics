import { useState } from 'react';
import type { FolderHistoryItem, ImageHistoryItem } from '../apiClient.ts';

type HistoryItem = ImageHistoryItem | FolderHistoryItem;

type HistoryPanelProps = {
  panelTestId: string;
  listContainerTestId: string;
  listItemTestId: string;
  items: Array<HistoryItem | null>;
  currentSlotIndex: number;
  pendingItem?: string | null;
  onItemClick?: (slotIndex: number) => void;
  onFolderDeleteClick?: (slotIndex: number) => void;
  onImageHideClick?: (slotIndex: number) => void;
};

function displayLabel(item: HistoryItem): string {
  if ('imageId' in item) {
    return item.path.split('/').pop() || item.path;
  }

  const folderName = item.path.split('/').pop() || item.path;
  return `${folderName} (${item.imageCount})`;
}

function itemPath(item: HistoryItem): string {
  return item.path;
}

export function HistoryPanel({
  panelTestId,
  listContainerTestId,
  listItemTestId,
  items,
  currentSlotIndex,
  pendingItem = null,
  onItemClick,
  onFolderDeleteClick,
  onImageHideClick,
}: HistoryPanelProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex((current) => (current === i ? null : current))}
              style={{
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: item ? (isPending ? '#f2d06b' : isCurrent ? '#c0caf5' : '#a9b1d6') : 'transparent',
                background: isCurrent ? '#2f334d' : 'transparent',
                fontWeight: isCurrent ? 700 : 400,
                fontFamily: 'monospace',
                borderRadius: '2px',
                cursor: isClickable ? 'pointer' : 'default',
                padding: '0 6px',
                gap: '6px',
              }}
            >
              {item && onFolderDeleteClick && 'imageCount' in item ? (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onFolderDeleteClick(i);
                  }}
                  aria-label="delete-folder-from-history"
                  style={{
                    visibility: hoveredIndex === i ? 'visible' : 'hidden',
                    border: 'none',
                    background: 'transparent',
                    color: '#f7768e',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    padding: 0,
                    width: '14px',
                    flexShrink: 0,
                  }}
                >
                  x
                </button>
              ) : (
                <span style={{ width: '14px', flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item ? `${displayLabel(item)}${isPending ? ' [loading...]' : ''}` : 'placeholder'}
              </span>
              {item && onImageHideClick && 'imageId' in item ? (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onImageHideClick(i);
                  }}
                  aria-label="hide-image-from-history"
                  style={{
                    visibility: hoveredIndex === i ? 'visible' : 'hidden',
                    border: 'none',
                    background: 'transparent',
                    color: '#f2d06b',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    padding: 0,
                    width: '14px',
                    flexShrink: 0,
                  }}
                >
                  -
                </button>
              ) : (
                <span style={{ width: '14px', flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
