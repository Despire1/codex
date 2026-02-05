export type AnalyticsPayload = Record<string, unknown>;

export const trackEvent = (name: string, payload: AnalyticsPayload = {}) => {
  if (typeof window === 'undefined') return;
  const data = { ...payload, timestamp: new Date().toISOString() };
  const win = window as unknown as {
    analytics?: { track?: (eventName: string, eventPayload?: AnalyticsPayload) => void };
    gtag?: (...args: any[]) => void;
    dataLayer?: Array<Record<string, unknown>>;
  };

  if (win.analytics?.track) {
    win.analytics.track(name, data);
    return;
  }

  if (typeof win.gtag === 'function') {
    win.gtag('event', name, data);
    return;
  }

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: name, ...data });
  }
};
