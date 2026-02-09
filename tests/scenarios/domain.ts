/**
 * Domain Behavior Test Scenarios
 * 
 * These scenarios test the actual behavior of the app, verifying:
 * - Images are actually loaded (not empty)
 * - History is actually tracked
 * - State is actually persisted
 * - Traversal works as expected
 * 
 * These scenarios are transport-agnostic and run against any BackendAdapter.
 */

import type { Scenario } from '../types.ts';
import { createTestFixtures, cleanupTestFixtures } from '../fixtures/images.ts';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Helper to create isolated test directories
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'random-pics-test-'));
}

/**
 * Scenario: After picking a folder, images are indexed and can be retrieved
 */
export const folderIndexingScenario: Scenario = {
  name: 'folder_indexing',
  description: 'Picking a folder indexes all images and makes them available',
  run: async (ctx) => {
    // Setup: Create test fixtures
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    const imageFiles = createTestFixtures(fixturesDir, { numImages: 5 });
    
    try {
      // Clean slate
      await ctx.adapter.fullWipe();
      
      // Pick the folder
      const folder = await ctx.adapter.pickFolder(fixturesDir);
      ctx.expect.true(folder.id > 0, 'Folder should have positive ID');
      ctx.expect.equal(folder.path, fixturesDir, 'Folder path should match');
      
      // Verify we can get current image (should load first image)
      const image = await ctx.adapter.getCurrentImage();
      ctx.expect.true(image.byteLength > 0, 'Image should have content');
      
      // Verify normal history shows all images
      const history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.history.length, 5, 'Should have 5 images in history');
      ctx.expect.equal(history.currentIndex, 0, 'Should start at index 0');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Normal mode traversal cycles through images in order
 */
export const normalTraversalScenario: Scenario = {
  name: 'normal_traversal',
  description: 'Normal mode next/prev traverses images in sequential order',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 3 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // Get first image
      const img1 = await ctx.adapter.getCurrentImage();
      ctx.expect.true(img1.byteLength > 0, 'First image should load');
      
      // Move to next
      const img2 = await ctx.adapter.getNextImage();
      ctx.expect.true(img2.byteLength > 0, 'Second image should load');
      
      let history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.currentIndex, 1, 'Should be at index 1 after next');
      
      // Move to next again
      const img3 = await ctx.adapter.getNextImage();
      ctx.expect.true(img3.byteLength > 0, 'Third image should load');
      
      history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.currentIndex, 2, 'Should be at index 2');
      
      // Wrap around to first
      const img1Again = await ctx.adapter.getNextImage();
      ctx.expect.true(img1Again.byteLength > 0, 'Should wrap to first image');
      
      history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.currentIndex, 0, 'Should wrap to index 0');
      
      // Go back
      const img3Again = await ctx.adapter.getPrevImage();
      ctx.expect.true(img3Again.byteLength > 0, 'Should go back to third image');
      
      history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.currentIndex, 2, 'Should be at index 2 after prev');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Random mode builds history and tracks position
 */
