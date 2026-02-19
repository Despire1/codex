export interface HomeworkTemplateCreateTopbarState {
  submitting: boolean;
  hasValidationErrors: boolean;
  draftSavedAtLabel: string | null;
}

type TopbarCommand = 'save' | 'submit';

const TOPBAR_STATE_EVENT = 'homework-template-create-topbar-state';
const TOPBAR_SAVE_EVENT = 'homework-template-create-command-save';
const TOPBAR_SUBMIT_EVENT = 'homework-template-create-command-submit';

const getWindow = () => (typeof window === 'undefined' ? null : window);

export const publishHomeworkTemplateCreateTopbarState = (state: HomeworkTemplateCreateTopbarState) => {
  const host = getWindow();
  if (!host) return;
  host.dispatchEvent(new CustomEvent(TOPBAR_STATE_EVENT, { detail: state }));
};

export const clearHomeworkTemplateCreateTopbarState = () => {
  const host = getWindow();
  if (!host) return;
  host.dispatchEvent(
    new CustomEvent(TOPBAR_STATE_EVENT, {
      detail: {
        submitting: false,
        hasValidationErrors: false,
        draftSavedAtLabel: null,
      } as HomeworkTemplateCreateTopbarState,
    }),
  );
};

export const subscribeHomeworkTemplateCreateTopbarState = (
  listener: (state: HomeworkTemplateCreateTopbarState) => void,
) => {
  const host = getWindow();
  if (!host) return () => undefined;

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<HomeworkTemplateCreateTopbarState>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  host.addEventListener(TOPBAR_STATE_EVENT, handler as EventListener);
  return () => host.removeEventListener(TOPBAR_STATE_EVENT, handler as EventListener);
};

export const dispatchHomeworkTemplateCreateTopbarCommand = (command: TopbarCommand) => {
  const host = getWindow();
  if (!host) return;
  if (command === 'save') {
    host.dispatchEvent(new CustomEvent(TOPBAR_SAVE_EVENT));
    return;
  }
  host.dispatchEvent(new CustomEvent(TOPBAR_SUBMIT_EVENT));
};

export const subscribeHomeworkTemplateCreateTopbarCommand = (
  command: TopbarCommand,
  listener: () => void,
) => {
  const host = getWindow();
  if (!host) return () => undefined;

  const eventName = command === 'save' ? TOPBAR_SAVE_EVENT : TOPBAR_SUBMIT_EVENT;
  host.addEventListener(eventName, listener as EventListener);
  return () => host.removeEventListener(eventName, listener as EventListener);
};
