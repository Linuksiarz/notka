import { Capacitor, registerPlugin } from '@capacitor/core';

/** The native side of Android's app (`apk/.../InstancePlugin.kt`): which Notka server it opens. */
interface InstancePlugin {
  forget(): Promise<void>;
}

const instance = registerPlugin<InstancePlugin>('Instance');

/** Whether this page is running inside Android's app rather than in a browser. */
export const inAndroidApp = Capacitor.getPlatform() === 'android';

/** Forgets this server; the app restarts on its own page, which asks for another one. */
export function changeServer(): Promise<void> {
  return instance.forget();
}
