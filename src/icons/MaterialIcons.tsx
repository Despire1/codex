import { SVGProps } from 'react';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

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

export const CurrencyRubleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M14 4H8v8H6v2h2v2H6v2h2v2h2v-2h4v-2h-4v-2h4v-2h-4V6h4a2 2 0 0 1 0 4h-1v2h1a4 4 0 1 0 0-8z" />
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

export const ViewDayIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M2 5v14h20V5H2zm6 12H4V7h4v10zm6 0h-4V7h4v10zm6 0h-4V7h4v10z" />
  </svg>
);

export const CheckCircleOutlineIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
    <path d="m10 16.17-3.88-3.88L5.7 13.71 10 18l8.3-8.29-1.41-1.42z" />
  </svg>
);

export const TaskAltIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M22 5.18 10.59 16.6 6 12l1.41-1.41 3.18 3.18L20.59 3.77z" />
    <path d="M19.62 9.16a7.5 7.5 0 1 1-3.77-3.77l1.46-1.46A9.5 9.5 0 1 0 22 12c0-.97-.15-1.9-.43-2.78z" />
  </svg>
);

export const NotificationsNoneOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 .99H8V11c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v5.99z" />
  </svg>
);

export const EditOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
    <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0L14.13 5.1l3.75 3.75 2.83-2.83z" />
  </svg>
);

export const ContentCopyOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
  </svg>
);

export const MoreHorizIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
  </svg>
);

export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

export const ReplayOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M12 5V1L7 6l5 5V7c2.76 0 5 2.24 5 5a5 5 0 1 1-5-5v2l4-4-4-4v2c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7z" />
  </svg>
);

export const SaveOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zM12 19c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
  </svg>
);

export const ExpandMoreOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
  </svg>
);

export const ExpandLessOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="m12 8 6 6-1.41 1.41L12 10.83l-4.59 4.58L6 14z" />
  </svg>
);

export const AddOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
);

export const BackspaceOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7L2.38 12 7 5h15v14z" />
    <path d="m12.41 12 3.29-3.29-1.41-1.42L11 10.59 7.71 7.29 6.29 8.71 9.59 12l-3.3 3.29 1.42 1.42L11 13.41l3.29 3.3 1.42-1.42z" />
  </svg>
);

export const ClearIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

export const DoneOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

export const PaidOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
    <AttachMoneyIcon width={props.width} height={props.height}/>
);

export const AttachMoneyOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.19 0 2.06.39 2.83 1.24l1.54-1.54C14.9 5.69 13.76 5.2 12.5 5.06V3h-2v2.06C8.09 5.32 6.8 6.97 6.8 8.89c0 2.38 1.96 3.46 4.7 4.13 2.32.58 2.9 1.21 2.9 2.13 0 1.01-.9 1.72-2.16 1.72-1.34 0-2.31-.54-3.11-1.49l-1.56 1.56c1.02 1.26 2.34 2.03 3.93 2.24V21h2v-1.97c2.28-.27 3.8-1.86 3.8-4.03 0-2.79-2.3-3.75-4.7-4.2z" />
  </svg>
);

export const EventRepeatOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M17 12h-5v4H8v2h4v4l5-5-5-5z" />
    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.86 3.14-7 7-7a7 7 0 0 1 6.92 6h2.02A9.003 9.003 0 0 0 13 3z" />
  </svg>
);

export const EditCalendarOutlinedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M17 12h-5v5h5v-5z" />
    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h3.68l-1.06 1.06c-.2.2-.32.45-.38.71-.06.29-.03.6.11.86.26.5.77.79 1.31.79.25 0 .5-.06.74-.2l6.17-3.58c.3-.18.54-.45.69-.76.15-.33.2-.69.14-1.04l-.11-.6H19c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14h-6v-2H7V8h12v10z" />
  </svg>
);

export const DeleteOutlineIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM18 4h-3.5l-1-1h-3l-1 1H4v2h16V4z" />
  </svg>
);
