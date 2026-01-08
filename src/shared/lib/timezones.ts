const formatOffsetLabel = (timeZone: string, date: Date) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
    const timeZoneName = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value;
    if (timeZoneName) {
      return timeZoneName.replace('GMT', 'UTC');
    }
  } catch (error) {
    // ignore and fallback
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' });
    const timeZoneName = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value;
    if (timeZoneName) {
      return timeZoneName.replace('GMT', 'UTC');
    }
  } catch (error) {
    // ignore and fallback
  }

  return 'UTC';
};

export const formatTimeZoneLabel = (timeZone: string, date: Date = new Date()) =>
  `${timeZone} (${formatOffsetLabel(timeZone, date)})`;

export const getTimeZoneOptions = () => {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const list = supported.length ? supported : resolved ? [resolved] : [];

  return list.map((zone) => ({ value: zone, label: formatTimeZoneLabel(zone) }));
};

export const getResolvedTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
