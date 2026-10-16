/**
 * Keeps a form's submission inside the page. A password manager or a browser's autofill (Samsung
 * Pass in Samsung Internet) may finish by calling `form.submit()`, which skips the `submit` event
 * our handler listens to and navigates natively — to the same address, so the sign-in screen simply
 * reloads empty. `requestSubmit()` fires the event, and validates, as a person pressing the button.
 */
export function submitInPage(form: HTMLFormElement): void {
  form.submit = () => form.requestSubmit();
}
