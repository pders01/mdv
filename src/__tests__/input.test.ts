/**
 * Input handling tests
 */

import { describe, test, expect } from "bun:test";
import { createVisualMode, VisualMode } from "../input/visual.js";

describe("VisualMode", () => {
  const sampleLines = [
    "Line 1",
    "Line 2",
    "Line 3",
    "Line 4",
    "Line 5",
  ];

  test("starts in normal mode", () => {
    let updateCalled = false;
    const vm = createVisualMode(sampleLines, () => { updateCalled = true; });

    expect(vm.mode).toBe("normal");
  });

  test("enters visual mode", () => {
    let updateCount = 0;
    const vm = createVisualMode(sampleLines, () => { updateCount++; });

    vm.enter(0);

    expect(vm.mode).toBe("visual");
    expect(vm.visualStart).toBe(0);
    expect(vm.visualEnd).toBe(0);
    expect(updateCount).toBe(1);
  });

  test("exits visual mode", () => {
    let updateCount = 0;
    const vm = createVisualMode(sampleLines, () => { updateCount++; });

    vm.enter(2);
    vm.exit();

    expect(vm.mode).toBe("normal");
    expect(updateCount).toBe(2); // enter + exit
  });

  test("moves visual end down", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(0);
    vm.moveDown(2);

    expect(vm.visualEnd).toBe(2);
  });

  test("moves visual end up", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(3);
    vm.moveUp(2);

    expect(vm.visualEnd).toBe(1);
  });

  test("clamps moveDown to last line", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(3);
    vm.moveDown(100);

    expect(vm.visualEnd).toBe(4); // Last line (0-indexed)
  });

  test("clamps moveUp to first line", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(2);
    vm.moveUp(100);

    expect(vm.visualEnd).toBe(0);
  });

  test("moveToStart sets visualEnd to 0", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(3);
    vm.moveToStart();

    expect(vm.visualEnd).toBe(0);
  });

  test("moveToEnd sets visualEnd to last line", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(1);
    vm.moveToEnd();

    expect(vm.visualEnd).toBe(4);
  });

  test("getSelectedContent returns correct lines", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(1);
    vm.visualEnd = 3;

    const content = vm.getSelectedContent();
    expect(content).toBe("Line 2\nLine 3\nLine 4");
  });

  test("getSelectedContent works with reversed selection", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(3);
    vm.visualEnd = 1;

    const content = vm.getSelectedContent();
    expect(content).toBe("Line 2\nLine 3\nLine 4");
  });

  test("getSelectedLineCount returns correct count", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(0);
    vm.visualEnd = 2;

    expect(vm.getSelectedLineCount()).toBe(3);
  });

  test("getSelectedLineCount works with single line", () => {
    const vm = createVisualMode(sampleLines, () => {});

    vm.enter(2);

    expect(vm.getSelectedLineCount()).toBe(1);
  });

  test("move operations only work in visual mode", () => {
    const vm = createVisualMode(sampleLines, () => {});

    // In normal mode, moves should not update visualEnd
    vm.moveDown(2);
    vm.moveUp(1);

    // visualEnd should still be 0 (initial value)
    expect(vm.visualEnd).toBe(0);
  });

  test("visualEnd setter calls update callback", () => {
    let updateCount = 0;
    const vm = createVisualMode(sampleLines, () => { updateCount++; });

    vm.enter(0);
    updateCount = 0; // Reset after enter

    vm.visualEnd = 3;

    expect(updateCount).toBe(1);
  });
});

describe("createVisualMode factory", () => {
  test("returns VisualMode instance", () => {
    const vm = createVisualMode(["a", "b", "c"], () => {});
    expect(vm).toBeInstanceOf(VisualMode);
  });

  test("handles empty content", () => {
    const vm = createVisualMode([], () => {});
    expect(vm.mode).toBe("normal");
  });
});
