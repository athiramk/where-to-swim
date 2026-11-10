import { describe, expect, it } from "vitest";
import { installPrompt, isIos, isStandalone } from "./install.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

describe("isIos", () => {
  it("detects iPhone and iPad user agents", () => {
    expect(isIos(IPHONE)).toBe(true);
    expect(isIos("Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)")).toBe(true);
  });
  it("detects iPadOS posing as a Mac, but not a real Mac or Android", () => {
    expect(isIos(MAC, "MacIntel", 5)).toBe(true);
    expect(isIos(MAC, "MacIntel", 0)).toBe(false);
    expect(isIos(ANDROID, "Linux armv8l", 5)).toBe(false);
  });
});

describe("isStandalone", () => {
  it("is true for display-mode standalone or iOS navigator.standalone", () => {
    expect(isStandalone(true)).toBe(true);
    expect(isStandalone(false, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
    expect(isStandalone(false)).toBe(false);
  });
});

describe("installPrompt", () => {
  const base = { standalone: false, dismissed: false, hasNativePrompt: false, ios: false };
  it("offers the native Install button when the browser provides a prompt", () => {
    expect(installPrompt({ ...base, hasNativePrompt: true })).toBe("native");
  });
  it("shows the Share-menu hint on iOS", () => {
    expect(installPrompt({ ...base, ios: true })).toBe("ios-hint");
  });
  it("shows nothing when already installed or dismissed", () => {
    expect(installPrompt({ ...base, hasNativePrompt: true, standalone: true })).toBeNull();
    expect(installPrompt({ ...base, ios: true, dismissed: true })).toBeNull();
  });
  it("shows nothing on browsers that can't install", () => {
    expect(installPrompt(base)).toBeNull();
  });
});
