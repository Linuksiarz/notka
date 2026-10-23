import { systemFontScale } from './androidApp';

/**
 * The reader's own text size, where the platform does not apply it to the page by itself. The app's
 * type is `rem` and `em` (the platform's sp) and its boxes `px` (dp), so scaling the root's size scales
 * the type and everything measured from it together — a list's checkbox stays level with its words.
 *
 * - **iOS** (Safari, and a PWA added to the home screen with it) keeps the root at 16px whatever
 *   Dynamic Type says. The one place WebKit exposes the setting is the system font
 *   `-apple-system-body` (17pt at the default size), which CSS can set but not divide by.
 * - **Android's app** asks the system through `TextScalePlugin`: the WebView's own `textZoom` enlarges
 *   the text alone, after the layout's lengths are fixed, which is what put the text off its checkboxes.
 * - Android's browser scales the whole page by the system's setting itself.
 */
const DEFAULT_BODY_SIZE = 17;

function setRootScale(scale: number): void {
  if (scale > 0) document.documentElement.style.fontSize = `${scale * 100}%`;
}

export function followSystemTextSize(): void {
  if (CSS.supports('font', '-apple-system-body')) {
    const probe = document.createElement('span');
    probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden';
    const apply = () => {
      document.body.append(probe);
      setRootScale(Number.parseFloat(getComputedStyle(probe).fontSize) / DEFAULT_BODY_SIZE);
      probe.remove();
    };
    apply();
    // Dynamic Type is changed in the Settings app, so the page learns about it when it is shown again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') apply();
    });
    return;
  }
  // Android recreates the activity when the font size changes, so reading it once is enough.
  void systemFontScale().then((scale) => {
    if (scale !== null) setRootScale(scale);
  });
}
