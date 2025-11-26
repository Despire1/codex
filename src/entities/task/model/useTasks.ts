import { useSelector } from 'react-redux';
import { RootState } from '@/app/providers/StoreProvider/config/store';
import { Task } from './types';

export const useTasks = (): { tasks: Task[] } => {
  const tasks = useSelector((state: RootState) => state.tasks.items);
  return { tasks };
};
