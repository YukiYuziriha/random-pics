import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { FolderTreeFlatNode } from '../folderTree.ts';
import { folderLabel } from '../folderTree.ts';

type FolderTreePanelProps = {
  nodes: FolderTreeFlatNode[];
  onToggleExpand: (path: string) => void;
  onToggleChecked: (path: string, checked: boolean) => void;
  onExclusiveSelect: (path: string) => void;
};

export function FolderTreePanel({
  nodes,
  onToggleExpand,
  onToggleChecked,
  onExclusiveSelect,
}: FolderTreePanelProps) {
  const checkboxRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; startY: number; startScrollTop: number }>({
    active: false,
    startY: 0,
    startScrollTop: 0,
  });
  const [metrics, setMetrics] = useState({
    scrollTop: 0,
    clientHeight: 0,
    scrollHeight: 1,
  });

  const updateMetrics = () => {
    const el = listRef.current;
    if (!el) return;
    setMetrics({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: Math.max(1, el.scrollHeight),
    });
  };

  useEffect(() => {
    for (const node of nodes) {
      const el = checkboxRefs.current[node.path];
      if (el) {
        el.indeterminate = node.indeterminate;
      }
    }
  }, [nodes]);

  useEffect(() => {
    updateMetrics();
    const el = listRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => updateMetrics());
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [nodes]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!dragRef.current.active) return;
      const el = listRef.current;
      if (!el) return;

      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (maxScroll === 0) return;

      const thumbHeight = Math.max(24, Math.floor((el.clientHeight / el.scrollHeight) * el.clientHeight));
      const maxThumbTravel = Math.max(1, el.clientHeight - thumbHeight);
      const deltaY = event.clientY - dragRef.current.startY;
      const deltaScroll = (deltaY / maxThumbTravel) * maxScroll;
      el.scrollTop = Math.max(0, Math.min(maxScroll, dragRef.current.startScrollTop + deltaScroll));
      updateMetrics();
    };

    const onMouseUp = () => {
      dragRef.current.active = false;
    };

    globalThis.addEventListener('mousemove', onMouseMove);
    globalThis.addEventListener('mouseup', onMouseUp);
    return () => {
      globalThis.removeEventListener('mousemove', onMouseMove);
      globalThis.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const scrollbar = useMemo(() => {
    const maxScroll = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
    const thumbHeight = maxScroll === 0
      ? metrics.clientHeight
      : Math.max(24, Math.floor((metrics.clientHeight / metrics.scrollHeight) * metrics.clientHeight));
    const maxThumbTravel = Math.max(0, metrics.clientHeight - thumbHeight);
    const thumbTop = maxScroll === 0 ? 0 : Math.round((metrics.scrollTop / maxScroll) * maxThumbTravel);
    return {
      visible: maxScroll > 0,
      maxScroll,
      thumbHeight,
      thumbTop,
      maxThumbTravel,
    };
  }, [metrics]);

  const handleRailMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!scrollbar.visible) return;
    const el = listRef.current;
    if (!el) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const targetThumbTop = Math.max(0, Math.min(scrollbar.maxThumbTravel, y - scrollbar.thumbHeight / 2));
    const ratio = scrollbar.maxThumbTravel === 0 ? 0 : targetThumbTop / scrollbar.maxThumbTravel;
    el.scrollTop = ratio * scrollbar.maxScroll;
    updateMetrics();
  };

  return (
    <div
      data-testid="folder-tree-panel"
      style={{
        width: '20vw',
        height: '80vh',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        alignSelf: 'center',
        overflow: 'hidden',
        position: 'relative',
        background: '#1f2335',
        border: '1px solid #414868',
      }}
    >
      <div
        data-testid="folder-tree-list"
        ref={listRef}
        className="folder-tree-list custom-scroll-viewport"
        onScroll={updateMetrics}
        style={{
          overflowY: 'auto',
          padding: '4px',
          paddingRight: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          fontFamily: 'monospace',
          fontSize: '12px',
          boxSizing: 'border-box',
          scrollbarGutter: 'stable',
        }}
      >
        {nodes.map((node) => {
          const hasChildren = node.children.length > 0;
          return (
            <div
              key={node.path}
              data-testid="folder-tree-item"
              onClick={() => {
                if (!hasChildren) return;
                onToggleExpand(node.path);
              }}
              onDoubleClick={() => onExclusiveSelect(node.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '24px',
                paddingLeft: `${node.depth * 14 + 4}px`,
                paddingRight: '4px',
                color: '#c0caf5',
                borderRadius: '2px',
                cursor: hasChildren ? 'pointer' : 'default',
                userSelect: 'none',
              }}
            >
            <input
              ref={(el) => {
                checkboxRefs.current[node.path] = el;
              }}
              type="checkbox"
              checked={node.checked}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onChange={(event) => {
                onToggleChecked(node.path, event.currentTarget.checked);
                event.currentTarget.blur();
              }}
            />

            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {folderLabel(node.path, node.imageCount)}
            </span>

              <button
                aria-label="toggle-folder-expand"
                disabled={!hasChildren}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!hasChildren) return;
                  onToggleExpand(node.path);
                  event.currentTarget.blur();
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: hasChildren ? '#9aa5ce' : '#4b526e',
                  cursor: hasChildren ? 'pointer' : 'default',
                  width: '16px',
                  height: '16px',
                  padding: 0,
                  flexShrink: 0,
                  opacity: hasChildren ? 1 : 0.8,
                  transform: node.expanded && hasChildren ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: hasChildren ? 'transform 100ms linear' : 'none',
                }}
              >
                {'>'}
              </button>
            </div>
          );
        })}
      </div>
      <div
        onMouseDown={handleRailMouseDown}
        style={{
          position: 'absolute',
          right: '2px',
          top: '4px',
          bottom: '4px',
          width: '12px',
          background: '#1a1e2f',
          border: '1px solid #2a3048',
          display: scrollbar.visible ? 'block' : 'none',
        }}
      >
        <div
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const el = listRef.current;
            if (!el) return;
            dragRef.current = {
              active: true,
              startY: event.clientY,
              startScrollTop: el.scrollTop,
            };
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${scrollbar.thumbTop}px`,
            height: `${scrollbar.thumbHeight}px`,
            background: '#5f688f',
            border: '1px solid #3f4768',
            cursor: 'grab',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}
