/** A question the app is waiting for the reader to answer, with the words of its one action. */
interface ConfirmationRequest {
  message: string;
  action: string;
  resolve: (confirmed: boolean) => void;
}

/**
 * The single confirmation dialog of the app, asked from anywhere with `await confirmation.ask(…)`.
 * It replaces the browser's own `confirm()`, which looks like neither the original nor this app.
 */
class ConfirmationState {
  request = $state<ConfirmationRequest | null>(null);

  ask(message: string, action: string): Promise<boolean> {
    this.request?.resolve(false);
    return new Promise((resolve) => {
      this.request = { message, action, resolve };
    });
  }

  settle(confirmed: boolean): void {
    const request = this.request;
    this.request = null;
    request?.resolve(confirmed);
  }
}

export const confirmation = new ConfirmationState();
