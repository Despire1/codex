import { FC, ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AddOutlinedIcon, ExpandMoreOutlinedIcon } from '../../../../icons/MaterialIcons';
import { AdaptivePopover } from '../../../../shared/ui/AdaptivePopover/AdaptivePopover';
import styles from './TopbarCreateMenu.module.css';

export interface TopbarCreateMenuItem {
  id: string;
  label: string;
  description?: string;
  onSelect: () => void;
  icon?: ReactNode;
  iconTone?: 'dark' | 'lime' | 'blue' | 'neutral';
}

interface TopbarCreateMenuProps {
  label: string;
  items: TopbarCreateMenuItem[];
  triggerClassName: string;
  triggerHiddenClassName?: string;
  iconAccentClassName?: string;
  disabled?: boolean;
  triggerDataTour?: string;
}

export const TopbarCreateMenu: FC<TopbarCreateMenuProps> = ({
  label,
  items,
  triggerClassName,
  triggerHiddenClassName = '',
  iconAccentClassName,
  disabled = false,
  triggerDataTour,
}) => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  const handleSelect = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <AdaptivePopover
      isOpen={open}
      onClose={() => setOpen(false)}
      side="bottom"
      align="end"
      offset={10}
      className={styles.popover}
      trigger={
        <button
          type="button"
          className={`${triggerClassName} ${disabled ? triggerHiddenClassName : ''}`.trim()}
          onClick={() => setOpen((prev) => !prev)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          data-tour={triggerDataTour}
        >
          <AddOutlinedIcon width={18} height={18} className={iconAccentClassName} />
          <span>{label}</span>
          <ExpandMoreOutlinedIcon width={18} height={18} className={styles.chevron} />
        </button>
      }
    >
      <div className={styles.menu} role="menu" aria-label="Действия с домашними заданиями">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => handleSelect(item.onSelect)}
          >
            {item.icon ? (
              <span
                className={`${styles.menuItemIcon} ${
                  item.iconTone === 'dark'
                    ? styles.menuItemIconDark
                    : item.iconTone === 'lime'
                      ? styles.menuItemIconLime
                      : item.iconTone === 'blue'
                        ? styles.menuItemIconBlue
                        : styles.menuItemIconNeutral
                }`}
              >
                {item.icon}
              </span>
            ) : null}
            <span className={styles.menuItemText}>
              <span className={styles.menuLabel}>{item.label}</span>
              {item.description ? <span className={styles.menuDescription}>{item.description}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </AdaptivePopover>
  );
};
