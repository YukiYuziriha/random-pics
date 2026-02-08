import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
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
import { ActionButton } from './components/ActionButton.tsx';

const INITIAL_TIMER_STORAGE_KEY = 'timer.initial_seconds';
const REMAINING_TIMER_STORAGE_KEY = 'timer.remaining_seconds';

type TimerFlowMode = 'random' | 'normal';

type PersistedUiState = {
  verticalMirror: boolean;
  horizontalMirror: boolean;
  greyscale: boolean;
  timerFlowMode: TimerFlowMode;
  showFolderHistoryPanel: boolean;
  showTopControls: boolean;
  showImageHistoryPanel: boolean;
  showBottomControls: boolean;
  isFullscreenImage: boolean;
};

function readPersistedSeconds(key: string, fallback: number): number {
  const raw = globalThis.localStorage?.getItem(key);
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export default function App() {
  const [imageSrc, setImageSrc] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [folderHistoryIndex, setFolderHistoryIndex] = useState(-1);
  const [verticalMirror, setVerticalMirror] = useState(false);
  const [horizontalMirror, setHorizontalMirror] = useState(false);
  const [greyscale, setGreyscale] = useState(false);
  const [initialTimerSeconds, setInitialTimerSeconds] = useState(() => readPersistedSeconds(INITIAL_TIMER_STORAGE_KEY, 10));
  const [remainingTimerSeconds, setRemainingTimerSeconds] = useState(() => readPersistedSeconds(REMAINING_TIMER_STORAGE_KEY, 10));
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerFlowMode, setTimerFlowMode] = useState<TimerFlowMode>('random');
  const [showFolderHistoryPanel, setShowFolderHistoryPanel] = useState(true);
  const [showTopControls, setShowTopControls] = useState(true);
  const [showImageHistoryPanel, setShowImageHistoryPanel] = useState(true);
  const [showBottomControls, setShowBottomControls] = useState(true);
  const [isFullscreenImage, setIsFullscreenImage] = useState(false);
  const [isTopToggleHovered, setIsTopToggleHovered] = useState(false);
  const [isBottomToggleHovered, setIsBottomToggleHovered] = useState(false);
  const [isImageContainerHovered, setIsImageContainerHovered] = useState(false);
  const [isFullscreenHovered, setIsFullscreenHovered] = useState(false);
  const stopTimerRef = useRef<null | (() => void)>(null);
  const timerLoopActiveRef = useRef(false);
  const timerLoopStartSecondsRef = useRef(10);
  const timerCycleIdRef = useRef(0);
  const timerFlowModeRef = useRef<TimerFlowMode>('random');

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

  const loadFolderHistory = async (): Promise<{ history: string[]; currentIndex: number }> => {
    const res = await fetch(`/api/${FOLDER_HISTORY_ENDPOINT}`);
    const data = await res.json();
    setFolderHistory(data.history);
    setFolderHistoryIndex(data.currentIndex);
    return data;
  };

  const loadImageState = async () => {
    const res = await fetch(`/api/${STATE_ENDPOINT}`);
    const data = await res.json();
    setVerticalMirror(Boolean(data.verticalMirror));
    setHorizontalMirror(Boolean(data.horizontalMirror));
    setGreyscale(Boolean(data.greyscale));
    setTimerFlowMode(data.timerFlowMode === 'normal' ? 'normal' : 'random');
    setShowFolderHistoryPanel(Boolean(data.showFolderHistoryPanel));
    setShowTopControls(Boolean(data.showTopControls));
    setShowImageHistoryPanel(Boolean(data.showImageHistoryPanel));
    setShowBottomControls(Boolean(data.showBottomControls));
    setIsFullscreenImage(Boolean(data.isFullscreenImage));
  };

  const persistImageState = async (state: PersistedUiState) => {
    await fetch(`/api/${STATE_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
  };

  const handlePickFolder = async (): Promise<boolean> => {
    const selected = await open({ directory: true });
    if (!selected) return false;
    const folderPath = Array.isArray(selected) ? selected[0] : selected;

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
    const initialize = async () => {
      const folderData = await loadFolderHistory();
      await loadImageState();

      if (folderData.currentIndex >= 0) {
        await handleLoadImage(CURRENT_IMAGE_ENDPOINT);
        await loadHistory(NORMAL_HISTORY_ENDPOINT);
      }
    };

    void initialize();

    return () => {
      timerLoopActiveRef.current = false;
      stopTimerRef.current?.();
      stopTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    globalThis.localStorage?.setItem(INITIAL_TIMER_STORAGE_KEY, String(initialTimerSeconds));
  }, [initialTimerSeconds]);

  useEffect(() => {
    globalThis.localStorage?.setItem(REMAINING_TIMER_STORAGE_KEY, String(remainingTimerSeconds));
  }, [remainingTimerSeconds]);

  useEffect(() => {
    timerFlowModeRef.current = timerFlowMode;
  }, [timerFlowMode]);

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
    await persistImageState({
      verticalMirror: next,
      horizontalMirror,
      greyscale,
      timerFlowMode,
      showFolderHistoryPanel,
      showTopControls,
      showImageHistoryPanel,
      showBottomControls,
      isFullscreenImage,
    });
  };

  const handleToggleHorizontalMirror = async () => {
    const next = !horizontalMirror;
    setHorizontalMirror(next);
    await persistImageState({
      verticalMirror,
      horizontalMirror: next,
      greyscale,
      timerFlowMode,
      showFolderHistoryPanel,
      showTopControls,
      showImageHistoryPanel,
      showBottomControls,
      isFullscreenImage,
    });
  };

  const handleToggleGreyscale = async () => {
    const next = !greyscale;
    setGreyscale(next);
    await persistImageState({
      verticalMirror,
      horizontalMirror,
      greyscale: next,
      timerFlowMode,
      showFolderHistoryPanel,
      showTopControls,
      showImageHistoryPanel,
      showBottomControls,
      isFullscreenImage,
    });
  };

  const sanitizeSeconds = (seconds: number): number => {
    if (Number.isNaN(seconds)) return 1;
    return Math.max(1, Math.floor(seconds));
  };

  const clearActiveTimer = () => {
    timerCycleIdRef.current += 1;
    stopTimerRef.current?.();
    stopTimerRef.current = null;
  };

  const loadTimerFlowImage = async (): Promise<boolean> => {
    if (!(await ensureFolderSelected())) return false;

    if (timerFlowModeRef.current === 'normal') {
      await handleLoadImage(NEXT_ENDPOINT);
      await loadHistory(NORMAL_HISTORY_ENDPOINT);
      return true;
    }

    await handleLoadImage(NEXT_RANDOM_ENDPOINT);
    await loadHistory(RANDOM_HISTORY_ENDPOINT);
    return true;
  };

  const startTimerCycle = (seconds: number) => {
    const startAt = sanitizeSeconds(seconds);
    timerCycleIdRef.current += 1;
    const cycleId = timerCycleIdRef.current;
    setIsTimerRunning(true);
    stopTimerRef.current = timer(
      startAt,
      (n) => setRemainingTimerSeconds(n),
      () => {
        if (timerCycleIdRef.current !== cycleId) {
          return;
        }

        if (!timerLoopActiveRef.current) {
          setIsTimerRunning(false);
          stopTimerRef.current = null;
          return;
        }

        void (async () => {
          const loaded = await loadTimerFlowImage();

          if (timerCycleIdRef.current !== cycleId || !timerLoopActiveRef.current) {
            return;
          }

          if (!loaded) {
            timerLoopActiveRef.current = false;
            setIsTimerRunning(false);
            stopTimerRef.current = null;
            return;
          }

          const restartAt = sanitizeSeconds(timerLoopStartSecondsRef.current);
          setRemainingTimerSeconds(restartAt);
          startTimerCycle(restartAt);
        })();
      }
    );
  };

  const handleInitialTimerSecondsChange = (seconds: number) => {
    if (Number.isNaN(seconds)) return;
    const next = sanitizeSeconds(seconds);
    setInitialTimerSeconds(next);
    timerLoopStartSecondsRef.current = next;
    if (!isTimerRunning) {
      setRemainingTimerSeconds(next);
    }
  };

  const handleRemainingTimerSecondsChange = (seconds: number) => {
    if (Number.isNaN(seconds)) return;
    const next = sanitizeSeconds(seconds);
    setRemainingTimerSeconds(next);
    if (isTimerRunning) {
      clearActiveTimer();
      startTimerCycle(next);
    }
  };

  const handleToggleStartStop = async () => {
    if (isTimerRunning) {
      timerLoopActiveRef.current = false;
      clearActiveTimer();
      setIsTimerRunning(false);
      const resetTo = sanitizeSeconds(timerLoopStartSecondsRef.current);
      setRemainingTimerSeconds(resetTo);
      return;
    }

    const startAt = sanitizeSeconds(initialTimerSeconds);
    timerLoopStartSecondsRef.current = startAt;

    const loaded = await loadTimerFlowImage();
    if (!loaded) {
      timerLoopActiveRef.current = false;
      setIsTimerRunning(false);
      setRemainingTimerSeconds(startAt);
      return;
    }

    timerLoopActiveRef.current = true;
    setRemainingTimerSeconds(startAt);
    clearActiveTimer();
    startTimerCycle(startAt);
  };

  const handleTogglePausePlay = () => {
    if (isTimerRunning) {
      clearActiveTimer();
      setIsTimerRunning(false);
      return;
    }

    const restartAt = sanitizeSeconds(remainingTimerSeconds);
    timerLoopActiveRef.current = true;
    setRemainingTimerSeconds(restartAt);
    startTimerCycle(restartAt);
  };

  const handleToggleTimerFlowMode = async () => {
    const next = timerFlowMode === 'random' ? 'normal' : 'random';
    setTimerFlowMode(next);
    await persistImageState({
      verticalMirror,
      horizontalMirror,
      greyscale,
      timerFlowMode: next,
      showFolderHistoryPanel,
      showTopControls,
      showImageHistoryPanel,
      showBottomControls,
      isFullscreenImage,
    });
  };

  const handleToggleFolderHistoryPanel = async () => {
    const next = !showFolderHistoryPanel;
    setShowFolderHistoryPanel(next);
    await persistImageState({
      verticalMirror,
      horizontalMirror,
      greyscale,
      timerFlowMode,
      showFolderHistoryPanel: next,
      showTopControls,
      showImageHistoryPanel,
      showBottomControls,
      isFullscreenImage,
    });
  };

  const handleToggleTopControls = async () => {
    const next = !showTopControls;
    setShowTopControls(next);
    await persistImageState({
      verticalMirror,
      horizontalMirror,
      greyscale,
      timerFlowMode,
      showFolderHistoryPanel,
      showTopControls: next,
      showImageHistoryPanel,
      showBottomControls,
      isFullscreenImage,
    });
  };

  const handleToggleImageHistoryPanel = async () => {
    const next = !showImageHistoryPanel;
    setShowImageHistoryPanel(next);
    await persistImageState({
      verticalMirror,
      horizontalMirror,
      greyscale,
      timerFlowMode,
      showFolderHistoryPanel,
      showTopControls,
      showImageHistoryPanel: next,
      showBottomControls,
      isFullscreenImage,
    });
  };

  const handleToggleBottomControls = async () => {
    const next = !showBottomControls;
    setShowBottomControls(next);
    await persistImageState({
      verticalMirror,
      horizontalMirror,
      greyscale,
      timerFlowMode,
      showFolderHistoryPanel,
      showTopControls,
      showImageHistoryPanel,
      showBottomControls: next,
      isFullscreenImage,
    });
  };

  const handleToggleFullscreen = async () => {
    const next = !isFullscreenImage;
    setIsFullscreenImage(next);
    await persistImageState({
      verticalMirror,
      horizontalMirror,
      greyscale,
      timerFlowMode,
      showFolderHistoryPanel,
      showTopControls,
      showImageHistoryPanel,
      showBottomControls,
      isFullscreenImage: next,
    });
  };

  const uiToggleButtonStyle = {
    background: '#24283b',
    color: '#c0caf5',
    border: '1px solid #565f89',
    borderRadius: '2px',
    fontFamily: 'monospace',
    fontSize: '12px',
    letterSpacing: '0.04em',
    padding: '5px 8px',
    minHeight: '28px',
    cursor: 'pointer',
  };

  const uiHideToggleButtonStyle = {
    ...uiToggleButtonStyle,
    opacity: 0,
    transition: 'opacity 120ms ease',
  };

  if (isFullscreenImage) {
    return (
      <div
        data-testid="app-panel"
        style={{
          height: '100vh',
          width: '100vw',
          background: '#000000',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
        onMouseEnter={() => setIsFullscreenHovered(true)}
        onMouseLeave={() => setIsFullscreenHovered(false)}
      >
        {imageSrc && (
          <img
            src={imageSrc}
            style={{
              maxWidth: '100vw',
              maxHeight: '100vh',
              objectFit: 'contain',
              transform: `${horizontalMirror ? 'scaleX(-1)' : ''} ${verticalMirror ? 'scaleY(-1)' : ''}`.trim() || 'none',
              filter: greyscale ? 'grayscale(1)' : 'none',
            }}
            alt="loaded image"
          />
        )}

        <button
          onClick={handleToggleFullscreen}
          style={{
            ...uiToggleButtonStyle,
            opacity: isFullscreenHovered ? 1 : 0,
            transition: 'opacity 120ms ease',
            pointerEvents: isFullscreenHovered ? 'auto' : 'none',
            position: 'absolute',
            left: '10px',
            bottom: '10px',
            zIndex: 2,
          }}
        >
          exit-fullscreen
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="app-panel"
      style={{
        height: '100vh',
        boxSizing: 'border-box',
        border: '1px solid #3b4261',
        gap: '10px',
        background: '#1a1b26',
        color: '#c0caf5',
        flexDirection: 'row',
        display: 'flex',
        justifyContent: 'space-between',
        overflow: 'hidden',
        padding: '10px',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          zIndex: 3,
        }}
        onMouseEnter={() => setIsTopToggleHovered(true)}
        onMouseLeave={() => setIsTopToggleHovered(false)}
      >
        <button
          onClick={handleToggleFolderHistoryPanel}
          style={{ ...uiHideToggleButtonStyle, opacity: isTopToggleHovered ? 1 : 0 }}
        >
          {showFolderHistoryPanel ? 'hide-folder-history' : 'show-folder-history'}
        </button>
        <button onClick={handleToggleTopControls} style={{ ...uiHideToggleButtonStyle, opacity: isTopToggleHovered ? 1 : 0 }}>
          {showTopControls ? 'hide-top-buttons' : 'show-top-buttons'}
        </button>
      </div>

      <div
        style={{
          position: 'absolute',
          right: '10px',
          bottom: '10px',
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          zIndex: 3,
        }}
        onMouseEnter={() => setIsBottomToggleHovered(true)}
        onMouseLeave={() => setIsBottomToggleHovered(false)}
      >
        <button
          onClick={handleToggleImageHistoryPanel}
          style={{ ...uiHideToggleButtonStyle, opacity: isBottomToggleHovered ? 1 : 0 }}
        >
          {showImageHistoryPanel ? 'hide-image-history' : 'show-image-history'}
        </button>
        <button onClick={handleToggleBottomControls} style={{ ...uiHideToggleButtonStyle, opacity: isBottomToggleHovered ? 1 : 0 }}>
          {showBottomControls ? 'hide-bottom-buttons' : 'show-bottom-buttons'}
        </button>
      </div>

      {showFolderHistoryPanel && (
        <HistoryPanel
          panelTestId="folder-history-panel"
          listContainerTestId="folder-list-container"
          listItemTestId="folder-list-item"
          items={folderWindowItems}
          currentSlotIndex={half}
        />
      )}

      <div
        data-testid="image-and-buttons"
        style={{
          display: 'flex',
          height: '100%',
          minHeight: 0,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '10px',
          flex: 1,
        }}
      >
        {showTopControls && (
          <div
            style={{
              display: 'flex',
              marginBottom: 'auto',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <FolderControls
              onPrevFolder={handlePrevFolder}
              onPickFolder={async () => {
                await handlePickFolder();
              }}
              onReindexFolder={handleReindexFolder}
              onNextFolder={handleNextFolder}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                padding: '8px',
                border: '1px solid #414868',
                background: '#1f2335',
              }}
            >
              <ActionButton label="reset-random-history" onClick={handleResetRandomHistory} />
              <ActionButton label="reset_normal_history" onClick={handleResetNormalHistory} />
              <ActionButton label="full_wipe" onClick={handleFullWipe} />
            </div>
          </div>
        )}

        <div
          data-testid="image-container"
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
            alignItems: 'center',
            width: '100%',
            background: '#1f2335',
            border: '1px solid #414868',
            position: 'relative',
          }}
          onMouseEnter={() => setIsImageContainerHovered(true)}
          onMouseLeave={() => setIsImageContainerHovered(false)}
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

          <button
            onClick={handleToggleFullscreen}
            style={{
              ...uiToggleButtonStyle,
              opacity: isImageContainerHovered ? 1 : 0,
              transition: 'opacity 120ms ease',
              pointerEvents: isImageContainerHovered ? 'auto' : 'none',
              position: 'absolute',
              left: '8px',
              bottom: '8px',
            }}
          >
            fullscreen
          </button>
        </div>

        {showBottomControls && (
          <ImageControls
            onPrev={handlePrevImage}
            onNext={handleNextImage}
            onPrevRandom={handlePrevRandomImage}
            onForceRandom={loadForceRandomImage}
            onNextRandom={handleNextRandomImage}
            onToggleVerticalMirror={handleToggleVerticalMirror}
            onToggleHorizontalMirror={handleToggleHorizontalMirror}
            onToggleGreyscale={handleToggleGreyscale}
            onToggleStartStop={handleToggleStartStop}
            onTogglePausePlay={handleTogglePausePlay}
            onToggleTimerFlowMode={handleToggleTimerFlowMode}
            onInitialSecondsChange={handleInitialTimerSecondsChange}
            onRemainingSecondsChange={handleRemainingTimerSecondsChange}
            initialSeconds={initialTimerSeconds}
            remainingSeconds={remainingTimerSeconds}
            isRunning={isTimerRunning}
            timerFlowMode={timerFlowMode}
          />
        )}
      </div>

      {showImageHistoryPanel && (
        <HistoryPanel
          panelTestId="random-history-panel"
          listContainerTestId="list-container"
          listItemTestId="list-item"
          items={windowItems}
          currentSlotIndex={half}
        />
      )}
    </div>
  );
}
