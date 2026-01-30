import { useEffect, useState } from 'react';
import { NEXT_RANDOM_ENDPOINT, PREV_RANDOM_ENDPOINT, FORCE_RANDOM_ENDPOINT, NEXT_ENDPOINT, PREV_ENDPOINT, CURRENT_IMAGE_ENDPOINT, RANDOM_HISTORY_ENDPOINT, NORMAL_HISTORY_ENDPOINT, FOLDER_HISTORY_ENDPOINT, PICK_FOLDER_ENDPOINT, NEXT_FOLDER_ENDPOINT, PREV_FOLDER_ENDPOINT, REINDEX_CURRENT_FOLDER_ENDPOINT, RESET_RANDOM_HISTORY_ENDPOINT, RESET_NORMAL_HISTORY_ENDPOINT, FULL_WIPE_ENDPOINT, STATE_ENDPOINT } from "./constants/endpoints.ts";


function ForceRandomButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      new-random
    </button>
  )
}

function NextButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      next
    </button>
  )
}

function PrevButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      prev
    </button>
  )
}

function NextRandomButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      next-random
    </button>
  )
}

function PrevRandomButton({ onLoadImage }: { onLoadImage: () => void }) {
  return (
    <button onClick={onLoadImage}>
      prev-random
    </button>
  )
}

function ReindexFolderButton({ onReindex }: { onReindex: () => void }) {
  return (
    <button onClick={onReindex}>
      reindex-folder
    </button>
  )
}

function ResetRandomHistoryButton({ onReset }: { onReset: () => void }) {
  return (
    <button onClick={onReset}>
      reset-random-history
    </button>
  )
}

function ResetNormalHistoryButton({ onReset }: { onReset: () => void }) {
  return (
    <button onClick={onReset}>
      reset_normal_history
    </button>
  )
}

function FullWipeButton({ onWipe }: { onWipe: () => void }) {
  return (
    <button onClick={onWipe}>
      full_wipe
    </button>
  )
}

function NextFolderButton({ onLoadFolder }: { onLoadFolder: () => void }) {
  return (
    <button onClick={onLoadFolder}>
      next-folder
    </button>
  )
}

function PrevFolderButton({ onLoadFolder }: { onLoadFolder: () => void }) {
  return (
    <button onClick={onLoadFolder}>
      prev-folder
    </button>
  )
}

function PickFolderButton({ onPick }: { onPick: () => void }) {
  return (
    <button onClick={onPick}>
      pick-folder
    </button>
  );
} 

