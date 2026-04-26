import { FC } from 'react';
import { Modal } from '../../shared/ui/Modal/Modal';
import { CHANGELOG_ENTRIES } from './changelogEntries';
import styles from './ChangelogModal.module.css';

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
}

export const ChangelogModal: FC<ChangelogModalProps> = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Что нового">
    <ul className={styles.list}>
      {CHANGELOG_ENTRIES.map((entry) => (
        <li key={entry.id} className={styles.item}>
          <div className={styles.itemDate}>{entry.date}</div>
          <div className={styles.itemTitle}>{entry.title}</div>
          <div className={styles.itemDescription}>{entry.description}</div>
        </li>
      ))}
    </ul>
  </Modal>
);
