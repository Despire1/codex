import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Task } from './types';
import { formatISO } from 'date-fns';

interface AddTaskPayload {
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
}

export interface TasksState {
  items: Task[];
}

const initialState: TasksState = {
  items: [
    {
      id: '1',
      title: 'Командный созвон',
      date: formatISO(new Date(), { representation: 'date' }),
      startTime: '10:00',
      durationMinutes: 60,
      completed: false,
    },
    {
      id: '2',
      title: 'Демо клиента',
      date: formatISO(new Date(), { representation: 'date' }),
      startTime: '14:00',
      durationMinutes: 45,
      completed: false,
    },
  ],
};

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    addTask: (state, action: PayloadAction<AddTaskPayload>) => {
      const { title, date, startTime, durationMinutes } = action.payload;
      const newTask: Task = {
        id: crypto.randomUUID(),
        title,
        date,
        startTime,
        durationMinutes,
        completed: false,
      };
      state.items.push(newTask);
    },
    toggleTaskCompletion: (state, action: PayloadAction<string>) => {
      const task = state.items.find((item) => item.id === action.payload);
      if (task) {
        task.completed = true;
      }
    },
  },
});

export const { addTask, toggleTaskCompletion } = tasksSlice.actions;
export const tasksReducer = tasksSlice.reducer;
