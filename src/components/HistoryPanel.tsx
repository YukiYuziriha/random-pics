type HistoryPanelProps = {
  panelTestId: string;
  listContainerTestId: string;
  listItemTestId: string;
  items: Array<string | null>;
  currentSlotIndex: number;
};

export function HistoryPanel({
  panelTestId,
  listContainerTestId,
  listItemTestId,
  items,
  currentSlotIndex,
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
        justifyContent: 'center',
        alignItems: 'stretch',
        overflow: 'hidden',
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
          return (
            <div
              data-testid={listItemTestId}
              key={`${i}-${item ?? 'empty'}`}
              style={{
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: item ? (isCurrent ? '#fff' : '#a0a0a0') : 'transparent',
                background: isCurrent ? '#3b2f1f' : 'transparent',
                fontWeight: isCurrent ? 700 : 400,
                fontFamily: 'monospace',
                borderRadius: '4px',
              }}
            >
              {item ? item.split('/').pop() : 'placeholder'}
            </div>
          );
        })}
      </div>
    </div>
  );
}
