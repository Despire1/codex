import { configureStore } from '@reduxjs/toolkit';
import { tasksReducer, TasksState } from '@/entities/task/model/taskSlice';
import { accountReducer } from '@/entities/account/model/accountSlice';
import { AccountState } from '@/entities/account/model/types';
import { themeReducer, ThemeState } from '@/entities/theme/model/themeSlice';
import { readStoredThemeMode, writeStoredThemeMode } from '@/entities/theme/lib/initialTheme';
import { loadState, saveState } from '@/shared/lib/localDatabase';

const preloadedState = loadState();
const persistedThemeMode = readStoredThemeMode();

const themePreloadedState: ThemeState | undefined = persistedThemeMode ? { mode: persistedThemeMode } : undefined;

export const store = configureStore({
  reducer: {
    tasks: tasksReducer,
    account: accountReducer,
    theme: themeReducer,
  },
  preloadedState: {
    ...(preloadedState as Partial<{ tasks: TasksState; account: AccountState }>),
    ...(themePreloadedState ? { theme: themePreloadedState } : {}),
  },
});

let lastPersistedThemeMode = store.getState().theme.mode;

store.subscribe(() => {
  const state = store.getState();
  saveState({
    tasks: state.tasks,
    account: state.account,
  });
  if (state.theme.mode !== lastPersistedThemeMode) {
    lastPersistedThemeMode = state.theme.mode;
    writeStoredThemeMode(state.theme.mode);
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
