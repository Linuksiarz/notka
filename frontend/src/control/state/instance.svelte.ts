import { DEFAULT_INSTANCE_INFO, fetchInstanceInfo, type InstanceInfo } from '../api/health';

/**
 * The instance the app is talking to, as opposed to the person using it: whether it is a demo,
 * whether it takes sign-ups, and how long its trash keeps notes.
 */
class InstanceState {
  info = $state<InstanceInfo>(DEFAULT_INSTANCE_INFO);

  /**
   * A failure here must not keep anybody out of the app: an instance whose health endpoint is
   * unreachable is simply not treated as a demo.
   */
  async load(): Promise<void> {
    try {
      this.info = await fetchInstanceInfo();
    } catch {
      this.info = DEFAULT_INSTANCE_INFO;
    }
  }
}

export const instance = new InstanceState();
