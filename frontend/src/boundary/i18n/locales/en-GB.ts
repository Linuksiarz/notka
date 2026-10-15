import type { Messages } from './en-US';
import { enUS } from './en-US';

/**
 * British English.
 *
 * Same wording as American English apart from spelling conventions; date and number formatting
 * differences come from `Intl` using the `en-GB` locale rather than from this catalogue.
 */
export const enGB: Messages = {
  ...enUS,
  'card.changeColor': 'Change colour',
  'search.colors': 'Colours',
  'auth.licenseNotice': 'Notka is free software under the AGPL-3.0 licence.',
  'settings.aboutText':
    'Notka is a free, open-source, self-hosted notes app. It is an independent project and is not affiliated with, endorsed by, or connected to Google. Licensed under the AGPL-3.0 licence.',
  'editor.sharedViewOnly': '{name} shared this note with you for viewing only',
  'share.empty':
    'Nobody else can see this note yet. Everyone you share with sees the same colour and background, and anyone with can edit access can change them for everyone.',
  'appearance.colour': 'Colour',
};
