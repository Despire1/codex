import { AccountState } from '@/entities/account/model/types';
import { TasksState } from '@/entities/task/model/taskSlice';

const STORAGE_KEY = 'calendar_app_state';

export interface PersistedState {
  tasks?: TasksState;
  account?: AccountState;
}

export const loadState = (): PersistedState | undefined => {
  if (typeof localStorage === 'undefined') return undefined;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PersistedState;
  } catch (error) {
    console.error('Failed to load state', error);
    return undefined;
  }
};

export const saveState = (state: PersistedState) => {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save state', error);
  }
};
