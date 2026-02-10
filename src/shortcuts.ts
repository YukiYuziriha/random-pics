// Dual-hand shortcut registry - Single Source of Truth

export type ShortcutAction = {
  id: string;
  label: string;
  leftKey: string;
  rightKey: string;
  showHint: boolean;
};

export type ShortcutSide = 'left' | 'right';
export type ShortcutLayoutSection = 'bottom-row-1' | 'bottom-row-2' | 'folder-controls';

export const SHORTCUT_REGISTRY: ShortcutAction[] = [
  { id: 'vertical-mirror', label: 'vertical-mirror', leftKey: 'c', rightKey: ',', showHint: true },
  { id: 'horizontal-mirror', label: 'horizontal-mirror', leftKey: 'v', rightKey: 'm', showHint: true },
  { id: 'grayscale', label: 'grayscale', leftKey: 'b', rightKey: 'n', showHint: true },
  { id: 'next-normal', label: 'next', leftKey: 'f', rightKey: 'k', showHint: true },
  { id: 'prev-normal', label: 'prev', leftKey: 'd', rightKey: 'j', showHint: true },
  { id: 'next-random', label: 'next-random', leftKey: 'g', rightKey: 'l', showHint: true },
  { id: 'prev-random', label: 'prev-random', leftKey: 's', rightKey: 'h', showHint: true },
  { id: 'force-random', label: 'new-random', leftKey: 'w', rightKey: 'o', showHint: true },
  { id: 'toggle-flow-mode', label: 'toggle-order', leftKey: 'q', rightKey: 'p', showHint: true },
  { id: 'start-stop', label: 'start-stop', leftKey: 't', rightKey: 'y', showHint: true },
  { id: 'play-pause', label: 'play-pause', leftKey: 'r', rightKey: 'u', showHint: true },
  { id: 'fullscreen', label: 'fullscreen', leftKey: 'x', rightKey: '.', showHint: true },
  { id: 'exit-fullscreen', label: 'exit-fullscreen', leftKey: 'x', rightKey: '.', showHint: true },
  { id: 'next-folder', label: 'next-folder', leftKey: '7', rightKey: '5', showHint: true },
  { id: 'prev-folder', label: 'prev-folder', leftKey: '6', rightKey: '4', showHint: true },
  { id: 'reindex-folder', label: 'reindex-folder', leftKey: '8', rightKey: '3', showHint: true },
  { id: 'pick-folder', label: 'pick-folder', leftKey: '9', rightKey: '2', showHint: true },
  { id: 'hide-folder-history', label: 'hide-folder-history', leftKey: 'f2', rightKey: 'f6', showHint: true },
  { id: 'hide-top-buttons', label: 'hide-top-buttons', leftKey: 'f3', rightKey: 'f7', showHint: true },
  { id: 'hide-bottom-buttons', label: 'hide-bottom-buttons', leftKey: 'f4', rightKey: 'f8', showHint: true },
  { id: 'hide-image-history', label: 'hide-image-history', leftKey: 'f5', rightKey: 'f9', showHint: true },
  { id: 'show-folder-history', label: 'show-folder-history', leftKey: 'f2', rightKey: 'f6', showHint: true },
  { id: 'show-top-buttons', label: 'show-top-buttons', leftKey: 'f3', rightKey: 'f7', showHint: true },
  { id: 'show-bottom-buttons', label: 'show-bottom-buttons', leftKey: 'f4', rightKey: 'f8', showHint: true },
  { id: 'show-image-history', label: 'show-image-history', leftKey: 'f5', rightKey: 'f9', showHint: true },
  { id: 'reset-random-history', label: 'reset-random-history', leftKey: '', rightKey: '', showHint: true },
  { id: 'reset-normal-history', label: 'reset-normal-history', leftKey: '', rightKey: '', showHint: true },
  { id: 'full-wipe', label: 'full-wipe', leftKey: '', rightKey: '', showHint: true },
];

const SHORTCUT_DISPLAY_ORDER: Record<ShortcutLayoutSection, Record<ShortcutSide, string[]>> = {
  'bottom-row-1': {
    left: ['toggle-flow-mode', 'force-random', 'play-pause', 'start-stop'],
    right: ['start-stop', 'play-pause', 'force-random', 'toggle-flow-mode'],
  },
  'bottom-row-2': {
    left: ['prev-random', 'prev-normal', 'next-normal', 'next-random'],
    right: ['prev-random', 'prev-normal', 'next-normal', 'next-random'],
  },
  'folder-controls': {
    left: ['prev-folder', 'next-folder', 'reindex-folder', 'pick-folder'],
    right: ['pick-folder', 'reindex-folder', 'prev-folder', 'next-folder'],
  },
};

export function getShortcutAction(actionId: string): ShortcutAction | undefined {
  return SHORTCUT_REGISTRY.find(a => a.id === actionId);
}

export function getShortcutLabel(actionId: string, side: ShortcutSide, hintsVisible: boolean): string {
  const action = getShortcutAction(actionId);
  if (!action || !hintsVisible || !action.showHint) {
    return action?.label ?? actionId;
  }
  const key = side === 'left' ? action.leftKey : action.rightKey;
  if (!key) {
    return action.label;
  }
  return `[${key}]${action.label}`;
}

export function getShortcutKey(actionId: string, side: ShortcutSide): string | null {
  const action = getShortcutAction(actionId);
  if (!action) return null;
  const key = side === 'left' ? action.leftKey : action.rightKey;
  return key || null;
}

export function getShortcutDisplayOrder(section: ShortcutLayoutSection, side: ShortcutSide): string[] {
  return SHORTCUT_DISPLAY_ORDER[section][side];
}

export function findActionByKey(key: string): ShortcutAction | undefined {
  const normalizedKey = key.toLowerCase();
  return SHORTCUT_REGISTRY.find(
    a => a.leftKey.toLowerCase() === normalizedKey || a.rightKey.toLowerCase() === normalizedKey
  );
}
