import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { timer } from './timer.ts';
import {
  pickFolder,
  getNextFolder,
  getPrevFolder,
  getFolderHistory,
  reindexCurrentFolder,
  getCurrentImage,
  getNextImage,
  getPrevImage,
  getNextRandomImage,
  getPrevRandomImage,
  getForceRandomImage,
  getNormalHistory,
  getRandomHistory,
  resetNormalHistory,
  resetRandomHistory,
  getImageState,
  setImageState,
  fullWipe,
  setFolderByIndex,
  setNormalImageByIndex,
  setRandomImageByIndex,
  getCurrentFolder,
  deleteFolder,
  cleanupStaleFolders,
  type FolderHistoryItem,
  type ImageHistory,
  type ImageState,
  type FolderInfo,
  type ImageResponse,
} from './apiClient.ts';
import { FolderControls } from './components/FolderControls.tsx';
import { HistoryPanel } from './components/HistoryPanel.tsx';
import { ImageControls } from './components/ImageControls.tsx';
import { ActionButton } from './components/ActionButton.tsx';

const INITIAL_TIMER_STORAGE_KEY = 'timer.initial_seconds';
const REMAINING_TIMER_STORAGE_KEY = 'timer.remaining_seconds';
const FOLDER_HISTORY_MODE_KEY = 'folder.history_mode';

type TimerFlowMode = 'random' | 'normal';

type ToastState = {
  message: string;
  visible: boolean;
};

