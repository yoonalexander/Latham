import { expect, test } from "vitest";
import { companionPosition, microphoneLevel } from "../../packages/contracts/src/companion";

test("cursor companion fits negative, small and edge work areas without changing cursor coordinates", () => {
  const size = { width: 264, height: 136 }, area = { x: -1920, y: -200, width: 1920, height: 1040 };
  const cursor = { x: -1000, y: 50 };
  expect(companionPosition(cursor, area, size, true)).toEqual({ x: -976, y: 66 });
  expect(cursor).toEqual({ x: -1000, y: 50 });
  expect(companionPosition({ x: -1, y: 839 }, area, size, true)).toEqual({ x: -281, y: 691 });
  expect(companionPosition(cursor, area, size, false)).toEqual({ x: -280, y: 252 });
  expect(companionPosition({ x: 200, y: 200 }, { x: 10, y: 20, width: 100, height: 80 }, size, true)).toEqual({ x: 10, y: 20 });
});
test("microphone animation uses measured energy with silent dots and bounded loud bars", () => {
  expect(microphoneLevel(new Float32Array(2048))).toBe(0);
  expect(microphoneLevel(new Float32Array(2048).fill(0.005))).toBe(0);
  expect(microphoneLevel(new Float32Array(2048).fill(0.025))).toBeCloseTo(0.2);
  expect(microphoneLevel(new Float32Array(2048).fill(1))).toBe(1);
  expect(microphoneLevel(new Float32Array())).toBe(0);
  expect(microphoneLevel(new Float32Array([NaN]))).toBe(0);
});
