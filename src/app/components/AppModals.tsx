import { FC } from 'react';
import { LinkedStudent } from '../../entities/types';
import { DialogModal } from '../../shared/ui/Modal/DialogModal';
import { Modal } from '../../shared/ui/Modal/Modal';
import modalStyles from '../../shared/ui/Modal/Modal.module.css';
import controls from '../../shared/styles/controls.module.css';
import { StudentModal } from '../../features/modals/StudentModal/StudentModal';
import { LessonModal } from '../../features/modals/LessonModal/LessonModal';
import { PaymentCancelModal } from '../../features/modals/PaymentCancelModal/PaymentCancelModal';
import { PaymentBalanceModal } from '../../features/modals/PaymentBalanceModal/PaymentBalanceModal';
import { useStudentsActions } from '../../widgets/students/model/useStudentsActions';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';

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
  | {
      type: 'payment-balance';
      title: string;
      message: string;
      onWriteOff: () => void;
      onSkip: () => void;
      onCancel: () => void;
    }
  | null;

interface AppModalsProps {
  linkedStudents: LinkedStudent[];
  dialogState: DialogState;
  onCloseDialog: () => void;
  onDialogStateChange: (state: DialogState | ((prev: DialogState) => DialogState)) => void;
}

export const AppModals: FC<AppModalsProps> = ({
  linkedStudents,
  dialogState,
  onCloseDialog,
  onDialogStateChange,
}) => {
  const {
    studentModalOpen,
    studentModalVariant,
    newStudentDraft,
    isEditingStudent,
    setStudentDraft,
    submitStudent,
    closeStudentModal,
  } = useStudentsActions();
  const {
    lessonModalOpen,
    lessonModalVariant,
    lessonDraft,
    editingLessonId,
    recurrenceLocked,
    defaultLessonDuration,
    setLessonDraft,
    saveLesson,
    closeLessonModal,
    requestDeleteLesson,
  } = useLessonActions();

  return (
    <>
      <StudentModal
        open={studentModalOpen}
        variant={studentModalVariant}
        onClose={closeStudentModal}
        draft={newStudentDraft}
        isEditing={isEditingStudent}
        onDraftChange={setStudentDraft}
        onSubmit={submitStudent}
      />

      <LessonModal
        open={lessonModalOpen}
        variant={lessonModalVariant}
        onClose={closeLessonModal}
        editingLessonId={editingLessonId}
        defaultDuration={defaultLessonDuration}
        linkedStudents={linkedStudents}
        draft={lessonDraft}
        recurrenceLocked={recurrenceLocked}
        onDraftChange={setLessonDraft}
        onDelete={editingLessonId ? requestDeleteLesson : undefined}
        onSubmit={saveLesson}
      />

      {dialogState &&
        dialogState.type !== 'recurring-delete' &&
        dialogState.type !== 'payment-cancel' &&
        dialogState.type !== 'payment-balance' && (
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
      {dialogState?.type === 'payment-balance' && (
        <PaymentBalanceModal
          open
          title={dialogState.title}
          message={dialogState.message}
          onClose={dialogState.onCancel}
          onWriteOff={dialogState.onWriteOff}
          onSkip={dialogState.onSkip}
        />
      )}
    </>
  );
};