function readFolderHistoryMode(): Record<number, 'normal' | 'random'> {
  const raw = globalThis.localStorage?.getItem(FOLDER_HISTORY_MODE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeFolderHistoryMode(modes: Record<number, 'normal' | 'random'>) {
  globalThis.localStorage?.setItem(FOLDER_HISTORY_MODE_KEY, JSON.stringify(modes));
}

function getFolderHistoryMode(folderId: number): 'normal' | 'random' {
  const modes = readFolderHistoryMode();
  return modes[folderId] ?? 'normal';
}

function setFolderHistoryMode(folderId: number, mode: 'normal' | 'random') {
  const modes = readFolderHistoryMode();
  modes[folderId] = mode;
  writeFolderHistoryMode(modes);
}

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

function HoverRevealButton({
  label,
  onClick,
  style,
  baseOpacity = 0.2,
}: {
  label: string;
  onClick: () => void | Promise<void>;
  style: Record<string, string | number>;
  baseOpacity?: number;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      style={{
        ...style,
        opacity: isHovered ? 1 : baseOpacity,
        transition: 'opacity 120ms ease',
      }}
    >
      {label}
    </button>
  );
}

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
  const [folderHistory, setFolderHistory] = useState<FolderHistoryItem[]>([]);
  const [folderHistoryIndex, setFolderHistoryIndex] = useState(-1);
  const [verticalMirror, setVerticalMirror] = useState(false);
  const [horizontalMirror, setHorizontalMirror] = useState(false);
  const [greyscale, setGreyscale] = useState(false);
  const [initialTimerSeconds, setInitialTimerSeconds] = useState(() => readPersistedSeconds(INITIAL_TIMER_STORAGE_KEY, 10));
  const [remainingTimerSeconds, setRemainingTimerSeconds] = useState(() => readPersistedSeconds(REMAINING_TIMER_STORAGE_KEY, 10));
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerFlowMode, setTimerFlowMode] = useState<TimerFlowMode>('random');
  const [activeHistoryMode, setActiveHistoryMode] = useState<'normal' | 'random'>('normal');
  const [showFolderHistoryPanel, setShowFolderHistoryPanel] = useState(true);
  const [showTopControls, setShowTopControls] = useState(true);
  const [showImageHistoryPanel, setShowImageHistoryPanel] = useState(true);
  const [showBottomControls, setShowBottomControls] = useState(true);
  const [isFullscreenImage, setIsFullscreenImage] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingFolderPath, setIndexingFolderPath] = useState<string | null>(null);
  const [indexingLogs, setIndexingLogs] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false });
  const toastTimeoutRef = useRef<number | null>(null);
  const indexingLogContainerRef = useRef<HTMLDivElement | null>(null);
  const stopTimerRef = useRef<null | (() => void)>(null);
  const timerLoopActiveRef = useRef(false);
  const timerLoopStartSecondsRef = useRef(10);
  const timerCycleIdRef = useRef(0);
  const timerFlowModeRef = useRef<TimerFlowMode>('random');

  const loadHistory = async (history: ImageHistory, mode: 'normal' | 'random') => {
    setHistory(history.history);
    setHistoryIndex(history.currentIndex);
    setActiveHistoryMode(mode);
    const currentFolder = await getCurrentFolder();
    if (currentFolder) {
      setFolderHistoryMode(currentFolder.id, mode);
    }
  };

  const appendIndexLog = (line: string) => {
    setIndexingLogs((prev) => {
      const next = [...prev, line];
      return next.slice(-120);
    });
  };

  const formatError = (err: unknown): string => {
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
    return String(err);
  };

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, visible: true });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast({ message: '', visible: false });
    }, 3000);
  };

  const isTypingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.hasAttribute('contenteditable');
  };

  const handleLoadImage = async (response: ImageResponse) => {
    const { data, folder, auto_switched_folder } = response;

    if (!folder) {
      setFolderHistory([]);
      setFolderHistoryIndex(-1);
      setHistory([]);
      setHistoryIndex(-1);
      setImageSrc('');
      return;
    }

    const arrayBuffer = new Uint8Array(data).buffer.slice(0) as ArrayBuffer;
    const blob = new Blob([arrayBuffer]);
    const url = URL.createObjectURL(blob);
    setImageSrc(url);

    if (auto_switched_folder) {
      await loadFolderHistory();
      showToast(`Switched to folder: ${folder.path}`);
    }
  };

  const handleBackendError = async (err: unknown) => {
    await loadFolderHistory();
    showToast(formatError(err));
  };

  const runOp = async <T,>(op: () => Promise<T>): Promise<T | null> => {
    try {
      return await op();
    } catch (err) {
      await handleBackendError(err);
      return null;
    }
  };

  const loadFolderHistory = async (): Promise<{ history: FolderHistoryItem[]; currentIndex: number }> => {
    const data = await getFolderHistory();
    setFolderHistory(data.history);
    setFolderHistoryIndex(data.currentIndex);
    return data;
  };

  const loadImageState = async () => {
    const data = await getImageState();
    setVerticalMirror(data.verticalMirror);
    setHorizontalMirror(data.horizontalMirror);
    setGreyscale(data.greyscale);
    setTimerFlowMode(data.timerFlowMode);
    setShowFolderHistoryPanel(data.showFolderHistoryPanel);
    setShowTopControls(data.showTopControls);
    setShowImageHistoryPanel(data.showImageHistoryPanel);
    setShowBottomControls(data.showBottomControls);
    setIsFullscreenImage(data.isFullscreenImage);
  };

  const persistImageState = async (state: PersistedUiState) => {
    await setImageState({
      verticalMirror: state.verticalMirror,
      horizontalMirror: state.horizontalMirror,
      greyscale: state.greyscale,
      timerFlowMode: state.timerFlowMode,
      showFolderHistoryPanel: state.showFolderHistoryPanel,
      showTopControls: state.showTopControls,
      showImageHistoryPanel: state.showImageHistoryPanel,
      showBottomControls: state.showBottomControls,
      isFullscreenImage: state.isFullscreenImage,
    });
  };

  const startIndexingUi = (folderPath: string) => {
    setIsIndexing(true);
    setIndexingFolderPath(folderPath);
    setIndexingLogs([`indexing:start ${folderPath}`]);

    if (isTimerRunning) {
      timerLoopActiveRef.current = false;
      clearActiveTimer();
      setIsTimerRunning(false);
      appendIndexLog('timer:stopped for indexing');
    }
  };

  const endIndexingUi = (ok: boolean) => {
    appendIndexLog(ok ? 'indexing:done' : 'indexing:error');
    setIsIndexing(false);
    setIndexingFolderPath(null);
  };

  const handlePickFolder = async (): Promise<boolean> => {
    const selected = await open({ directory: true });
    if (!selected) return false;
    const folderPath = Array.isArray(selected) ? selected[0] : selected;

    startIndexingUi(folderPath);
    try {
      const folderInfo = await pickFolder(folderPath);
      await loadFolderHistory();
      const imageData = await getCurrentImage();
      await handleLoadImage(imageData);
      const savedMode = getFolderHistoryMode(folderInfo.id);
      const history = savedMode === 'normal' ? await getNormalHistory() : await getRandomHistory();
      await loadHistory(history, savedMode);
      endIndexingUi(true);
      return true;
    } catch (err) {
      appendIndexLog(`error:${formatError(err)}`);
      endIndexingUi(false);
      showToast(formatError(err));
      throw err;
    }
  };

  const ensureFolderSelected = async (): Promise<boolean> => {
    if (isIndexing) return false;
    if (folderHistoryIndex >= 0) return true;
    return handlePickFolder();
  };

  useEffect(() => {
    const initialize = async () => {
      const folderData = await loadFolderHistory();
      await loadImageState();

      if (folderData.currentIndex >= 0) {
        const imageData = await getCurrentImage();
        await handleLoadImage(imageData);
        const currentFolder = await getCurrentFolder();
        if (currentFolder) {
          const savedMode = getFolderHistoryMode(currentFolder.id);
          const history = savedMode === 'normal' ? await getNormalHistory() : await getRandomHistory();
          await loadHistory(history, savedMode);
        } else {
          const history = await getNormalHistory();
          await loadHistory(history, 'normal');
        }
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

  useEffect(() => {
    if (!isIndexing) return;
    if (!isTimerRunning) return;
    timerLoopActiveRef.current = false;
    clearActiveTimer();
    setIsTimerRunning(false);
  }, [isIndexing, isTimerRunning]);

  useEffect(() => {
    let unlisten: null | (() => void) = null;
    void listen<string>('indexing-log', (event) => {
      appendIndexLog(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    globalThis.addEventListener('contextmenu', handleContextMenu);
    return () => {
      globalThis.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key === 'F11') {
        event.preventDefault();
        void (async () => {
          try {
            const win = getCurrentWindow();
            const isFullscreen = await win.isFullscreen();
            await win.setFullscreen(!isFullscreen);
          } catch (err) {
            console.error('F11 fullscreen toggle failed', err);
          }
        })();
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        void handleToggleFullscreen();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    verticalMirror,
    horizontalMirror,
    greyscale,
    timerFlowMode,
    showFolderHistoryPanel,
    showTopControls,
    showImageHistoryPanel,
    showBottomControls,
    isFullscreenImage,
  ]);

  useEffect(() => {
    if (!isIndexing) return;
    const panel = indexingLogContainerRef.current;
    if (!panel) return;
    panel.scrollTop = panel.scrollHeight;
  }, [isIndexing, indexingLogs]);

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

  const handleFolderItemClick = async (slotIndex: number) => {
    if (isIndexing) return;
    const offset = half - slotIndex;
    const targetIndex = folderHistoryIndex + offset;
    if (targetIndex === folderHistoryIndex) return;
    if (targetIndex < 0 || targetIndex >= folderHistory.length) return;

    try {
      const folderInfo = await setFolderByIndex(targetIndex);
      await loadFolderHistory();
      const imageData = await getCurrentImage();
      await handleLoadImage(imageData);
      const savedMode = getFolderHistoryMode(folderInfo.id);
      const history = savedMode === 'normal' ? await getNormalHistory() : await getRandomHistory();
      await loadHistory(history, savedMode);
    } catch (err) {
      await handleBackendError(err);
    }
  };

  const handleImageItemClick = async (slotIndex: number) => {
    if (isIndexing) return;
    const offset = slotIndex - half;
    const targetIndex = historyIndex + offset;
    if (targetIndex === historyIndex) return;
    if (targetIndex < 0 || targetIndex >= history.length) return;

    if (activeHistoryMode === 'normal') {
      const res = await runOp(() => setNormalImageByIndex(targetIndex));
      if (!res) return;
      await handleLoadImage(res);
      const hist = await runOp(() => getNormalHistory());
      if (hist) await loadHistory(hist, 'normal');
    } else {
      const res = await runOp(() => setRandomImageByIndex(targetIndex));
      if (!res) return;
      await handleLoadImage(res);
      const hist = await runOp(() => getRandomHistory());
      if (hist) await loadHistory(hist, 'random');
    }
  };

  const loadForceRandomImage = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const res = await runOp(() => getForceRandomImage());
    if (!res) return;
    await handleLoadImage(res);
    const hist = await runOp(() => getRandomHistory());
    if (hist) await loadHistory(hist, 'random');
  };

  const handlePrevFolder = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const folderInfo = await runOp(() => getPrevFolder());
    if (!folderInfo) return;
    await loadFolderHistory();
    const imageData = await runOp(() => getCurrentImage());
    if (!imageData) return;
    await handleLoadImage(imageData);
    const savedMode = getFolderHistoryMode(folderInfo.id);
    const history = savedMode === 'normal' ? await runOp(() => getNormalHistory()) : await runOp(() => getRandomHistory());
    if (history) await loadHistory(history, savedMode);
  };

  const handleReindexFolder = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const currentFolder = folderHistory[folderHistoryIndex]?.path ?? null;
    if (currentFolder) {
      startIndexingUi(currentFolder);
    } else {
      setIsIndexing(true);
      setIndexingLogs(['indexing:start reindex-current-folder']);
    }
 
    const folderResult = await runOp(() => reindexCurrentFolder());
    if (!folderResult) {
      endIndexingUi(false);
      return;
    }
    await loadFolderHistory();
    const imageData = await runOp(() => getCurrentImage());
    if (!imageData) {
      endIndexingUi(false);
      return;
    }
    await handleLoadImage(imageData);
    const history = activeHistoryMode === 'normal' ? await runOp(() => getNormalHistory()) : await runOp(() => getRandomHistory());
    if (history) await loadHistory(history, activeHistoryMode);
    endIndexingUi(true);
  };

  const handleNextFolder = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const folderInfo = await runOp(() => getNextFolder());
    if (!folderInfo) return;
    await loadFolderHistory();
    const imageData = await runOp(() => getCurrentImage());
    if (!imageData) return;
    await handleLoadImage(imageData);
    const savedMode = getFolderHistoryMode(folderInfo.id);
    const history = savedMode === 'normal' ? await runOp(() => getNormalHistory()) : await runOp(() => getRandomHistory());
    if (history) await loadHistory(history, savedMode);
  };

  const handleFullWipe = async () => {
    if (isIndexing) return;
    await fullWipe();
    setImageSrc('');
    setHistory([]);
    setHistoryIndex(-1);
    setFolderHistory([]);
    setFolderHistoryIndex(-1);
  };

  const handlePrevImage = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const res = await runOp(() => getPrevImage());
    if (!res) return;
    await handleLoadImage(res);
    const hist = await runOp(() => getNormalHistory());
    if (hist) await loadHistory(hist, 'normal');
  };

  const handleNextImage = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const res = await runOp(() => getNextImage());
    if (!res) return;
    await handleLoadImage(res);
    const hist = await runOp(() => getNormalHistory());
    if (hist) await loadHistory(hist, 'normal');
  };

  const handlePrevRandomImage = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const res = await runOp(() => getPrevRandomImage());
    if (!res) return;
    await handleLoadImage(res);
    const hist = await runOp(() => getRandomHistory());
    if (hist) await loadHistory(hist, 'random');
  };

  const handleNextRandomImage = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const res = await runOp(() => getNextRandomImage());
    if (!res) return;
    await handleLoadImage(res);
    const hist = await runOp(() => getRandomHistory());
    if (hist) await loadHistory(hist, 'random');
  };

  const handleResetRandomHistory = async () => {
    if (isIndexing) return;
    await resetRandomHistory();
    const history = await getRandomHistory();
    await loadHistory(history, 'random');
  };

  const handleResetNormalHistory = async () => {
    if (isIndexing) return;
    await resetNormalHistory();
    const history = await getNormalHistory();
    await loadHistory(history, 'normal');
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
    if (isIndexing) return false;
    if (!(await ensureFolderSelected())) return false;

    if (timerFlowModeRef.current === 'normal') {
      const imageData = await getNextImage();
      await handleLoadImage(imageData);
      const history = await getNormalHistory();
      await loadHistory(history, 'normal');
      return true;
    }

    const imageData = await getNextRandomImage();
    await handleLoadImage(imageData);
    const history = await getRandomHistory();
    await loadHistory(history, 'random');
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
    if (isIndexing) return;
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
    if (isIndexing) return;
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
      >
        {imageSrc && (
          <img
            src={imageSrc}
            style={{
              width: '100vw',
              height: '100vh',
              objectFit: 'contain',
              transform: `${horizontalMirror ? 'scaleX(-1)' : ''} ${verticalMirror ? 'scaleY(-1)' : ''}`.trim() || 'none',
              filter: greyscale ? 'grayscale(1)' : 'none',
            }}
            alt="loaded image"
          />
        )}

        <HoverRevealButton
          onClick={handleToggleFullscreen}
          label="exit-fullscreen"
          baseOpacity={0}
          style={{
            ...uiHideToggleButtonStyle,
            position: 'absolute',
            left: '10px',
            bottom: '10px',
            zIndex: 2,
          }}
        />
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
      >
        <HoverRevealButton
          onClick={handleToggleFolderHistoryPanel}
          label={showFolderHistoryPanel ? 'hide-folder-history' : 'show-folder-history'}
          style={uiHideToggleButtonStyle}
        />
        <HoverRevealButton
          onClick={handleToggleTopControls}
          label={showTopControls ? 'hide-top-buttons' : 'show-top-buttons'}
          style={uiHideToggleButtonStyle}
        />
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
      >
        <HoverRevealButton
          onClick={handleToggleBottomControls}
          label={showBottomControls ? 'hide-bottom-buttons' : 'show-bottom-buttons'}
          style={uiHideToggleButtonStyle}
        />
        <HoverRevealButton
          onClick={handleToggleImageHistoryPanel}
          label={showImageHistoryPanel ? 'hide-image-history' : 'show-image-history'}
          style={uiHideToggleButtonStyle}
        />
      </div>

      {toast.visible && (
        <div
          data-testid="toast"
          style={{
            position: 'absolute',
            left: '10px',
            bottom: isIndexing ? '200px' : '10px',
            maxWidth: '400px',
            padding: '10px 16px',
            background: 'rgba(17, 19, 29, 0.95)',
            border: '1px solid #f7768e',
            borderRadius: '4px',
            color: '#f7768e',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {toast.message}
        </div>
      )}

      {isIndexing && (
        <div
          data-testid="indexing-log-panel"
          ref={indexingLogContainerRef}
          style={{
            position: 'absolute',
            left: '10px',
            bottom: '10px',
            width: '40vw',
            maxWidth: '540px',
            minHeight: '72px',
            maxHeight: '180px',
            overflowY: 'auto',
            padding: '8px',
            background: 'rgba(17, 19, 29, 0.92)',
            border: '1px solid #414868',
            color: '#9aa5ce',
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: 1.35,
            zIndex: 2,
          }}
        >
          <div style={{ color: '#f2d06b', marginBottom: '4px' }}>indexing in progress...</div>
          {indexingLogs.length === 0
            ? <div>starting...</div>
            : indexingLogs.map((line, idx) => <div key={`${idx}-${line}`}>{line}</div>)}
        </div>
      )}

      {showFolderHistoryPanel && (
        <HistoryPanel
          panelTestId="folder-history-panel"
          listContainerTestId="folder-list-container"
          listItemTestId="folder-list-item"
          items={folderWindowItems}
          currentSlotIndex={half}
          pendingItem={indexingFolderPath}
          onItemClick={handleFolderItemClick}
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
              disabled={isIndexing}
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
              <ActionButton label="reset-random-history" onClick={handleResetRandomHistory} disabled={isIndexing} />
              <ActionButton label="reset_normal_history" onClick={handleResetNormalHistory} disabled={isIndexing} />
              <ActionButton label="full_wipe" onClick={handleFullWipe} disabled={isIndexing} />
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
        >
          {imageSrc && (
            <img
              src={imageSrc}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                transform: `${horizontalMirror ? 'scaleX(-1)' : ''} ${verticalMirror ? 'scaleY(-1)' : ''}`.trim() || 'none',
                filter: greyscale ? 'grayscale(1)' : 'none',
              }}
              alt="loaded image"
            />
          )}

          <HoverRevealButton
            onClick={handleToggleFullscreen}
            label="fullscreen"
            style={{
              ...uiHideToggleButtonStyle,
              position: 'absolute',
              left: '8px',
              bottom: '8px',
            }}
          />
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
            disabled={isIndexing}
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
          onItemClick={handleImageItemClick}
        />
      )}
    </div>
  );
}
