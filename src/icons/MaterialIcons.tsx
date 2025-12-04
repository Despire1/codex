import { SVGProps } from 'react';

// Minimal inline Material Design icons to avoid external downloads in sandboxed envs.
// Paths taken from the official Material icon set used by MUI's icon package.
export const DashboardIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
  </svg>
);

export const PeopleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h6v-3.5C23 14.17 18.33 13 16 13z" />
  </svg>
);

export const EventNoteIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M17 10H7v2h10v-2zm0 4H7v2h10v-2zm2-12h-1V1h-2v1H8V1H6v1H5c-1.1 0-1.99.9-1.99 2L3 21c0 1.1.89 2 1.99 2H19c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 19H5V8h14v13z" />
  </svg>
);

export const SettingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .11-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.007 7.007 0 0 0-1.63-.94l-.36-2.54A.488.488 0 0 0 14 2h-4a.5.5 0 0 0-.49.42l-.37 2.54c-.6.23-1.16.53-1.68.89l-2.4-.96a.5.5 0 0 0-.6.22L2.14 7.84a.5.5 0 0 0 .11.64l2.03 1.58c-.05.3-.08.65-.08.94 0 .32.03.64.08.94L2.25 13.52a.5.5 0 0 0-.11.64l1.92 3.32c.14.24.43.34.7.23l2.39-.96c.51.36 1.07.66 1.67.89l.37 2.54c.05.25.25.42.5.42h4c.25 0 .45-.17.49-.42l.37-2.54c.6-.23 1.16-.53 1.68-.89l2.39.96c.26.11.56.01.7-.23l1.92-3.32a.5.5 0 0 0-.11-.64l-2.03-1.58zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5S10.07 8.5 12 8.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
  </svg>
);

export const EditIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm3.92 1.42H5v-1.92l8.06-8.06 1.92 1.92-8.06 8.06zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 1 0-1.41 1.41l2.34 2.34a.996.996 0 0 0 1.41 0z" />
  </svg>
);

export const RubleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M8 21h2v-3h4c2.76 0 5-2.24 5-5s-2.24-5-5-5H10V3H8v5H6v2h2v3H6v2h2v3zm2-5v-3h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4z" />
  </svg>
);

export const ViewWeekIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M3 5v14h18V5H3zm5 12H5V7h3v10zm6 0h-4V7h4v10zm5 0h-3V7h3v10z" />
  </svg>
);

export const CalendarMonthIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V10h14v8zm0-10H5V6h14v2z" />
  </svg>
);
