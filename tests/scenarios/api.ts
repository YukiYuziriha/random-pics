/**
 * API Integration Tests
 * 
 * Tests HTTP endpoints directly to verify the contract between
 * frontend and backend. These are more granular than domain scenarios
 * and verify specific endpoint behavior.
 */

import type { Scenario } from '../types.ts';
import { createTestFixtures, cleanupTestFixtures } from '../fixtures/images.ts';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'random-pics-test-'));
}

/**
 * Scenario: API returns proper error for missing folder
 */
export const apiErrorHandlingScenario: Scenario = {
  name: 'api_error_handling',
  description: 'API returns appropriate errors for invalid operations',
  run: async (ctx) => {
    // Try to get current image without selecting folder first
    await ctx.expect.throws(
      async () => await ctx.adapter.getCurrentImage(),
      'Should throw when no folder selected'
    );
  },
};

/**
 * Scenario: Image endpoints return valid image data
 */
export const apiImageDataScenario: Scenario = {
  name: 'api_image_data',
  description: 'Image endpoints return valid binary image data',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 1 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // Get image data
      const image = await ctx.adapter.getCurrentImage();
      
      // Verify it's not empty
      ctx.expect.true(image.byteLength > 0, 'Image should have content');
      
      // Verify JPEG magic bytes if it's a JPEG
      const bytes = new Uint8Array(image.slice(0, 4));
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      
      ctx.expect.true(isJpeg || isPng, 'Should return valid image format (JPEG or PNG)');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: History endpoints return proper structure
 */
export const apiHistoryStructureScenario: Scenario = {
  name: 'api_history_structure',
  description: 'History endpoints return properly structured data',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 3 });
    
    try {
      await ctx.adapter.fullWipe();
      await ctx.adapter.pickFolder(fixturesDir);
      
      // Check normal history structure
      const normalHistory = await ctx.adapter.getNormalHistory();
      ctx.expect.true(Array.isArray(normalHistory.history), 'Normal history should be array');
      ctx.expect.true(typeof normalHistory.currentIndex === 'number', 'Current index should be number');
      
      // Check random history structure
      const randomHistory = await ctx.adapter.getRandomHistory();
      ctx.expect.true(Array.isArray(randomHistory.history), 'Random history should be array');
      ctx.expect.true(typeof randomHistory.currentIndex === 'number', 'Current index should be number');
      
      // Check folder history structure
      const folderHistory = await ctx.adapter.getFolderHistory();
      ctx.expect.true(Array.isArray(folderHistory.history), 'Folder history should be array');
      ctx.expect.true(typeof folderHistory.currentIndex === 'number', 'Current index should be number');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: State endpoint handles all fields
 */
export const apiStateFieldsScenario: Scenario = {
  name: 'api_state_fields',
  description: 'State endpoint correctly handles all state fields',
  run: async (ctx) => {
    // Test each state field independently
    const testCases: Array<{ field: keyof import('../types.ts').ImageState; value: unknown; expected: unknown }> = [
      { field: 'verticalMirror', value: true, expected: true },
      { field: 'horizontalMirror', value: true, expected: true },
      { field: 'greyscale', value: true, expected: true },
      { field: 'timerFlowMode', value: 'normal', expected: 'normal' },
      { field: 'showFolderHistoryPanel', value: false, expected: false },
      { field: 'showTopControls', value: false, expected: false },
      { field: 'showImageHistoryPanel', value: false, expected: false },
      { field: 'showBottomControls', value: false, expected: false },
      { field: 'isFullscreenImage', value: true, expected: true },
    ];
    
    // Get default state
    const defaultState = await ctx.adapter.getImageState();
    
    for (const testCase of testCases) {
      // Set specific field
      const newState = { ...defaultState, [testCase.field]: testCase.value };
      await ctx.adapter.setImageState(newState);
      
      // Verify it persisted
      const retrieved = await ctx.adapter.getImageState();
      const actual = retrieved[testCase.field];
      ctx.expect.equal(actual, testCase.expected, `Field ${testCase.field} should persist correctly`);
    }
  },
};

/**
 * Scenario: Folder operations return complete info
 */
export const apiFolderInfoScenario: Scenario = {
  name: 'api_folder_info',
  description: 'Folder operations return complete folder information',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const fixturesDir = join(tempDir, 'fixtures');
    createTestFixtures(fixturesDir, { numImages: 2 });
    
    try {
      await ctx.adapter.fullWipe();
      
      // Pick folder and verify response
      const folder = await ctx.adapter.pickFolder(fixturesDir);
      ctx.expect.true(typeof folder.id === 'number', 'Folder should have numeric ID');
      ctx.expect.true(folder.id > 0, 'Folder ID should be positive');
      ctx.expect.equal(folder.path, fixturesDir, 'Folder path should match input');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Scenario: Multiple folders create proper history
 */
export const apiMultiFolderScenario: Scenario = {
  name: 'api_multi_folder',
  description: 'Multiple folders are tracked in chronological order',
  run: async (ctx) => {
    const tempDir = createTempDir();
    const folder1 = join(tempDir, 'folder1');
    const folder2 = join(tempDir, 'folder2');
    const folder3 = join(tempDir, 'folder3');
    
    createTestFixtures(folder1, { numImages: 1 });
    createTestFixtures(folder2, { numImages: 1 });
    createTestFixtures(folder3, { numImages: 1 });
    
    try {
      await ctx.adapter.fullWipe();
      
      // Pick folders in order
      await ctx.adapter.pickFolder(folder1);
      await ctx.adapter.pickFolder(folder2);
      await ctx.adapter.pickFolder(folder3);
      
      // Verify history
      const history = await ctx.adapter.getFolderHistory();
      ctx.expect.equal(history.history.length, 3, 'Should have 3 folders');
      
      // Most recent should be first
      ctx.expect.equal(history.history[0], folder3, 'Most recent folder should be first');
      ctx.expect.equal(history.history[1], folder2, 'Second folder should be second');
      ctx.expect.equal(history.history[2], folder1, 'First folder should be last');
      
    } finally {
      cleanupTestFixtures(tempDir);
    }
  },
};

/**
 * Export all API integration scenarios
 */
export const apiScenarios: Scenario[] = [
  apiErrorHandlingScenario,
  apiImageDataScenario,
  apiHistoryStructureScenario,
  apiStateFieldsScenario,
  apiFolderInfoScenario,
  apiMultiFolderScenario,
];
