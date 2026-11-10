// Rules for the "install this app" prompt. Pure functions so they can be tested.

/** iPhone, iPad or iPod, including iPadOS which reports itself as a Mac with a touch screen. */
export function isIos(userAgent: string, platform = "", maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/** Already running as an installed app (home-screen launch), so no prompt is needed. */
export function isStandalone(displayModeStandalone: boolean, navigatorStandalone?: boolean): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

export type InstallPrompt = "native" | "ios-hint" | null;

/**
 * What to show:
 *  - "native": the browser offered an install prompt (Android Chrome, desktop Chrome/Edge) -> show an Install button.
 *  - "ios-hint": iOS has no install prompt, so show how to add it from the Share menu.
 *  - null: nothing (already installed, dismissed, or not installable).
 */
export function installPrompt(opts: {
  standalone: boolean;
  dismissed: boolean;
  hasNativePrompt: boolean;
  ios: boolean;
}): InstallPrompt {
  if (opts.standalone || opts.dismissed) return null;
  if (opts.hasNativePrompt) return "native";
  if (opts.ios) return "ios-hint";
  return null;
}
