import { useEffect, useRef, useState } from 'react';
import { timer } from './timer.ts';
import {
  CURRENT_IMAGE_ENDPOINT,
  FORCE_RANDOM_ENDPOINT,
  FOLDER_HISTORY_ENDPOINT,
  FULL_WIPE_ENDPOINT,
  NEXT_ENDPOINT,
  NEXT_FOLDER_ENDPOINT,
  NEXT_RANDOM_ENDPOINT,
  NORMAL_HISTORY_ENDPOINT,
  PICK_FOLDER_ENDPOINT,
  PREV_ENDPOINT,
  PREV_FOLDER_ENDPOINT,
  PREV_RANDOM_ENDPOINT,
  RANDOM_HISTORY_ENDPOINT,
  REINDEX_CURRENT_FOLDER_ENDPOINT,
  RESET_NORMAL_HISTORY_ENDPOINT,
  RESET_RANDOM_HISTORY_ENDPOINT,
  STATE_ENDPOINT,
} from './constants/endpoints.ts';
import { FolderControls } from './components/FolderControls.tsx';
import { HistoryPanel } from './components/HistoryPanel.tsx';
import { ImageControls } from './components/ImageControls.tsx';

export default function App() {
  const [imageSrc, setImageSrc] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [folderHistoryIndex, setFolderHistoryIndex] = useState(-1);
  const [verticalMirror, setVerticalMirror] = useState(false);
  const [horizontalMirror, setHorizontalMirror] = useState(false);
  const [greyscale, setGreyscale] = useState(false);
  const [remaining, setRemaining] = useState(10);
  const stopTimerRef = useRef<null | (() => void)>(null);

  const loadHistory = async (endpoint: string) => {
    const res = await fetch(`/api/${endpoint}`);
    const data = await res.json();
    setHistory(data.history);
    setHistoryIndex(data.currentIndex);
  };

  const handleLoadImage = async (endpoint: string) => {
    const res = await fetch(`/api/${endpoint}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setImageSrc(url);
  };

  const loadFolderHistory = async () => {
    const res = await fetch(`/api/${FOLDER_HISTORY_ENDPOINT}`);
    const data = await res.json();
    setFolderHistory(data.history);
    setFolderHistoryIndex(data.currentIndex);
  };

  const loadImageState = async () => {
    const res = await fetch(`/api/${STATE_ENDPOINT}`);
    const data = await res.json();
    setVerticalMirror(Boolean(data.verticalMirror));
    setHorizontalMirror(Boolean(data.horizontalMirror));
    setGreyscale(Boolean(data.greyscale));
  };

  const persistImageState = async (state: { verticalMirror: boolean; horizontalMirror: boolean; greyscale: boolean }) => {
    await fetch(`/api/${STATE_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
  };

  const handlePickFolder = async (): Promise<boolean> => {
    const folderPath = await Neutralino.os.showFolderDialog('Pick folder', {});
    if (!folderPath) return false;

    await fetch(`/api/${PICK_FOLDER_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    });

    await loadFolderHistory();
    await handleLoadImage(CURRENT_IMAGE_ENDPOINT);
    await loadHistory(NORMAL_HISTORY_ENDPOINT);
    return true;
  };

  const ensureFolderSelected = async (): Promise<boolean> => {
    if (folderHistoryIndex >= 0) return true;
    return handlePickFolder();
  };

  useEffect(() => {
    void loadFolderHistory();
    void loadImageState();
    return () => {
      stopTimerRef.current?.();
    };
  }, []);

  const historyVisualSize = 31;
  const half = Math.floor(historyVisualSize / 2);

  const windowItems = Array.from({ length: historyVisualSize }, (_, i) => {
    const historyIndexAtSlot = historyIndex + (i - half);
    if (historyIndexAtSlot < 0 || historyIndexAtSlot >= history.length) {
      return null;
    }
    return history[historyIndexAtSlot] ?? null;
  });

  const folderWindowItems = Array.from({ length: historyVisualSize }, (_, i) => {
    const historyIndexAtSlot = folderHistoryIndex + (half - i);
    if (historyIndexAtSlot < 0 || historyIndexAtSlot >= folderHistory.length) {
      return null;
    }
    return folderHistory[historyIndexAtSlot] ?? null;
  });

  const loadForceRandomImage = async () => {
    if (!(await ensureFolderSelected())) return;
    await handleLoadImage(FORCE_RANDOM_ENDPOINT);
    await loadHistory(RANDOM_HISTORY_ENDPOINT);
  };

  const handlePrevFolder = async () => {
    if (!(await ensureFolderSelected())) return;
    await fetch(`/api/${PREV_FOLDER_ENDPOINT}`);
    await loadFolderHistory();
    await handleLoadImage(CURRENT_IMAGE_ENDPOINT);
    await loadHistory(NORMAL_HISTORY_ENDPOINT);
  };

  const handleReindexFolder = async () => {
    if (!(await ensureFolderSelected())) return;
    await fetch(`/api/${REINDEX_CURRENT_FOLDER_ENDPOINT}`, { method: 'POST' });
    await loadFolderHistory();
    await handleLoadImage(CURRENT_IMAGE_ENDPOINT);
    await loadHistory(NORMAL_HISTORY_ENDPOINT);
  };

  const handleNextFolder = async () => {
    if (!(await ensureFolderSelected())) return;
    await fetch(`/api/${NEXT_FOLDER_ENDPOINT}`);
    await loadFolderHistory();
    await handleLoadImage(CURRENT_IMAGE_ENDPOINT);
    await loadHistory(NORMAL_HISTORY_ENDPOINT);
  };

  const handleFullWipe = async () => {
    await fetch(`/api/${FULL_WIPE_ENDPOINT}`, { method: 'POST' });
    setImageSrc('');
    setHistory([]);
    setHistoryIndex(-1);
    setFolderHistory([]);
    setFolderHistoryIndex(-1);
  };

  const handlePrevImage = async () => {
    if (!(await ensureFolderSelected())) return;
    await handleLoadImage(PREV_ENDPOINT);
    await loadHistory(NORMAL_HISTORY_ENDPOINT);
  };

  const handleNextImage = async () => {
    if (!(await ensureFolderSelected())) return;
    await handleLoadImage(NEXT_ENDPOINT);
    await loadHistory(NORMAL_HISTORY_ENDPOINT);
  };

  const handlePrevRandomImage = async () => {
    if (!(await ensureFolderSelected())) return;
    await handleLoadImage(PREV_RANDOM_ENDPOINT);
    await loadHistory(RANDOM_HISTORY_ENDPOINT);
  };

  const handleNextRandomImage = async () => {
    if (!(await ensureFolderSelected())) return;
    await handleLoadImage(NEXT_RANDOM_ENDPOINT);
    await loadHistory(RANDOM_HISTORY_ENDPOINT);
  };

  const handleResetRandomHistory = async () => {
    await fetch(`/api/${RESET_RANDOM_HISTORY_ENDPOINT}`, { method: 'POST' });
    await loadHistory(RANDOM_HISTORY_ENDPOINT);
  };

  const handleResetNormalHistory = async () => {
    await fetch(`/api/${RESET_NORMAL_HISTORY_ENDPOINT}`, { method: 'POST' });
    await loadHistory(NORMAL_HISTORY_ENDPOINT);
  };

  const handleToggleVerticalMirror = async () => {
    const next = !verticalMirror;
    setVerticalMirror(next);
    await persistImageState({ verticalMirror: next, horizontalMirror, greyscale });
  };

  const handleToggleHorizontalMirror = async () => {
    const next = !horizontalMirror;
    setHorizontalMirror(next);
    await persistImageState({ verticalMirror, horizontalMirror: next, greyscale });
  };

  const handleToggleGreyscale = async () => {
    const next = !greyscale;
    setGreyscale(next);
    await persistImageState({ verticalMirror, horizontalMirror, greyscale: next });
  };

  const handleStartTimer = () => {
    stopTimerRef.current?.();
    stopTimerRef.current = timer(
      10,
      (n) => setRemaining(n),
      () => {
        void loadForceRandomImage();
      }
    );
  };

  return (
    <div
      data-testid="app-panel"
      style={{
        height: '100vh',
        border: '1px solid #3b4261',
        gap: '10px',
        background: '#1a1b26',
        color: '#c0caf5',
        flexDirection: 'row',
        display: 'flex',
        justifyContent: 'space-between',
        overflow: 'hidden',
        padding: '10px',
      }}
    >
      <HistoryPanel
        panelTestId="folder-history-panel"
        listContainerTestId="folder-list-container"
        listItemTestId="folder-list-item"
        items={folderWindowItems}
        currentSlotIndex={half}
      />

      <div
        data-testid="image-and-buttons"
        style={{
          display: 'flex',
          height: '100vh',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <FolderControls
          onPrevFolder={handlePrevFolder}
          onPickFolder={async () => {
            await handlePickFolder();
          }}
          onReindexFolder={handleReindexFolder}
          onNextFolder={handleNextFolder}
          onFullWipe={handleFullWipe}
        />

        <div
          data-testid="image-container"
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
            alignItems: 'center',
            width: '56vw',
            background: '#1f2335',
            border: '1px solid #414868',
          }}
        >
          {imageSrc && (
            <img
              src={imageSrc}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                transform: `${horizontalMirror ? 'scaleX(-1)' : ''} ${verticalMirror ? 'scaleY(-1)' : ''}`.trim() || 'none',
                filter: greyscale ? 'grayscale(1)' : 'none',
              }}
              alt="loaded image"
            />
          )}
        </div>

        <ImageControls
          onPrev={handlePrevImage}
          onNext={handleNextImage}
          onPrevRandom={handlePrevRandomImage}
          onForceRandom={loadForceRandomImage}
          onNextRandom={handleNextRandomImage}
          onResetRandomHistory={handleResetRandomHistory}
          onResetNormalHistory={handleResetNormalHistory}
          onToggleVerticalMirror={handleToggleVerticalMirror}
          onToggleHorizontalMirror={handleToggleHorizontalMirror}
          onToggleGreyscale={handleToggleGreyscale}
          onStartTimer={handleStartTimer}
          remaining={remaining}
        />
      </div>

      <HistoryPanel
        panelTestId="random-history-panel"
        listContainerTestId="list-container"
        listItemTestId="list-item"
        items={windowItems}
        currentSlotIndex={half}
      />
    </div>
  );
}
