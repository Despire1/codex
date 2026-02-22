import {
  HomeworkBookIcon,
  HomeworkBookOpenIcon,
  HomeworkFileLinesIcon,
  HomeworkGearIcon,
  HomeworkLayerGroupIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';

type GroupIconViewProps = {
  iconKey: string;
  size?: 10 | 11 | 12 | 13 | 14 | 15 | 16 | 18 | 20 | 22;
  className?: string;
};

export const GroupIconView = ({ iconKey, size = 14, className }: GroupIconViewProps) => {
  const normalized = iconKey.trim().toLowerCase();
  if (normalized === 'book') return <HomeworkBookIcon size={size} className={className} />;
  if (normalized === 'book-open') return <HomeworkBookOpenIcon size={size} className={className} />;
  if (normalized === 'file-lines') return <HomeworkFileLinesIcon size={size} className={className} />;
  if (normalized === 'microphone') return <HomeworkMicrophoneIcon size={size} className={className} />;
  if (normalized === 'list-check') return <HomeworkListCheckIcon size={size} className={className} />;
  if (normalized === 'gear') return <HomeworkGearIcon size={size} className={className} />;
  return <HomeworkLayerGroupIcon size={size} className={className} />;
};
