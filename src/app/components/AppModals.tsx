import { FC } from 'react';
import { LessonColor, LinkedStudent } from '../../entities/types';
import { DialogModal } from '../../shared/ui/Modal/DialogModal';
import { Modal } from '../../shared/ui/Modal/Modal';
import modalStyles from '../../shared/ui/Modal/Modal.module.css';
import controls from '../../shared/styles/controls.module.css';
import { StudentModal } from '../../features/modals/StudentModal/StudentModal';
import { LessonModal } from '../../features/modals/LessonModal/LessonModal';
import { PaymentCancelModal } from '../../features/modals/PaymentCancelModal/PaymentCancelModal';

export type DialogState =
  | {
      type: 'info';
      title: string;
      message: string;
      confirmText?: string;
    }
  | {
      type: 'confirm';
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void;
      onCancel: () => void;
    }
  | {
      type: 'recurring-delete';
      title: string;
      message: string;
      applyToSeries: boolean;
      onConfirm: (applyToSeries: boolean) => void;
      onCancel: () => void;
    }
  | {
      type: 'payment-cancel';
      title: string;
      message: string;
      onRefund: () => void;
      onWriteOff: () => void;
      onCancel: () => void;
    }
  | null;

type LessonDraft = {
  studentId?: number;
  studentIds: number[];
  date: string;
  time: string;
  durationMinutes: number;
  color: LessonColor;
  isRecurring: boolean;
  repeatWeekdays: number[];
  repeatUntil?: string;
};

interface AppModalsProps {
  studentModalOpen: boolean;
  onCloseStudentModal: () => void;
  newStudentDraft: { customName: string; username: string; pricePerLesson: string };
  isEditingStudent: boolean;
  onStudentDraftChange: (draft: { customName: string; username: string; pricePerLesson: string }) => void;
  onSubmitStudent: () => void;
  lessonModalOpen: boolean;
  onCloseLessonModal: () => void;
  editingLessonId: number | null;
  defaultLessonDuration: number;
  linkedStudents: LinkedStudent[];
  lessonDraft: LessonDraft;
  recurrenceLocked: boolean;
  onLessonDraftChange: (draft: LessonDraft) => void;
  onDeleteLesson?: () => void;
  onSubmitLesson: (options?: { applyToSeriesOverride?: boolean; detachFromSeries?: boolean }) => void;
  dialogState: DialogState;
  onCloseDialog: () => void;
  onDialogStateChange: (state: DialogState | ((prev: DialogState) => DialogState)) => void;
}

export const AppModals: FC<AppModalsProps> = ({
  studentModalOpen,
  onCloseStudentModal,
  newStudentDraft,
  isEditingStudent,
  onStudentDraftChange,
  onSubmitStudent,
  lessonModalOpen,
  onCloseLessonModal,
  editingLessonId,
  defaultLessonDuration,
  linkedStudents,
  lessonDraft,
  recurrenceLocked,
  onLessonDraftChange,
  onDeleteLesson,
  onSubmitLesson,
  dialogState,
  onCloseDialog,
  onDialogStateChange,
}) => {
  return (
    <>
      <StudentModal
        open={studentModalOpen}
        onClose={onCloseStudentModal}
        draft={newStudentDraft}
        isEditing={isEditingStudent}
        onDraftChange={onStudentDraftChange}
        onSubmit={onSubmitStudent}
      />

      <LessonModal
        open={lessonModalOpen}
        onClose={onCloseLessonModal}
        editingLessonId={editingLessonId}
        defaultDuration={defaultLessonDuration}
        linkedStudents={linkedStudents}
        draft={lessonDraft}
        recurrenceLocked={recurrenceLocked}
        onDraftChange={onLessonDraftChange}
        onDelete={onDeleteLesson}
        onSubmit={onSubmitLesson}
      />

      {dialogState && dialogState.type !== 'recurring-delete' && dialogState.type !== 'payment-cancel' && (
        <DialogModal
          open
          title={dialogState.title}
          description={dialogState.message}
          confirmText={dialogState.confirmText}
          cancelText={dialogState.type === 'confirm' ? dialogState.cancelText : undefined}
          onClose={onCloseDialog}
          onConfirm={() => {
            if (dialogState.type === 'confirm') {
              dialogState.onConfirm();
            } else {
              onCloseDialog();
            }
          }}
          onCancel={dialogState.type === 'confirm' ? dialogState.onCancel : undefined}
        />
      )}
      {dialogState?.type === 'recurring-delete' && (
        <Modal open title={dialogState.title} onClose={onCloseDialog}>
          <p className={modalStyles.message}>{dialogState.message}</p>
          <div className={modalStyles.toggleRow}>
            <label className={controls.switch}>
              <input
                type="checkbox"
                checked={dialogState.applyToSeries}
                onChange={(e) =>
                  onDialogStateChange((state) =>
                    state?.type === 'recurring-delete'
                      ? { ...state, applyToSeries: e.target.checked }
                      : state,
                  )
                }
              />
              <span className={controls.slider} />
            </label>
            <span className={modalStyles.toggleLabel}>
              {dialogState.applyToSeries ? 'Удалить все уроки серии' : 'Удалить только выбранный урок'}
            </span>
          </div>
          <div className={modalStyles.actions}>
            <button type="button" className={controls.secondaryButton} onClick={dialogState.onCancel}>
              Отмена
            </button>
            <button
              type="button"
              className={controls.dangerButton}
              onClick={() => dialogState.onConfirm(dialogState.applyToSeries)}
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
      {dialogState?.type === 'payment-cancel' && (
        <PaymentCancelModal
          open
          title={dialogState.title}
          message={dialogState.message}
          onClose={dialogState.onCancel}
          onRefund={dialogState.onRefund}
          onWriteOff={dialogState.onWriteOff}
        />
      )}
    </>
  );
};
