import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';

/** The native side of Android's app (`apk/.../InstancePlugin.kt`): which Notka server it opens. */
interface InstancePlugin {
  forget(): Promise<void>;
}

const instance = registerPlugin<InstancePlugin>('Instance');

/** The native side's `TextScalePlugin.kt`: the system's font scale, 1 at the default size. */
interface TextScalePlugin {
  fontScale(): Promise<{ scale: number }>;
}

const textScale = registerPlugin<TextScalePlugin>('TextScale');

/** Whether this page is running inside Android's app rather than in a browser. */
export const inAndroidApp = Capacitor.getPlatform() === 'android';

/**
 * Opens a page in a Custom Tab: the browser itself with its passkeys and its signed-in provider, which a
 * WebView has neither of, over this app.
 */
export function openInCustomTab(url: string): Promise<void> {
  return Browser.open({ url });
}

/** Forgets this server; the app restarts on its own page, which asks for another one. */
export function changeServer(): Promise<void> {
  return instance.forget();
}

/** The system's font scale in Android's app, or `null` in a browser (which applies it itself). */
export async function systemFontScale(): Promise<number | null> {
  if (!inAndroidApp) return null;
  try {
    return (await textScale.fontScale()).scale;
  } catch {
    // An app built before the plugin existed: leave the type at the page's own size.
    return null;
  }
}
