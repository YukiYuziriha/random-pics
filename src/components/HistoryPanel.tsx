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
                color: item ? (isCurrent ? '#c0caf5' : '#a9b1d6') : 'transparent',
                background: isCurrent ? '#2f334d' : 'transparent',
                fontWeight: isCurrent ? 700 : 400,
                fontFamily: 'monospace',
                borderRadius: '2px',
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