export default function App() {
  const [imageSrc, setImageSrc] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [folderHistoryIndex, setFolderHistoryIndex] = useState(-1)
  const [verticalMirror, setVerticalMirror] = useState(false);
  const [horizontalMirror, setHorizontalMirror] = useState(false);
  const [greyscale, setGreyscale] = useState(false);

  const loadHistory = async (endpoint: string) => {
    const res = await fetch(`/api/${endpoint}`)
    const data = await res.json()
    setHistory(data.history);
    setHistoryIndex(data.currentIndex);
  };

  const handleLoadImage = async (endpoint: string) => {
    const res = await fetch(`/api/${endpoint}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    setImageSrc(url)
  } 
  
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  };

  const handlePickFolder = async (): Promise<boolean> => {
    const folderPath = await Neutralino.os.showFolderDialog("Pick folder", {});
    if (!folderPath) return false;

    await fetch(`/api/${PICK_FOLDER_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  }, []);

  const historyVisualSize = 31;
  const half = Math.floor(historyVisualSize / 2);
  
  const windowItems = Array.from({ length: historyVisualSize }, (_, i) => {
    const historyIndexAtSlot = historyIndex + (i - half);
    if (historyIndexAtSlot < 0 || historyIndexAtSlot >= history.length) {
      return null;
    }
    return history[historyIndexAtSlot];
  });

  const folderWindowItems = Array.from({ length: historyVisualSize }, (_, i) => {
    const historyIndexAtSlot = folderHistoryIndex + (half - i);
    if (historyIndexAtSlot < 0 || historyIndexAtSlot >= folderHistory.length) {
      return null;
    }
    return folderHistory[historyIndexAtSlot];
  });

  return (
    <div 
      data-testid="app-panel" 
      style={{
        height: '100vh',
        border: '3px solid #615532',
        gap: '10px',
        background: '#21294a',
        flexDirection: 'row',
        display: 'flex',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
    <div
      data-testid="folder-history-panel"
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
        data-testid="folder-list-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          overflowY: 'auto',
        }}
      >
        {folderWindowItems.map((item, i) => {
          const isCurrent = i === half;
          return (
            <div
              data-testid="folder-list-item"
              key={`${i}-${item ?? "empty"}`}
              style={{
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: item ? (isCurrent ? "#fff" : "#a0a0a0") : "transparent",
                background: isCurrent ? "#3b2f1f" : "transparent",
                fontWeight: isCurrent ? 700 : 400,
                fontFamily: "monospace",
                borderRadius: "4px",
              }}
            >
              {item ? item.split("/").pop() : "placeholder"}
            </div>
          );
        })}
      </div>
    </div>
    <div
      data-testid="image-and-buttons"
      style={{
        display: 'flex',
        height: '100vh',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        data-testid="folder-buttons-row"
        style={{
          flexDirection: 'row',
          display: 'flex',
          marginBottom: 'auto',
          alignItems: 'center',
        }}
      >
        <PrevFolderButton onLoadFolder={async () => {
          if (!(await ensureFolderSelected())) return;
          await fetch(`/api/${PREV_FOLDER_ENDPOINT}`);
          await loadFolderHistory();
          await handleLoadImage(CURRENT_IMAGE_ENDPOINT);
          await loadHistory(NORMAL_HISTORY_ENDPOINT);
        }} />

        <PickFolderButton onPick={async () => { await handlePickFolder(); }} />

        <ReindexFolderButton onReindex={async () => {
          if (!(await ensureFolderSelected())) return;
          await fetch(`/api/${REINDEX_CURRENT_FOLDER_ENDPOINT}`, { method: "POST" });
          await loadFolderHistory();
          await handleLoadImage(CURRENT_IMAGE_ENDPOINT);
          await loadHistory(NORMAL_HISTORY_ENDPOINT);
        }} />

        <NextFolderButton onLoadFolder={async () => {
          if (!(await ensureFolderSelected())) return;
          await fetch(`/api/${NEXT_FOLDER_ENDPOINT}`);
          await loadFolderHistory();
          await handleLoadImage(CURRENT_IMAGE_ENDPOINT);
          await loadHistory(NORMAL_HISTORY_ENDPOINT);
        }} />

        <FullWipeButton onWipe={async () => {
          await fetch(`/api/${FULL_WIPE_ENDPOINT}`, { method: "POST" });
          setImageSrc("");
          setHistory([]);
          setHistoryIndex(-1);
          setFolderHistory([]);
          setFolderHistoryIndex(-1);
        }} />
      </div>
      <div 
        data-testid="image-container"
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          overflow: 'hidden',
          alignItems: 'center',
        }}
      >
        {imageSrc && <img
          src={imageSrc}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%', 
            objectFit: 'contain',
            transform: `${horizontalMirror ? "scaleX(-1)" : ""} ${verticalMirror ? "scaleY(-1)" : ""}`.trim() || "none",
            filter: greyscale ? "grayscale(1)" : "none",
          }}
          alt="loaded image"
        />}
      </div>
      <div 
        data-testid="image-buttons-row"
        style={{
          flexDirection: 'row',
          display: 'flex',
          marginTop: 'auto',
          alignItems: 'center',
        }}
      >
        <PrevButton onLoadImage={async () => {
          if (!(await ensureFolderSelected())) return;
          await handleLoadImage(PREV_ENDPOINT);
          await loadHistory(NORMAL_HISTORY_ENDPOINT);
        }} />
        
        <NextButton onLoadImage={async () => {
          if (!(await ensureFolderSelected())) return;
          await handleLoadImage(NEXT_ENDPOINT);
          await loadHistory(NORMAL_HISTORY_ENDPOINT);
        }} />
        
        <PrevRandomButton onLoadImage={ async () => {
          if (!(await ensureFolderSelected())) return;
          await handleLoadImage(PREV_RANDOM_ENDPOINT);
          await loadHistory(RANDOM_HISTORY_ENDPOINT);
        }} />          

        <ForceRandomButton onLoadImage={ async () => { 
          if (!(await ensureFolderSelected())) return;
          await handleLoadImage(FORCE_RANDOM_ENDPOINT);
          await loadHistory(RANDOM_HISTORY_ENDPOINT);
        }} />
        
        <NextRandomButton onLoadImage={ async () => { 
          if (!(await ensureFolderSelected())) return;
          await handleLoadImage(NEXT_RANDOM_ENDPOINT);
          await loadHistory(RANDOM_HISTORY_ENDPOINT);
        }} />

        <ResetRandomHistoryButton onReset={async () => {
          await fetch(`/api/${RESET_RANDOM_HISTORY_ENDPOINT}`, { method: "POST" });
          await loadHistory(RANDOM_HISTORY_ENDPOINT);
        }} />

        <ResetNormalHistoryButton onReset={async () => {
          await fetch(`/api/${RESET_NORMAL_HISTORY_ENDPOINT}`, { method: "POST" });
          await loadHistory(NORMAL_HISTORY_ENDPOINT);
        }} />

        <button onClick={async () => {
          const next = !verticalMirror;
          setVerticalMirror(next);
          await persistImageState({ verticalMirror: next, horizontalMirror, greyscale });
        }}>
          vertical-mirror
        </button>

        <button onClick={async () => {
          const next = !horizontalMirror;
          setHorizontalMirror(next);
          await persistImageState({ verticalMirror, horizontalMirror: next, greyscale });
        }}>
          horizontal-mirror
        </button>

        <button onClick={async () => {
          const next = !greyscale;
          setGreyscale(next);
          await persistImageState({ verticalMirror, horizontalMirror, greyscale: next });
        }}>
          greyscale
        </button>
      </div>
    </div>
    <div
      data-testid="random-history-panel"
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
        data-testid="list-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          overflowY: 'auto',
        }}
      >
        {windowItems.map((item, i) => {
          const isCurrent = i === half;
          return (
            <div
              data-testid="list-item"
              key={`${i}-${item ?? "empty"}`}
              style={{
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: item ? (isCurrent ? "#fff" : "#a0a0a0") : "transparent",
                background: isCurrent ? "#3b2f1f" : "transparent",
                fontWeight: isCurrent ? 700 : 400,
                fontFamily: "monospace",
                borderRadius: "4px",
              }}
            >
              {item ? item.split("/").pop() : "placeholder"}
            </div>
          );
        })}
      </div>
    </div>
    </div>
  )
}
