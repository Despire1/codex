import { useCallback } from 'react';
import { useLocale } from './LocaleContext';
import { messages, type Locale, type MessageKey } from './messages';

export type TParams = Record<string, string | number>;

const FALLBACK_LOCALE: Locale = 'ru';

const interpolate = (template: string, params?: TParams) => {
  if (!params) return template;
  return Object.entries(params).reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)), template);
};

const resolveMessage = (locale: Locale, key: MessageKey): string => {
  const direct = messages[locale][key as keyof (typeof messages)[typeof locale]];
  if (typeof direct === 'string') return direct;
  return messages[FALLBACK_LOCALE][key];
};

export const useT = () => {
  const { locale } = useLocale();
  return useCallback((key: MessageKey, params?: TParams) => interpolate(resolveMessage(locale, key), params), [locale]);
};
