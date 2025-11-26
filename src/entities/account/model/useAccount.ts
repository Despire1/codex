import { useSelector } from 'react-redux';
import { RootState } from '@/app/providers/StoreProvider/config/store';
import { EXPERIENCE_PER_LEVEL } from './types';

export const useAccount = () => {
  const experience = useSelector((state: RootState) => state.account.experience);
  const level = Math.floor(experience / EXPERIENCE_PER_LEVEL) + 1;
  const currentLevelBase = (level - 1) * EXPERIENCE_PER_LEVEL;
  const progress = Math.min(1, (experience - currentLevelBase) / EXPERIENCE_PER_LEVEL);

  return {
    experience,
    level,
    nextLevelExp: level * EXPERIENCE_PER_LEVEL,
    progress,
  };
};
