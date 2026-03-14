import { FC, useEffect, useMemo, useState } from 'react';
import { ScheduleNote, ScheduleNoteType } from '../../../entities/types';
import { AddOutlinedIcon, DeleteOutlineIcon, EditOutlinedIcon, MoreHorizIcon } from '../../../icons/MaterialIcons';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { useIsMobile } from '../../../shared/lib/useIsMobile';
import { DialogModal } from '../../../shared/ui/Modal/DialogModal';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { ScheduleNoteModal } from '../../../features/modals/ScheduleNoteModal/ScheduleNoteModal';
import styles from './ScheduleDayNotesPanel.module.css';

interface ScheduleDayNotesPanelProps {
  dateKey: string;
  notes: ScheduleNote[];
  loading: boolean;
  timeZone: string;
  onCreate: (payload: { content: string; noteType: ScheduleNoteType }) => Promise<void>;
  onUpdate: (noteId: number, payload: { content: string; noteType: ScheduleNoteType }) => Promise<void>;
  onDelete: (noteId: number) => Promise<void>;
}

const ThumbtackIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden focusable="false" className={className}>
    <path d="M32 32C32 14.3 46.3 0 64 0H320c17.7 0 32 14.3 32 32s-14.3 32-32 32H290.5l11.4 148.2c36.7 19.9 65.7 53.2 79.5 94.7l1 3c3.3 9.8 1.6 20.5-4.4 28.8s-15.7 13.3-26 13.3H32c-10.3 0-19.9-4.9-26-13.3s-7.7-19.1-4.4-28.8l1-3c13.8-41.5 42.8-74.8 79.5-94.7L93.5 64H64C46.3 64 32 49.7 32 32zM160 384h64v96c0 17.7-14.3 32-32 32s-32-14.3-32-32V384z" />
  </svg>
);

const InfoCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" className={className}>
    <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24H216c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z" />
  </svg>
);

const formatNoteTime = (note: ScheduleNote, timeZone: string) =>
  formatInTimeZone(note.updatedAt === note.createdAt ? note.createdAt : note.updatedAt, 'HH:mm', { timeZone });

const resolveNoteTone = (noteType: ScheduleNoteType) => (noteType === 'INFO' ? 'info' : 'warning');
const getNotePriority = (noteType: ScheduleNoteType) => (noteType === 'IMPORTANT' ? 0 : 1);

type NoteModalState =
  | {
      mode: 'create';
      note?: undefined;
    }
  | {
      mode: 'edit';
      note: ScheduleNote;
    };

