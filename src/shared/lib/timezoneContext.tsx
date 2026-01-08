import { PropsWithChildren, createContext, useContext } from 'react';
import { resolveTimeZone } from './timezoneDates';

const TimeZoneContext = createContext<string>('UTC');

export const TimeZoneProvider = ({ timeZone, children }: PropsWithChildren<{ timeZone?: string | null }>) => (
  <TimeZoneContext.Provider value={resolveTimeZone(timeZone)}>{children}</TimeZoneContext.Provider>
);

export const useTimeZone = () => useContext(TimeZoneContext);
