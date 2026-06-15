import * as Updates from 'expo-updates';
import { createLogger } from '../logger';

const log = createLogger('app-update');

/**
 * Check for an OTA update and reload if one is available. Safe to call at boot;
 * no-ops in dev / Expo Go where Updates is disabled.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
      return true;
    }
  } catch (e) {
    log.warn('update check failed', e);
  }
  return false;
}
