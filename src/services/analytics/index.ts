import { logger } from '../logger';

// Standard analytics event names — keep these stable across the app so the same
// event isn't named differently in two places. No-op adapter for now; swap the
// `track` body for Firebase/Amplitude/PostHog later without touching call sites.

export const AnalyticsEvent = {
  AppOpen: 'app_open',
  OnboardingCompleted: 'onboarding_completed',
  LoginSuccess: 'login_success',
  Logout: 'logout',
  ScreenView: 'screen_view',
  FeatureUsed: 'feature_used',
  CheckInSuccess: 'check_in_success',
  CheckOutSuccess: 'check_out_success',
  ErrorOccurred: 'error_occurred',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

const log = logger;

export function track(event: AnalyticsEventName, params?: Record<string, unknown>) {
  // TODO: forward to a real provider.
  log.debug('analytics', event, params ?? {});
}

export function trackScreen(name: string) {
  track(AnalyticsEvent.ScreenView, { screen: name });
}
