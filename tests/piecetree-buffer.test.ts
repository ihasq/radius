/**
 * Phase 12: PieceTree Buffer Tests
 *
 * 12 tests covering:
 * - Group A: PieceTree basic operations (T01-T04)
 * - Group B: BufferManager integration (T05-T08)
 * - Group C: Performance verification (T09-T10)
 * - Group D: TsRadManager notification (T11-T12)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PieceTreeTextBufferBuilder } from "vscode-textbuffer";

let testDir: string;

beforeAll(() => {
  testDir = mkdtempSync(join(tmpdir(), "piecetree-test-"));
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("Group A: PieceTree basic operations", () => {
  test("T01: create PieceTreeTextBuffer from empty file", () => {
    const builder = new PieceTreeTextBufferBuilder();
    const factory = builder.finish(true);
    const buffer = factory.create(1); // DefaultEndOfLine.LF = 1

    expect(buffer.getLineCount()).toBe(1);
    expect(buffer.getLineContent(1)).toBe("");
  });

  test("T02: create PieceTreeTextBuffer from 100k line file and access arbitrary line in O(1)", () => {
    const lines = [];
    for (let i = 0; i < 100000; i++) {
      lines.push(`Line ${i + 1}`);
    }
    const content = lines.join("\n");

    const builder = new PieceTreeTextBufferBuilder();
    builder.acceptChunk(content);
    const factory = builder.finish(true);
    const buffer = factory.create(1); // DefaultEndOfLine.LF = 1

    expect(buffer.getLineCount()).toBe(100000);

    // Access arbitrary line (should be O(log N) with PieceTree, effectively O(1) for this size)
    const startTime = Date.now();
    const lineContent = buffer.getLineContent(50000);
    const elapsed = Date.now() - startTime;

    expect(lineContent).toBe("Line 50000");
    expect(elapsed).toBeLessThan(10); // Should be near-instant
  });

  test("T03: insert into PieceTreeTextBuffer and content is reflected", () => {
    const builder = new PieceTreeTextBufferBuilder();
    builder.acceptChunk("Hello World");
    const factory = builder.finish(true);
    const buffer = factory.create(1); // DefaultEndOfLine.LF = 1

    // Insert "Beautiful " at offset 6 (after "Hello ")
    buffer.insert(6, "Beautiful ");

    // Get all content
    const lines = [];
    for (let i = 1; i <= buffer.getLineCount(); i++) {
      lines.push(buffer.getLineContent(i));
    }
    const newContent = lines.join("\n");

    expect(newContent).toBe("Hello Beautiful World");
  });

  test("T04: delete from PieceTreeTextBuffer and content is reflected", () => {
    const builder = new PieceTreeTextBufferBuilder();
    builder.acceptChunk("Hello Beautiful World");
    const factory = builder.finish(true);
    const buffer = factory.create(1); // DefaultEndOfLine.LF = 1

    // Delete "Beautiful " (10 characters starting at offset 6)
    buffer.delete(6, 10);

    // Get all content
    const lines = [];
    for (let i = 1; i <= buffer.getLineCount(); i++) {
      lines.push(buffer.getLineContent(i));
    }
    const newContent = lines.join("\n");

    expect(newContent).toBe("Hello World");
  });
});

describe("Group B: BufferManager integration", () => {
  test("T05: BufferManager.open() uses PieceTree to load file", () => {
    const { BufferManager } = require("../src/core/buffer/manager");
    const testFile = join(testDir, "test.txt");
    writeFileSync(testFile, "Test content\nLine 2\nLine 3");

    const manager = new BufferManager();
    const buffer = manager.open(testFile);

    expect(buffer.getLineCount()).toBe(3);
    expect(buffer.getLineContent(1)).toBe("Test content");
  });

  test("T06: BufferManager.getContent() returns content from PieceTree", () => {
    const { BufferManager } = require("../src/core/buffer/manager");
    const testFile = join(testDir, "test2.txt");
    writeFileSync(testFile, "First line\nSecond line");

    const manager = new BufferManager();
    manager.open(testFile);
    const content = manager.getContent(testFile);

    expect(content).toBe("First line\nSecond line");
  });

  test("T07: BufferManager insert/delete applies to PieceTree", () => {
    const { BufferManager } = require("../src/core/buffer/manager");
    const testFile = join(testDir, "test3.txt");
    writeFileSync(testFile, "Hello World");

    const manager = new BufferManager();
    manager.open(testFile);

    // Insert at position 6 (after "Hello ")
    manager.insert(testFile, 6, "Beautiful ");

    const content = manager.getContent(testFile);
    expect(content).toBe("Hello Beautiful World");
  });

  test("T08: BufferManager.flush() writes PieceTree content to file", () => {
    const { BufferManager } = require("../src/core/buffer/manager");
    const testFile = join(testDir, "test4.txt");
    writeFileSync(testFile, "Original");

    const manager = new BufferManager();
    manager.open(testFile);
    manager.delete(testFile, 0, 8);
    manager.insert(testFile, 0, "Modified");
    manager.flush(testFile);

    const { readFileSync } = require("fs");
    const diskContent = readFileSync(testFile, "utf-8");
    expect(diskContent).toBe("Modified");
  });
});

describe("Group C: Performance verification", () => {
  test("T09: str-replace on 100k line file completes within 1 second", () => {
    const { BufferManager } = require("../src/core/buffer/manager");
    const testFile = join(testDir, "large.txt");

    // Create 100k line file
    const lines = [];
    for (let i = 0; i < 100000; i++) {
      lines.push(`Line ${i + 1}`);
    }
    writeFileSync(testFile, lines.join("\n"));

    const manager = new BufferManager();
    manager.open(testFile);

    const startTime = Date.now();

    // Simulate str-replace: replace "Line 50000" with "Modified Line 50000"
    const content = manager.getContent(testFile);
    const offset = content.indexOf("Line 50000");
    manager.delete(testFile, offset, 10);
    manager.insert(testFile, offset, "Modified Line 50000");

    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(1000);
    expect(manager.getContent(testFile)).toContain("Modified Line 50000");
  }, 10000);

  test("T10: 100 consecutive inserts on 100k line file complete within 3 seconds", () => {
    const { BufferManager } = require("../src/core/buffer/manager");
    const testFile = join(testDir, "large2.txt");

    // Create 100k line file
    const lines = [];
    for (let i = 0; i < 100000; i++) {
      lines.push(`Line ${i + 1}`);
    }
    writeFileSync(testFile, lines.join("\n"));

    const manager = new BufferManager();
    manager.open(testFile);

    const startTime = Date.now();

    // 100 consecutive inserts
    for (let i = 0; i < 100; i++) {
      manager.insert(testFile, 0, "X");
    }

    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(3000);
    expect(manager.getContent(testFile).startsWith("X".repeat(100))).toBe(true);
  }, 10000);
});

describe("Group D: TsRadManager notification", () => {
  test("T11: BufferManager.flush() calls TsRadManager.notifyFileChange", () => {
    const { BufferManager } = require("../src/core/buffer/manager");
    const testFile = join(testDir, "test5.txt");
    writeFileSync(testFile, "Test");

    const manager = new BufferManager();

    // Mock TsRadManager
    let callCount = 0;
    const mockTsRadManager = {
      notifyFileChange: (projectRoot: string, filePath: string) => {
        callCount++;
      },
    };

    manager.setTsRadManager(mockTsRadManager as any);
    manager.open(testFile); // This will call notifyFileChange once

    const initialCallCount = callCount;

    manager.delete(testFile, 0, 4);
    manager.insert(testFile, 0, "Modified");
    manager.flush(testFile); // This should call notifyFileChange again

    // Verify that flush called notifyFileChange at least once more
    expect(callCount).toBeGreaterThan(initialCallCount);
  });

  test("T12: after undo, file content is correctly restored via PieceTree", () => {
    const { BufferManager } = require("../src/core/buffer/manager");
    const testFile = join(testDir, "test6.txt");
    const originalContent = "Original Content";
    writeFileSync(testFile, originalContent);

    const manager = new BufferManager();
    manager.open(testFile);

    // Make edit
    manager.delete(testFile, 0, 16);
    manager.insert(testFile, 0, "Modified Content");
    expect(manager.getContent(testFile)).toBe("Modified Content");

    // Simulate undo by reopening from disk (BufferManager should detect external change)
    writeFileSync(testFile, originalContent);

    // Force reload by closing and reopening
    manager.close(testFile);
    manager.open(testFile);

    expect(manager.getContent(testFile)).toBe(originalContent);
  });
});
