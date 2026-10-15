import { adminApi } from '../api/admin';
import type { AccountsResponse, ServerSettings } from '../../entity/api/types';
import { backgroundThemes } from './backgroundThemes.svelte';
import { instance } from './instance.svelte';

/**
 * The administrator's server settings: whether sign-up is open, the instance's default theme, and
 * the accounts with what each of them stores. Loaded when the dialog opens, never for anybody else.
 */
class ServerAdminState {
  settings = $state<ServerSettings | null>(null);
  accounts = $state<AccountsResponse | null>(null);

  /** Both halves together: a dialog that has the settings but not the accounts is half a dialog. */
  async load(): Promise<void> {
    const [settings, accounts] = await Promise.all([adminApi.settings(), adminApi.accounts()]);
    this.settings = settings;
    this.accounts = accounts;
  }

  async setRegistrationOpen(open: boolean): Promise<void> {
    this.settings = await adminApi.updateSettings({ registrationOpen: open });
    // The sign-in screen asks `/api/health`; keep this tab's copy of the answer in step.
    void instance.load();
  }

  async setDefaultTheme(id: string): Promise<void> {
    this.settings = await adminApi.updateSettings({ defaultThemeId: id });
    await backgroundThemes.load();
  }

  /** Uploads a theme and returns its name; removing or replacing one can move the default. */
  async uploadTheme(archive: Blob): Promise<string> {
    const theme = await backgroundThemes.upload(archive);
    this.settings = await adminApi.settings();
    return theme.name;
  }

  async removeTheme(id: string): Promise<void> {
    await backgroundThemes.remove(id);
    this.settings = await adminApi.settings();
  }

  async resetPassword(userId: number): Promise<void> {
    await adminApi.resetPassword(userId);
    this.accounts = await adminApi.accounts();
  }

  async removeAccount(userId: number): Promise<void> {
    await adminApi.removeAccount(userId);
    this.accounts = await adminApi.accounts();
  }

  reset(): void {
    this.settings = null;
    this.accounts = null;
  }
}

export const serverAdmin = new ServerAdminState();