export const ScheduleDayNotesPanel: FC<ScheduleDayNotesPanelProps> = ({
  dateKey,
  notes,
  loading,
  timeZone,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const isMobile = useIsMobile(720);
  const [modalState, setModalState] = useState<NoteModalState | null>(null);
  const [busyNoteId, setBusyNoteId] = useState<number | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ScheduleNote | null>(null);
  const [activeMenuNoteId, setActiveMenuNoteId] = useState<number | null>(null);

  useEffect(() => {
    setModalState(null);
    setBusyNoteId(null);
    setDeleteCandidate(null);
    setActiveMenuNoteId(null);
  }, [dateKey]);

  const orderedNotes = useMemo(
    () =>
      [...notes].sort((left, right) => {
        const priorityDiff = getNotePriority(left.noteType) - getNotePriority(right.noteType);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }),
    [notes],
  );

  const handleSubmitNote = async (payload: { content: string; noteType: ScheduleNoteType }) => {
    if (modalState?.mode === 'edit' && modalState.note) {
      await onUpdate(modalState.note.id, payload);
      return;
    }

    await onCreate(payload);
  };

  const handleDelete = async () => {
    if (!deleteCandidate || busyNoteId !== null) return;
    setBusyNoteId(deleteCandidate.id);
    try {
      await onDelete(deleteCandidate.id);
      setDeleteCandidate(null);
    } finally {
      setBusyNoteId(null);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.scrollArea}>
        {loading ? <div className={styles.stateCard}>Загружаем заметки...</div> : null}

        {!loading && orderedNotes.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>Заметок пока нет</div>
          </div>
        ) : null}

        {!loading && orderedNotes.length > 0 ? (
          <div className={styles.notesList}>
            {orderedNotes.map((note) => {
              const isBusy = busyNoteId === note.id;
              const isMenuOpen = activeMenuNoteId === note.id;
              const tone = resolveNoteTone(note.noteType);

              return (
                <article
                  key={note.id}
                  className={`${styles.noteCard} ${tone === 'warning' ? styles.noteCardWarning : styles.noteCardInfo}`}
                >
                  <div className={styles.noteHeader}>
                    <div className={styles.noteBody}>
                      <div
                        className={`${styles.noteIconWrap} ${
                          tone === 'warning' ? styles.noteIconWrapWarning : styles.noteIconWrapInfo
                        }`}
                        aria-hidden
                      >
                        {tone === 'warning' ? (
                          <ThumbtackIcon className={styles.noteIcon} />
                        ) : (
                          <InfoCircleIcon className={styles.noteIcon} />
                        )}
                      </div>
                      <p className={styles.noteContent}>{note.content}</p>
                    </div>

                    <AdaptivePopover
                      isOpen={isMenuOpen}
                      onClose={() => setActiveMenuNoteId((current) => (current === note.id ? null : current))}
                      side="bottom"
                      align="end"
                      className={styles.actionsPopover}
                      trigger={
                        <button
                          type="button"
                          className={styles.menuButton}
                          disabled={isBusy}
                          aria-label="Действия с заметкой"
                          onClick={() => setActiveMenuNoteId((current) => (current === note.id ? null : note.id))}
                        >
                          <MoreHorizIcon width={18} height={18} />
                        </button>
                      }
                    >
                      <div className={styles.noteActions} role="menu" aria-label={`Действия для заметки #${note.id}`}>
                        <button
                          type="button"
                          className={styles.actionItem}
                          onClick={() => {
                            setModalState({ mode: 'edit', note });
                            setActiveMenuNoteId(null);
                          }}
                        >
                          <EditOutlinedIcon className={styles.actionButtonIcon} />
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionItem} ${styles.actionDanger}`}
                          onClick={() => {
                            setDeleteCandidate(note);
                            setActiveMenuNoteId(null);
                          }}
                        >
                          <DeleteOutlineIcon className={styles.actionButtonIcon} />
                          {isBusy ? 'Удаляем...' : 'Удалить'}
                        </button>
                      </div>
                    </AdaptivePopover>
                  </div>

                  <p className={styles.noteMeta}>{formatNoteTime(note, timeZone)}</p>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.addNoteButton} onClick={() => setModalState({ mode: 'create' })}>
          <AddOutlinedIcon className={styles.addNoteButtonIcon} />
          Добавить заметку
        </button>
      </div>

      <ScheduleNoteModal
        open={modalState !== null}
        mode={modalState?.mode ?? 'create'}
        dateKey={dateKey}
        initialValue={modalState?.mode === 'edit' ? modalState.note.content : ''}
        initialNoteType={modalState?.mode === 'edit' ? modalState.note.noteType : 'IMPORTANT'}
        variant={isMobile ? 'sheet' : 'modal'}
        onClose={() => setModalState(null)}
        onSubmit={handleSubmitNote}
      />

      <DialogModal
        open={Boolean(deleteCandidate)}
        title="Удалить заметку?"
        description={
          deleteCandidate
            ? `Заметка "${deleteCandidate.content.slice(0, 72)}${deleteCandidate.content.length > 72 ? '…' : ''}" будет удалена без возможности восстановления.`
            : ''
        }
        confirmText={busyNoteId === deleteCandidate?.id ? 'Удаляем...' : 'Удалить'}
        cancelText="Отмена"
        onClose={() => {
          if (busyNoteId !== null) return;
          setDeleteCandidate(null);
        }}
        onCancel={() => {
          if (busyNoteId !== null) return;
          setDeleteCandidate(null);
        }}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
};
