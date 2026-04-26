import { FC, useMemo, useState } from 'react';
import { ru } from 'date-fns/locale';
import { ScheduleNoteType, StudentListItem } from '../../../../entities/types';
import { getStudentProfileNoteItems, type StudentProfileNote } from '../../../../entities/student/lib/profileNotes';
import { AddOutlinedIcon, DeleteOutlineIcon, EditOutlinedIcon } from '../../../../icons/MaterialIcons';
import { ScheduleNoteModal } from '../../../../features/modals/ScheduleNoteModal/ScheduleNoteModal';
import { useIsMobile } from '../../../../shared/lib/useIsMobile';
import { formatInTimeZone } from '../../../../shared/lib/timezoneDates';
import { DialogModal } from '../../../../shared/ui/Modal/DialogModal';
import { Tooltip } from '../../../../shared/ui/Tooltip/Tooltip';
import styles from './StudentProfileNotesPanel.module.css';

interface StudentProfileNotesPanelProps {
  studentEntry: StudentListItem;
  timeZone: string;
  onCreateNote: (
    studentEntry: StudentListItem,
    payload: { content: string; noteType: ScheduleNoteType },
  ) => Promise<void>;
  onUpdateNote: (
    studentEntry: StudentListItem,
    noteId: string,
    payload: { content: string; noteType: ScheduleNoteType },
  ) => Promise<void>;
  onDeleteNote: (studentEntry: StudentListItem, noteId: string) => Promise<void>;
}

type NoteModalState =
  | {
      mode: 'create';
      note?: undefined;
    }
  | {
      mode: 'edit';
      note: StudentProfileNote;
    };

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

const resolveNoteTone = (noteType: ScheduleNoteType) => (noteType === 'INFO' ? 'info' : 'warning');

const formatNoteMeta = (note: StudentProfileNote, timeZone: string) => {
  if (note.source === 'primary') {
    return 'Из карточки ученика';
  }

  return formatInTimeZone(note.updatedAt ?? note.createdAt ?? new Date().toISOString(), 'd MMMM yyyy • HH:mm', {
    locale: ru,
    timeZone,
  });
};

export const StudentProfileNotesPanel: FC<StudentProfileNotesPanelProps> = ({
  studentEntry,
  timeZone,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}) => {
  const isMobile = useIsMobile(720);
  const notes = useMemo(() => getStudentProfileNoteItems(studentEntry.link.notes), [studentEntry.link.notes]);
  const [modalState, setModalState] = useState<NoteModalState | null>(null);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<StudentProfileNote | null>(null);

  const handleSubmitNote = async (payload: { content: string; noteType: ScheduleNoteType }) => {
    if (modalState?.mode === 'edit' && modalState.note) {
      setBusyNoteId(modalState.note.id);
      try {
        await onUpdateNote(studentEntry, modalState.note.id, payload);
      } finally {
        setBusyNoteId(null);
      }
      return;
    }

    setBusyNoteId('create');
    try {
      await onCreateNote(studentEntry, payload);
    } finally {
      setBusyNoteId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate || busyNoteId !== null) return;
    setBusyNoteId(deleteCandidate.id);
    try {
      await onDeleteNote(studentEntry, deleteCandidate.id);
      setDeleteCandidate(null);
    } finally {
      setBusyNoteId(null);
    }
  };

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Заметки</h3>
        <button type="button" className={styles.addButton} onClick={() => setModalState({ mode: 'create' })}>
          <AddOutlinedIcon className={styles.addButtonIcon} />
          Добавить
        </button>
      </div>

      {notes.length === 0 ? <div className={styles.emptyState}>Заметок пока нет</div> : null}

      {notes.length > 0 ? (
        <div className={styles.list}>
          {notes.map((note) => {
            const tone = resolveNoteTone(note.noteType);
            const isBusy = busyNoteId === note.id;

            return (
              <article
                key={note.id}
                className={`${styles.noteCard} ${tone === 'warning' ? styles.noteCardWarning : styles.noteCardInfo}`}
              >
                <div className={styles.noteHeader}>
                  <div className={styles.noteBody}>
                    <Tooltip
                      content={tone === 'warning' ? 'Важная заметка (закреплена сверху)' : 'Информационная заметка'}
                      align="center"
                    >
                      <div
                        className={`${styles.noteIconWrap} ${
                          tone === 'warning' ? styles.noteIconWrapWarning : styles.noteIconWrapInfo
                        }`}
                        role="img"
                        aria-label={tone === 'warning' ? 'Важная заметка' : 'Информационная заметка'}
                      >
                        {tone === 'warning' ? (
                          <ThumbtackIcon className={styles.noteIcon} />
                        ) : (
                          <InfoCircleIcon className={styles.noteIcon} />
                        )}
                      </div>
                    </Tooltip>
                    <p className={styles.noteContent}>{note.content}</p>
                  </div>

                  <div className={styles.noteQuickActions}>
                    <button
                      type="button"
                      className={styles.noteActionButton}
                      disabled={isBusy}
                      aria-label="Редактировать заметку"
                      onClick={() => {
                        setModalState({ mode: 'edit', note });
                      }}
                    >
                      <EditOutlinedIcon className={styles.noteActionIcon} />
                    </button>
                    <button
                      type="button"
                      className={styles.noteActionButton}
                      disabled={isBusy}
                      aria-label="Удалить заметку"
                      onClick={() => {
                        setDeleteCandidate(note);
                      }}
                    >
                      <DeleteOutlineIcon className={styles.noteActionIcon} />
                    </button>
                  </div>
                </div>

                <p className={styles.noteMeta}>{formatNoteMeta(note, timeZone)}</p>
              </article>
            );
          })}
        </div>
      ) : null}

      <ScheduleNoteModal
        open={modalState !== null}
        mode={modalState?.mode ?? 'create'}
        dateKey={`student-${studentEntry.student.id}`}
        initialValue={modalState?.mode === 'edit' ? modalState.note.content : ''}
        initialNoteType={modalState?.mode === 'edit' ? modalState.note.noteType : 'IMPORTANT'}
        variant={isMobile ? 'sheet' : 'modal'}
        onClose={() => {
          if (busyNoteId !== null) return;
          setModalState(null);
        }}
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
    </section>
  );
};
