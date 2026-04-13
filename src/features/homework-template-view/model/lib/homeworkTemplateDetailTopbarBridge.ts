export type HomeworkTemplateDetailTopbarTone = 'active' | 'draft' | 'archived';

export interface HomeworkTemplateDetailTopbarState {
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: HomeworkTemplateDetailTopbarTone;
  hasAttentionDot: boolean;
}

const TOPBAR_STATE_EVENT = 'homework-template-detail-topbar-state';

const getWindow = () => (typeof window === 'undefined' ? null : window);

export const publishHomeworkTemplateDetailTopbarState = (state: HomeworkTemplateDetailTopbarState) => {
  const host = getWindow();
  if (!host) return;
  host.dispatchEvent(new CustomEvent(TOPBAR_STATE_EVENT, { detail: state }));
};

export const clearHomeworkTemplateDetailTopbarState = () => {
  const host = getWindow();
  if (!host) return;
  host.dispatchEvent(new CustomEvent(TOPBAR_STATE_EVENT, { detail: null }));
};

export const subscribeHomeworkTemplateDetailTopbarState = (
  listener: (state: HomeworkTemplateDetailTopbarState | null) => void,
) => {
  const host = getWindow();
  if (!host) return () => undefined;

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<HomeworkTemplateDetailTopbarState | null>;
    listener(customEvent.detail ?? null);
  };

  host.addEventListener(TOPBAR_STATE_EVENT, handler as EventListener);
  return () => host.removeEventListener(TOPBAR_STATE_EVENT, handler as EventListener);
};
