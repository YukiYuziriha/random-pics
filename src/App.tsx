import { useEffect, useState } from 'react';
import { NEXT_RANDOM_ENDPOINT, PREV_RANDOM_ENDPOINT, FORCE_RANDOM_ENDPOINT, NEXT_ENDPOINT, PREV_ENDPOINT, RANDOM_HISTORY_ENDPOINT, FOLDER_HISTORY_ENDPOINT, PICK_FOLDER_ENDPOINT } from "./constants/endpoints.ts";


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

  const loadHistory = async () => {
    const res = await fetch(`/api/${RANDOM_HISTORY_ENDPOINT}`)
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

  const handlePickFolder = async (): Promise<boolean> => {
    const folderPath = await Neutralino.os.showFolderDialog("Pick folder", {});
    if (!folderPath) return false;

    await fetch(`/api/${PICK_FOLDER_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: folderPath }),
    });

    await loadFolderHistory();
    return true;
  };

  const ensureFolderSelected = async (): Promise<boolean> => {
    if (folderHistoryIndex >= 0) return true;
    return handlePickFolder();
  };

  const guardedLoadImage = async (endpoint: string, refreshHistory: boolean): Promise<void> => {
    if (!(await ensureFolderSelected())) return;
    await handleLoadImage(endpoint);
    if (refreshHistory) {
      await loadHistory();
    }
  };

  useEffect(() => {
    void loadFolderHistory();
  }, []);

  const historyVisualSize = 51;
  const half = Math.floor(historyVisualSize / 2);
  
  const windowItems = Array.from({ length: historyVisualSize }, (_, i) => {
    const historyIndexAtSlot = historyIndex + (i - half);
    if (historyIndexAtSlot < 0 || historyIndexAtSlot >= history.length) {
      return null;
    }
    return history[historyIndexAtSlot];
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
        flexShrink: 0,
      }}
    >

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
          }}
          alt="loaded image"
        />}
      </div>
      <div 
        data-testid="buttons-row"
        style={{
          flexDirection: 'row',
          display: 'flex',
          marginTop: 'auto',
          alignItems: 'center',
        }}
      >
        <PickFolderButton onPick={async () => { await handlePickFolder(); }} />

        <PrevButton onLoadImage={() => guardedLoadImage(PREV_ENDPOINT, true)} />
        
        <NextButton onLoadImage={() => guardedLoadImage(NEXT_ENDPOINT, true)} />
        
        <PrevRandomButton onLoadImage={ async () => {
          await guardedLoadImage(PREV_RANDOM_ENDPOINT, true);
        }} />          

        <ForceRandomButton onLoadImage={ async () => { 
          await guardedLoadImage(FORCE_RANDOM_ENDPOINT, true);
        }} />
        
        <NextRandomButton onLoadImage={ async () => { 
          await guardedLoadImage(NEXT_RANDOM_ENDPOINT, true);
        }} />
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
