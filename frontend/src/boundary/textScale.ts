/**
 * The reader's own text size on iOS. The app's type is `rem` (the platform's sp) and its boxes `px`
 * (dp), so text follows the reader's setting the way Keep's does — but Safari, and a PWA added to the
 * home screen with it, keeps the root at 16px whatever Dynamic Type says. The one place WebKit exposes
 * that setting is the system font `-apple-system-body` (17pt at the default size), which CSS can set
 * but not divide by, so the root's size is set here from it: 100% at the default, and the same ratio
 * as the reader's setting otherwise. Android's browser and the APK (`textZoom`) scale text themselves.
 */
const DEFAULT_BODY_SIZE = 17;

export function followSystemTextSize(): void {
  if (!CSS.supports('font', '-apple-system-body')) return;
  const probe = document.createElement('span');
  probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden';
  const apply = () => {
    document.body.append(probe);
    const size = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    if (size > 0) document.documentElement.style.fontSize = `${(size / DEFAULT_BODY_SIZE) * 100}%`;
  };
  apply();
  // Dynamic Type is changed in the Settings app, so the page learns about it when it is shown again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply();
  });
}
