import { configureStore } from '@reduxjs/toolkit';
import { tasksReducer, TasksState } from '@/entities/task/model/taskSlice';
import { accountReducer } from '@/entities/account/model/accountSlice';
import { AccountState } from '@/entities/account/model/types';
import { loadState, saveState } from '@/shared/lib/localDatabase';

const preloadedState = loadState();

export const store = configureStore({
  reducer: {
    tasks: tasksReducer,
    account: accountReducer,
  },
  preloadedState: preloadedState as Partial<{ tasks: TasksState; account: AccountState }>,
});

store.subscribe(() => {
  const state = store.getState();
  saveState({
    tasks: state.tasks,
    account: state.account,
  });
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
