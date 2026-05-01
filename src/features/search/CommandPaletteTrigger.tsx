import { type FC } from 'react';
import { HomeworkMagnifyingGlassIcon } from '../../shared/ui/icons/HomeworkFaIcons';

interface CommandPaletteTriggerProps {
  className?: string;
  onClick: () => void;
  'data-tour'?: string;
}

export const CommandPaletteTrigger: FC<CommandPaletteTriggerProps> = ({
  className,
  onClick,
  'data-tour': dataTour,
}) => (
  <button
    type="button"
    className={className}
    aria-label="Открыть поиск"
    title="Поиск (⌘K)"
    onClick={onClick}
    data-tour={dataTour}
  >
    <HomeworkMagnifyingGlassIcon size={16} />
  </button>
);
