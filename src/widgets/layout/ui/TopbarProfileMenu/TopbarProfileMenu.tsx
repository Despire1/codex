import { FC, Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../../../shared/ui/Avatar/Avatar';
import { AdaptivePopover } from '../../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { DialogModal } from '../../../../shared/ui/Modal/DialogModal';
import { useLogout } from '../../../../features/auth/session';
import { ChangelogModal } from '../../../../features/changelog/ChangelogModal';
import { CHANGELOG_ENTRIES } from '../../../../features/changelog/changelogEntries';
import styles from './TopbarProfileMenu.module.css';

const CHANGELOG_SEEN_KEY = 'tb_changelog_last_seen';
const LATEST_ENTRY_ID = CHANGELOG_ENTRIES[0]?.id ?? '';

interface TopbarProfileMenuProps {
  displayName: string;
  fallbackText: string;
  profilePhotoUrl?: string | null;
  displayNameClassName: string;
}

export const TopbarProfileMenu: FC<TopbarProfileMenuProps> = ({
  displayName,
  fallbackText,
  profilePhotoUrl,
  displayNameClassName,
}) => {
  const [open, setOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [hasUnreadChangelog, setHasUnreadChangelog] = useState(false);
  const navigate = useNavigate();
  const { logout, isLoggingOut } = useLogout();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(CHANGELOG_SEEN_KEY);
    setHasUnreadChangelog(seen !== LATEST_ENTRY_ID);
  }, []);

  const markChangelogSeen = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_ENTRY_ID);
    setHasUnreadChangelog(false);
  };

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const requestLogout = () => {
    setOpen(false);
    setLogoutDialogOpen(true);
  };

  return (
    <Fragment>
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
            className={styles.trigger}
            onClick={() => setOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Меню профиля"
          >
            <span className={displayNameClassName}>{displayName}</span>
            <span className={styles.avatarWrap}>
              <Avatar src={profilePhotoUrl} alt="Профиль преподавателя" fallbackText={fallbackText} />
              {hasUnreadChangelog ? <span className={styles.avatarDot} aria-hidden /> : null}
            </span>
          </button>
        }
      >
        <div className={styles.menu} role="menu" aria-label="Меню профиля">
          <button type="button" className={styles.menuItem} role="menuitem" onClick={() => handleNavigate('/settings')}>
            Настройки
          </button>
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setChangelogOpen(true);
              markChangelogSeen();
            }}
          >
            Что нового
            {hasUnreadChangelog ? <span className={styles.menuItemDot} aria-hidden /> : null}
          </button>
          <div className={styles.divider} aria-hidden />
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            role="menuitem"
            onClick={requestLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Выходим…' : 'Выйти'}
          </button>
        </div>
      </AdaptivePopover>
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <DialogModal
        open={logoutDialogOpen}
        title="Выйти из аккаунта?"
        description="Сессия завершится на этом устройстве. Чтобы вернуться, нужно будет заново войти через Telegram."
        confirmText="Выйти"
        cancelText="Остаться"
        onClose={() => setLogoutDialogOpen(false)}
        onCancel={() => setLogoutDialogOpen(false)}
        onConfirm={async () => {
          await logout();
        }}
      />
    </Fragment>
  );
};
