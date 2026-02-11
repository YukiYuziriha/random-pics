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
  hideNormalHistoryImage,
  hideRandomHistoryImage,
  cleanupStaleFolders,
  type FolderHistoryItem,
  type ImageHistoryItem,
  type ImageHistory,
  type ImageState,
  type FolderInfo,
  type ImageResponse,
} from './apiClient.ts';
import { FolderControls } from './components/FolderControls.tsx';
import { HistoryPanel } from './components/HistoryPanel.tsx';
import { ImageControls } from './components/ImageControls.tsx';
import { ActionButton } from './components/ActionButton.tsx';
import { getShortcutLabel, findActionByKey, SHORTCUT_REGISTRY } from './shortcuts.ts';

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
  shortcutHintsVisible: boolean;
  shortcutHintSide: 'left' | 'right';
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
  const [history, setHistory] = useState<ImageHistoryItem[]>([]);
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
  const [isTimerHoldCaptureActive, setIsTimerHoldCaptureActive] = useState(false);
  const [shortcutHintsVisible, setShortcutHintsVisible] = useState(false);
  const [shortcutHintSide, setShortcutHintSide] = useState<'left' | 'right'>('left');
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
  const shortcutHintsVisibleRef = useRef(false);
  const shortcutHintSideRef = useRef<'left' | 'right'>('left');
  const timerHoldCaptureActiveRef = useRef(false);
  const timerHoldCaptureKeyRef = useRef<'z' | '/' | null>(null);
  const timerHoldCaptureBufferRef = useRef('');

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

  const commitTimerHoldCapture = () => {
    const buffer = timerHoldCaptureBufferRef.current;
    if (buffer.length > 0) {
      const parsed = Number(buffer);
      if (!Number.isNaN(parsed)) {
        const next = sanitizeSeconds(parsed);
        setInitialTimerSeconds(next);
        timerLoopStartSecondsRef.current = next;
      }
    }
    timerHoldCaptureBufferRef.current = '';
    timerHoldCaptureActiveRef.current = false;
    timerHoldCaptureKeyRef.current = null;
    setIsTimerHoldCaptureActive(false);
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

  const loadPreferredHistoryForFolder = async (folderId: number): Promise<void> => {
    const savedMode = getFolderHistoryMode(folderId);
    if (savedMode === 'random') {
      const randomHistory = await getRandomHistory();
      if (randomHistory.history.length > 0 && randomHistory.currentIndex >= 0) {
        await loadHistory(randomHistory, 'random');
        return;
      }
    }

    const normalHistory = await getNormalHistory();
    await loadHistory(normalHistory, 'normal');
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
    setShortcutHintsVisible(data.shortcutHintsVisible);
    setShortcutHintSide(data.shortcutHintSide);
    shortcutHintsVisibleRef.current = data.shortcutHintsVisible;
    shortcutHintSideRef.current = data.shortcutHintSide;
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
      shortcutHintsVisible: state.shortcutHintsVisible,
      shortcutHintSide: state.shortcutHintSide,
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
      await loadPreferredHistoryForFolder(folderInfo.id);
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
          await loadPreferredHistoryForFolder(currentFolder.id);
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
    shortcutHintsVisibleRef.current = shortcutHintsVisible;
  }, [shortcutHintsVisible]);

  useEffect(() => {
    shortcutHintSideRef.current = shortcutHintSide;
  }, [shortcutHintSide]);

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
      const normalizedKey = event.key.toLowerCase();

      if (timerHoldCaptureActiveRef.current) {
        if (normalizedKey === 'enter' || normalizedKey === ' ') {
          event.preventDefault();
          commitTimerHoldCapture();
          return;
        }
        if (normalizedKey === 'backspace') {
          event.preventDefault();
          timerHoldCaptureBufferRef.current = timerHoldCaptureBufferRef.current.slice(0, -1);
          return;
        }
        if (/^[0-9]$/.test(normalizedKey)) {
          event.preventDefault();
          const newBuffer = timerHoldCaptureBufferRef.current + normalizedKey;
          if (newBuffer.length <= 6) {
            timerHoldCaptureBufferRef.current = newBuffer;
          }
          return;
        }
        event.preventDefault();
        return;
      }

      if (normalizedKey === 'z' || normalizedKey === '/') {
        if (!event.repeat) {
          event.preventDefault();
          timerHoldCaptureActiveRef.current = true;
          timerHoldCaptureKeyRef.current = normalizedKey as 'z' | '/';
          timerHoldCaptureBufferRef.current = '';
          setIsTimerHoldCaptureActive(true);
        }
        return;
      }

      // Always allow typing in input fields
      if (isTypingTarget(event.target)) return;

      // Handle toggle keys (ignore repeats)
      if (event.key === 'Control' && !event.repeat) {
        event.preventDefault();
        const next = !shortcutHintsVisibleRef.current;
        shortcutHintsVisibleRef.current = next;
        setShortcutHintsVisible(next);
        void persistImageState({
          verticalMirror,
          horizontalMirror,
          greyscale,
          timerFlowMode,
          showFolderHistoryPanel,
          showTopControls,
          showImageHistoryPanel,
          showBottomControls,
          isFullscreenImage,
          shortcutHintsVisible: next,
          shortcutHintSide: shortcutHintSideRef.current,
        });
        return;
      }

      if (event.key === 'Alt' && !event.repeat) {
        event.preventDefault();
        const next = shortcutHintSideRef.current === 'left' ? 'right' : 'left';
        shortcutHintSideRef.current = next;
        setShortcutHintSide(next);
        void persistImageState({
          verticalMirror,
          horizontalMirror,
          greyscale,
          timerFlowMode,
          showFolderHistoryPanel,
          showTopControls,
          showImageHistoryPanel,
          showBottomControls,
          isFullscreenImage,
          shortcutHintsVisible: shortcutHintsVisibleRef.current,
          shortcutHintSide: next,
        });
        return;
      }

      // F11 for OS fullscreen
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

      // Handle function keys for panel toggles
      const key = event.key;
      if (key === 'F2' || key === 'F6') {
        event.preventDefault();
        void handleToggleFolderHistoryPanel();
        return;
      }
      if (key === 'F3' || key === 'F7') {
        event.preventDefault();
        void handleToggleTopControls();
        return;
      }
      if (key === 'F4' || key === 'F8') {
        event.preventDefault();
        void handleToggleBottomControls();
        return;
      }
      if (key === 'F5' || key === 'F9') {
        event.preventDefault();
        void handleToggleImageHistoryPanel();
        return;
      }

      // Handle action keys from registry
      const action = findActionByKey(normalizedKey);
      if (action) {
        event.preventDefault();
        switch (action.id) {
          case 'vertical-mirror':
            void handleToggleVerticalMirror();
            break;
          case 'horizontal-mirror':
            void handleToggleHorizontalMirror();
            break;
          case 'grayscale':
            void handleToggleGreyscale();
            break;
          case 'next-normal':
            void handleNextImage();
            break;
          case 'prev-normal':
            void handlePrevImage();
            break;
          case 'next-random':
            void handleNextRandomImage();
            break;
          case 'prev-random':
            void handlePrevRandomImage();
            break;
          case 'force-random':
            void loadForceRandomImage();
            break;
          case 'toggle-flow-mode':
            void handleToggleTimerFlowMode();
            break;
          case 'start-stop':
            void handleToggleStartStop();
            break;
          case 'play-pause':
            void handleTogglePausePlay();
            break;
          case 'fullscreen':
            void handleToggleFullscreen();
            break;
          case 'next-folder':
            void handleNextFolder();
            break;
          case 'prev-folder':
            void handlePrevFolder();
            break;
          case 'reindex-folder':
            void handleReindexFolder();
            break;
          case 'pick-folder':
            void handlePickFolder();
            break;
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const normalizedKey = event.key.toLowerCase();
      if (timerHoldCaptureActiveRef.current && timerHoldCaptureKeyRef.current === normalizedKey) {
        commitTimerHoldCapture();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keyup', handleKeyUp);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('keyup', handleKeyUp);
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
    shortcutHintsVisible,
    shortcutHintSide,
    isIndexing,
    isTimerRunning,
    initialTimerSeconds,
    remainingTimerSeconds,
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
      await loadPreferredHistoryForFolder(folderInfo.id);
    } catch (err) {
      await handleBackendError(err);
    }
  };

  const handleFolderDeleteClick = async (slotIndex: number) => {
    if (isIndexing) return;
    const offset = half - slotIndex;
    const targetIndex = folderHistoryIndex + offset;
    if (targetIndex < 0 || targetIndex >= folderHistory.length) return;

    const item = folderHistory[targetIndex];
    if (!item) return;
    const deletedCurrent = targetIndex === folderHistoryIndex;

    const ok = await runOp(() => deleteFolder(item.id));
    if (ok === null) return;

    await loadFolderHistory();

    const currentFolder = await runOp(() => getCurrentFolder());
    if (!currentFolder) {
      setImageSrc('');
      setHistory([]);
      setHistoryIndex(-1);
      return;
    }

    if (deletedCurrent) {
      showToast(`Switched to folder: ${currentFolder.path}`);
      const imageData = await runOp(() => getCurrentImage());
      if (!imageData) return;
      await handleLoadImage(imageData);
    }

    const loaded = await runOp(() => loadPreferredHistoryForFolder(currentFolder.id));
    if (loaded === null) return;
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

  const handleImageHideClick = async (slotIndex: number) => {
    if (isIndexing) return;
    const offset = slotIndex - half;
    const targetIndex = historyIndex + offset;
    if (targetIndex < 0 || targetIndex >= history.length) return;

    const item = history[targetIndex];
    if (!item) return;

    if (activeHistoryMode === 'normal') {
      const ok = await runOp(() => hideNormalHistoryImage(item.imageId));
      if (ok === null) return;
    } else {
      const ok = await runOp(() => hideRandomHistoryImage(item.imageId));
      if (ok === null) return;
    }

    if (activeHistoryMode === 'normal') {
      const imageData = await runOp(() => getCurrentImage());
      if (imageData) {
        await handleLoadImage(imageData);
      }

      const nextHistory = await runOp(() => getNormalHistory());
      if (nextHistory) await loadHistory(nextHistory, 'normal');
      return;
    }

    const nextHistory = await runOp(() => getRandomHistory());
    if (!nextHistory) return;
    await loadHistory(nextHistory, 'random');
    if (nextHistory.currentIndex < 0) return;

    const imageData = await runOp(() => setRandomImageByIndex(nextHistory.currentIndex));
    if (imageData) {
      await handleLoadImage(imageData);
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
    const loaded = await runOp(() => loadPreferredHistoryForFolder(folderInfo.id));
    if (loaded === null) return;
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
    const loaded = await runOp(() => loadPreferredHistoryForFolder(folderInfo.id));
    if (loaded === null) return;
  };

  const handleFullWipe = async () => {
    if (isIndexing) return;
    const ok = await runOp(() => fullWipe());
    if (ok === null) return;
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
    resetTimerAfterManualNavigation();
  };

  const handleNextImage = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const res = await runOp(() => getNextImage());
    if (!res) return;
    await handleLoadImage(res);
    const hist = await runOp(() => getNormalHistory());
    if (hist) await loadHistory(hist, 'normal');
    resetTimerAfterManualNavigation();
  };

  const handlePrevRandomImage = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const res = await runOp(() => getPrevRandomImage());
    if (!res) return;
    await handleLoadImage(res);
    const hist = await runOp(() => getRandomHistory());
    if (hist) await loadHistory(hist, 'random');
    resetTimerAfterManualNavigation();
  };

  const handleNextRandomImage = async () => {
    if (isIndexing) return;
    if (!(await ensureFolderSelected())) return;
    const res = await runOp(() => getNextRandomImage());
    if (!res) return;
    await handleLoadImage(res);
    const hist = await runOp(() => getRandomHistory());
    if (hist) await loadHistory(hist, 'random');
    resetTimerAfterManualNavigation();
  };

  const handleResetRandomHistory = async () => {
    if (isIndexing) return;
    const ok = await runOp(() => resetRandomHistory());
    if (ok === null) return;
    const history = await runOp(() => getRandomHistory());
    if (!history) return;
    await loadHistory(history, 'random');
  };

  const handleResetNormalHistory = async () => {
    if (isIndexing) return;
    const ok = await runOp(() => resetNormalHistory());
    if (ok === null) return;
    const history = await runOp(() => getNormalHistory());
    if (!history) return;
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
      shortcutHintsVisible,
      shortcutHintSide,
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
      shortcutHintsVisible,
      shortcutHintSide,
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
      shortcutHintsVisible,
      shortcutHintSide,
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

  const startTimerLoop = async (seconds: number, serveImageOnStart: boolean): Promise<boolean> => {
    const startAt = sanitizeSeconds(seconds);
    timerLoopStartSecondsRef.current = startAt;

    clearActiveTimer();

    if (serveImageOnStart) {
      const loaded = await loadTimerFlowImage();
      if (!loaded) {
        timerLoopActiveRef.current = false;
        setIsTimerRunning(false);
        setRemainingTimerSeconds(startAt);
        return false;
      }
    }

    timerLoopActiveRef.current = true;
    setRemainingTimerSeconds(startAt);
    startTimerCycle(startAt);
    return true;
  };

  const resetTimerAfterManualNavigation = () => {
    const resetTo = sanitizeSeconds(timerLoopStartSecondsRef.current);
    if (isTimerRunning) {
      void startTimerLoop(resetTo, false);
    } else {
      setRemainingTimerSeconds(resetTo);
    }
  };

  const loadTimerFlowImage = async (): Promise<boolean> => {
    if (isIndexing) return false;
    if (!(await ensureFolderSelected())) return false;

    if (timerFlowModeRef.current === 'normal') {
      const imageData = await runOp(() => getNextImage());
      if (!imageData) return false;
      await handleLoadImage(imageData);
      const history = await runOp(() => getNormalHistory());
      if (!history) return false;
      await loadHistory(history, 'normal');
      return true;
    }

    const imageData = await runOp(() => getNextRandomImage());
    if (!imageData) return false;
    await handleLoadImage(imageData);
    const history = await runOp(() => getRandomHistory());
    if (!history) return false;
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
    await startTimerLoop(startAt, true);
  };

  const handleTogglePausePlay = () => {
    if (isIndexing) return;
    if (isTimerRunning) {
      clearActiveTimer();
      setIsTimerRunning(false);
      return;
    }

    const restartAt = sanitizeSeconds(remainingTimerSeconds);
    void startTimerLoop(restartAt, false);
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
      shortcutHintsVisible,
      shortcutHintSide,
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
      shortcutHintsVisible,
      shortcutHintSide,
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
      shortcutHintsVisible,
      shortcutHintSide,
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
      shortcutHintsVisible,
      shortcutHintSide,
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
      shortcutHintsVisible,
      shortcutHintSide,
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
      shortcutHintsVisible,
      shortcutHintSide,
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
          label={getShortcutLabel('exit-fullscreen', shortcutHintSide, shortcutHintsVisible)}
          baseOpacity={0}
          style={{
            ...uiHideToggleButtonStyle,
            position: 'absolute',
            left: '10px',
            bottom: '10px',
            zIndex: 2,
          }}
        />

        {isTimerRunning && (
          <div
            style={{
              position: 'absolute',
              right: '10px',
              bottom: '10px',
              background: 'rgba(17, 19, 29, 0.85)',
              border: '1px solid #565f89',
              borderRadius: '2px',
              color: '#c0caf5',
              fontFamily: 'monospace',
              fontSize: '12px',
              padding: '4px 8px',
              zIndex: 2,
            }}
          >
            {remainingTimerSeconds}s
          </div>
        )}
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
          label={getShortcutLabel(showFolderHistoryPanel ? 'hide-folder-history' : 'show-folder-history', shortcutHintSide, shortcutHintsVisible)}
          style={uiHideToggleButtonStyle}
        />
        <HoverRevealButton
          onClick={handleToggleTopControls}
          label={getShortcutLabel(showTopControls ? 'hide-top-buttons' : 'show-top-buttons', shortcutHintSide, shortcutHintsVisible)}
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
          label={getShortcutLabel(showBottomControls ? 'hide-bottom-buttons' : 'show-bottom-buttons', shortcutHintSide, shortcutHintsVisible)}
          style={uiHideToggleButtonStyle}
        />
        <HoverRevealButton
          onClick={handleToggleImageHistoryPanel}
          label={getShortcutLabel(showImageHistoryPanel ? 'hide-image-history' : 'show-image-history', shortcutHintSide, shortcutHintsVisible)}
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
          onFolderDeleteClick={handleFolderDeleteClick}
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
              shortcutHintsVisible={shortcutHintsVisible}
              shortcutHintSide={shortcutHintSide}
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
              <ActionButton label={getShortcutLabel('reset-random-history', shortcutHintSide, shortcutHintsVisible)} onClick={handleResetRandomHistory} disabled={isIndexing} />
              <ActionButton label={getShortcutLabel('reset-normal-history', shortcutHintSide, shortcutHintsVisible)} onClick={handleResetNormalHistory} disabled={isIndexing} />
              <ActionButton label={getShortcutLabel('full-wipe', shortcutHintSide, shortcutHintsVisible)} onClick={handleFullWipe} disabled={isIndexing} />
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
            label={getShortcutLabel('fullscreen', shortcutHintSide, shortcutHintsVisible)}
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
            isStartStopCaptureActive={isTimerHoldCaptureActive}
            timerFlowMode={timerFlowMode}
            disabled={isIndexing}
            shortcutHintsVisible={shortcutHintsVisible}
            shortcutHintSide={shortcutHintSide}
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
          onImageHideClick={handleImageHideClick}
        />
      )}
    </div>
  );
}
