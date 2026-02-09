/**
 * Behavior Contract Types
 * 
 * These types define the expected behavior contract for the Bun HTTP backend.
 */

export type FolderInfo = {
  id: number;
  path: string;
};

export type ImageHistory = {
  history: string[];
  currentIndex: number;
};

export type FolderHistory = {
  history: string[];
  currentIndex: number;
};

export type ImageState = {
  verticalMirror: boolean;
  horizontalMirror: boolean;
  greyscale: boolean;
  timerFlowMode: 'random' | 'normal';
  showFolderHistoryPanel: boolean;
  showTopControls: boolean;
  showImageHistoryPanel: boolean;
  showBottomControls: boolean;
  isFullscreenImage: boolean;
};

export type ImageData = ArrayBuffer;

/**
 * BackendAdapter defines the interface used by test scenarios.
 */
export interface BackendAdapter {
  // Folder operations
  pickFolder(path: string): Promise<FolderInfo>;
  getNextFolder(): Promise<FolderInfo | null>;
  getPrevFolder(): Promise<FolderInfo | null>;
  getFolderHistory(): Promise<FolderHistory>;
  reindexCurrentFolder(): Promise<FolderInfo>;
  
  // Image traversal - Normal mode
  getCurrentImage(): Promise<ImageData>;
  getNextImage(): Promise<ImageData>;
  getPrevImage(): Promise<ImageData>;
  
  // Image traversal - Random mode
  getNextRandomImage(): Promise<ImageData>;
  getPrevRandomImage(): Promise<ImageData>;
  getForceRandomImage(): Promise<ImageData>;
  
  // History operations
  getNormalHistory(): Promise<ImageHistory>;
  getRandomHistory(): Promise<ImageHistory>;
  resetNormalHistory(): Promise<void>;
  resetRandomHistory(): Promise<void>;
  
  // State operations
  getImageState(): Promise<ImageState>;
  setImageState(state: ImageState): Promise<void>;
  
  // Destructive operations
  fullWipe(): Promise<void>;
  
  // Lifecycle
  isHealthy(): Promise<boolean>;
}

/**
 * Test context passed to scenarios
 */
export type TestContext = {
  adapter: BackendAdapter;
  testDataDir: string;
  expect: {
    equal: (actual: unknown, expected: unknown, message?: string) => void;
    true: (value: boolean, message?: string) => void;
    false: (value: boolean, message?: string) => void;
    throws: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
    arrayContains: <T>(array: T[], item: T, message?: string) => void;
  };
};

/**
 * A scenario is a test case that exercises specific behavior
 */
export type Scenario = {
  name: string;
  description: string;
  run: (ctx: TestContext) => Promise<void>;
};

/**
 * ScenarioResult captures the outcome of running a scenario
 */
export type ScenarioResult = {
  name: string;
  passed: boolean;
  error: string | undefined;
  duration: number;
};