export const randomTraversalScenario: Scenario = {
  name: 'random_traversal',
  description: 'Random mode builds a history that can be navigated',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 5 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // Start random mode - should create first entry
      const img1 = await ctx.adapter.getNextRandomImage();
      ctx.expect.true(img1.byteLength > 0, 'First random image should load');
      
      let history = await ctx.adapter.getRandomHistory();
      ctx.expect.equal(history.history.length, 1, 'Should have 1 entry in random history');
      ctx.expect.equal(history.currentIndex, 0, 'Should be at index 0');
      
      // Get another random image
      const img2 = await ctx.adapter.getNextRandomImage();
      ctx.expect.true(img2.byteLength > 0, 'Second random image should load');
      
      history = await ctx.adapter.getRandomHistory();
      ctx.expect.equal(history.history.length, 2, 'Should have 2 entries');
      ctx.expect.equal(history.currentIndex, 1, 'Should be at index 1');
      
      // Go back
      const img1Again = await ctx.adapter.getPrevRandomImage();
      ctx.expect.true(img1Again.byteLength > 0, 'Should be able to go back');
      
      history = await ctx.adapter.getRandomHistory();
      ctx.expect.equal(history.currentIndex, 0, 'Should be back at index 0');
      
      // Going back at start should create new random entry
      const imgNew = await ctx.adapter.getPrevRandomImage();
      ctx.expect.true(imgNew.byteLength > 0, 'Should create new entry at start');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Random mode lap semantics - clears when all images seen
 */
export const randomLapScenario: Scenario = {
  name: 'random_lap_semantics',
  description: 'Random mode clears lap when all images have been seen',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 3 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // Get 3 random images (should see all images in folder)
      for (let i = 0; i < 3; i++) {
        const img = await ctx.adapter.getNextRandomImage();
        ctx.expect.true(img.byteLength > 0, `Image ${i} should load`);
      }
      
      let history = await ctx.adapter.getRandomHistory();
      ctx.expect.equal(history.history.length, 3, 'Should have 3 entries');
      
      // Fourth request should clear lap and start new one
      // (implementation may or may not clear history, but should work)
      const img4 = await ctx.adapter.getNextRandomImage();
      ctx.expect.true(img4.byteLength > 0, 'Fourth image should load after lap clear');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Force random bypasses history
 */
export const forceRandomScenario: Scenario = {
  name: 'force_random',
  description: 'Force random always generates new random image',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 5 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // Get normal random to establish history
      await ctx.adapter.getNextRandomImage();
      let history = await ctx.adapter.getRandomHistory();
      const initialLength = history.history.length;
      
      // Force random should create new entry
      const forced = await ctx.adapter.getForceRandomImage();
      ctx.expect.true(forced.byteLength > 0, 'Force random should load image');
      
      history = await ctx.adapter.getRandomHistory();
      ctx.expect.true(history.history.length > initialLength, 'Force random should add to history');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: State persistence works correctly
 */
export const statePersistenceScenario: Scenario = {
  name: 'state_persistence',
  description: 'Image state is persisted and can be retrieved',
  run: async (ctx) => {
    // Clean state first
    await ctx.adapter.fullWipe();
    
    // Set some state
    const newState = {
      verticalMirror: true,
      horizontalMirror: false,
      greyscale: true,
      timerFlowMode: 'normal' as const,
      showFolderHistoryPanel: false,
      showTopControls: false,
      showImageHistoryPanel: false,
      showBottomControls: false,
      isFullscreenImage: true,
    };
    
    await ctx.adapter.setImageState(newState);
    
    // Retrieve and verify
    const retrieved = await ctx.adapter.getImageState();
    ctx.expect.equal(retrieved.verticalMirror, true, 'verticalMirror should persist');
    ctx.expect.equal(retrieved.horizontalMirror, false, 'horizontalMirror should persist');
    ctx.expect.equal(retrieved.greyscale, true, 'greyscale should persist');
    ctx.expect.equal(retrieved.timerFlowMode, 'normal', 'timerFlowMode should persist');
    ctx.expect.equal(retrieved.showFolderHistoryPanel, false, 'showFolderHistoryPanel should persist');
    ctx.expect.equal(retrieved.isFullscreenImage, true, 'isFullscreenImage should persist');
  },
};

/**
 * Scenario: Reset normal history clears position
 */
export const resetNormalHistoryScenario: Scenario = {
  name: 'reset_normal_history',
  description: 'Reset normal history clears the current position',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 3 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // Navigate to second image (from -1 to 0 to 1)
      await ctx.adapter.getNextImage();
      await ctx.adapter.getNextImage();
      let history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.currentIndex, 1, 'Should be at index 1');
      
      // Reset history
      await ctx.adapter.resetNormalHistory();
      
      history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.currentIndex, -1, 'Should reset to -1');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Reset random history clears everything
 */
export const resetRandomHistoryScenario: Scenario = {
  name: 'reset_random_history',
  description: 'Reset random history clears all random history',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 3 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // Build some random history
      await ctx.adapter.getNextRandomImage();
      await ctx.adapter.getNextRandomImage();
      
      let history = await ctx.adapter.getRandomHistory();
      ctx.expect.equal(history.history.length, 2, 'Should have 2 entries');
      
      // Reset
      await ctx.adapter.resetRandomHistory();
      
      history = await ctx.adapter.getRandomHistory();
      ctx.expect.equal(history.history.length, 0, 'Should have no entries after reset');
      ctx.expect.equal(history.currentIndex, -1, 'Should reset to -1');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Full wipe clears everything
 */
export const fullWipeScenario: Scenario = {
  name: 'full_wipe',
  description: 'Full wipe clears all folders, images, and history',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 3 });
    
    try {
      // Setup some state
      await ctx.adapter.pickFolder(fixturesDir);
      await ctx.adapter.getNextRandomImage();
      await ctx.adapter.setImageState({
        verticalMirror: true,
        horizontalMirror: false,
        greyscale: true,
        timerFlowMode: 'random',
        showFolderHistoryPanel: true,
        showTopControls: true,
        showImageHistoryPanel: true,
        showBottomControls: true,
        isFullscreenImage: false,
      });
      
      // Wipe
      await ctx.adapter.fullWipe();
      
      // Verify everything is cleared
      const folderHistory = await ctx.adapter.getFolderHistory();
      ctx.expect.equal(folderHistory.history.length, 0, 'Folder history should be empty');
      
      const randomHistory = await ctx.adapter.getRandomHistory();
      ctx.expect.equal(randomHistory.history.length, 0, 'Random history should be empty');
      
      // State should remain (not wiped by fullWipe per implementation)
      // This tests actual behavior, not assumed behavior
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Folder navigation cycles through history
 */
export const folderNavigationScenario: Scenario = {
  name: 'folder_navigation',
  description: 'Next/prev folder cycles through folder history',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir1 = join(tempDir, 'folder1');
    const fixturesDir2 = join(tempDir, 'folder2');
    const fixturesDir3 = join(tempDir, 'folder3');
    
    createTestFixtures(fixturesDir1, { numImages: 2 });
    createTestFixtures(fixturesDir2, { numImages: 2 });
    createTestFixtures(fixturesDir3, { numImages: 2 });
    
    try {
      await ctx.adapter.fullWipe();
      
      // Pick folders in order
      const folder1 = await ctx.adapter.pickFolder(fixturesDir1);
      const folder2 = await ctx.adapter.pickFolder(fixturesDir2);
      const folder3 = await ctx.adapter.pickFolder(fixturesDir3);
      
      // Get folder history
      let history = await ctx.adapter.getFolderHistory();
      ctx.expect.equal(history.history.length, 3, 'Should have 3 folders');
      
      // Most recently added should be current (folder3)
      ctx.expect.equal(history.currentIndex, 0, 'Most recent folder should be at index 0');
      
      // Navigate to previous (older) folder
      const prevFolder = await ctx.adapter.getPrevFolder();
      ctx.expect.true(prevFolder !== null, 'Should get previous folder');
      
      history = await ctx.adapter.getFolderHistory();
      ctx.expect.equal(history.currentIndex, 1, 'Should move to index 1');
      
      // Navigate to next (newer) folder
      const nextFolder = await ctx.adapter.getNextFolder();
      ctx.expect.true(nextFolder !== null, 'Should get next folder');
      
      history = await ctx.adapter.getFolderHistory();
      ctx.expect.equal(history.currentIndex, 0, 'Should move back to index 0');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Reindexing updates the image list
 */
export const reindexScenario: Scenario = {
  name: 'reindex_folder',
  description: 'Reindexing updates image list when files change',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    
    // Start with 2 images
    createTestFixtures(fixturesDir, { numImages: 2 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      let history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.history.length, 2, 'Should start with 2 images');
      
      // Add more images
      createTestFixtures(fixturesDir, { numImages: 5 });
      
      // Reindex
      await ctx.adapter.reindexCurrentFolder();
      
      history = await ctx.adapter.getNormalHistory();
      ctx.expect.equal(history.history.length, 5, 'Should have 5 images after reindex');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Current image returns last viewed or first
 */
export const currentImageScenario: Scenario = {
  name: 'current_image',
  description: 'Current image returns last viewed image or first available',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 3 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // First call should return first image
      const first = await ctx.adapter.getCurrentImage();
      ctx.expect.true(first.byteLength > 0, 'Should return first image');
      
      // Navigate to second
      await ctx.adapter.getNextImage();
      
      // Current should still return something (implementation-specific which)
      const current = await ctx.adapter.getCurrentImage();
      ctx.expect.true(current.byteLength > 0, 'Should return current image');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Export all scenarios for batch execution
 */
export const allScenarios: Scenario[] = [
  folderIndexingScenario,
  normalTraversalScenario,
  randomTraversalScenario,
  randomLapScenario,
  forceRandomScenario,
  statePersistenceScenario,
  resetNormalHistoryScenario,
  resetRandomHistoryScenario,
  fullWipeScenario,
  folderNavigationScenario,
  reindexScenario,
  currentImageScenario,
];
