export type ViewMode = 'week' | 'month';

export interface Task {
  id: string;
  title: string;
  date: string; // ISO date without time
  startTime: string; // HH:mm
  durationMinutes: number;
}
