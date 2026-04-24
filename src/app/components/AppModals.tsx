import { FC, useEffect, useState } from 'react';
import { LinkedStudent } from '../../entities/types';
import { DialogModal } from '../../shared/ui/Modal/DialogModal';
import { Modal } from '../../shared/ui/Modal/Modal';
import modalStyles from '../../shared/ui/Modal/Modal.module.css';
import controls from '../../shared/styles/controls.module.css';
import { StudentModal } from '../../features/modals/StudentModal/StudentModal';
import { LessonModal } from '../../features/modals/LessonModal/LessonModal';
import { RescheduleLessonModal } from '../../features/modals/RescheduleLessonModal/RescheduleLessonModal';
import { PaymentCancelModal } from '../../features/modals/PaymentCancelModal/PaymentCancelModal';
import { PaymentBalanceModal } from '../../features/modals/PaymentBalanceModal/PaymentBalanceModal';
import { LessonEditPaymentResetModal } from '../../features/modals/LessonEditPaymentResetModal/LessonEditPaymentResetModal';
import { SeriesScopeDialog } from '../../features/lessons/ui/SeriesScopeDialog/SeriesScopeDialog';
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
      onConfirm: () => void | Promise<void>;
      onCancel: () => void | Promise<void>;
    }
  | {
      type: 'recurring-delete';
      title: string;
      message: string;
      applyToSeries: boolean;
      onConfirm: (applyToSeries: boolean) => void | Promise<void>;
      onCancel: () => void | Promise<void>;
    }
  | {
      type: 'payment-cancel';
      title: string;
      message: string;
      helperText?: string;
      refundText?: string;
      writeOffText?: string;
      onRefund: () => void | Promise<void>;
      onWriteOff: () => void | Promise<void>;
      onCancel: () => void | Promise<void>;
    }
  | {
      type: 'payment-balance';
      title: string;
      message: string;
      onWriteOff: () => void | Promise<void>;
      onSkip: () => void | Promise<void>;
      onCancel: () => void | Promise<void>;
    }
  | {
      type: 'lesson-edit-payment-reset';
      title: string;
      message: string;
      onConfirm: () => void | Promise<void>;
      onCancel: () => void | Promise<void>;
    }
  | null;

interface AppModalsProps {
  linkedStudents: LinkedStudent[];
  weekendWeekdays: number[];
  dialogState: DialogState;
  onCloseDialog: () => void;
  onDialogStateChange: (state: DialogState | ((prev: DialogState) => DialogState)) => void;
}

export const AppModals: FC<AppModalsProps> = ({
  linkedStudents,
  weekendWeekdays,
  dialogState,
  onCloseDialog,
  onDialogStateChange,
}) => {
  const [recurringDeleteSubmitting, setRecurringDeleteSubmitting] = useState(false);
  const {
    studentModalOpen,
    studentModalVariant,
    studentModalFocusField,
    newStudentDraft,
    studentEmailSuggestions,
    isEditingStudent,
    isStudentSubmitting,
    setStudentDraft,
    submitStudent,
    closeStudentModal,
  } = useStudentsActions();
  const {
    lessonModalOpen,
    lessonModalSubmitting,
    lessonModalVariant,
    lessonModalFocus,
    lessonDraft,
    editingLessonId,
    editingLesson,
    recurrenceLocked,
    defaultLessonDuration,
    setLessonDraft,
    saveLesson,
    closeLessonModal,
    requestDeleteLesson,
    markLessonCompleted,
    togglePaid,
    cancelLesson,
    rescheduleModalOpen,
    rescheduleModalSubmitting,
    rescheduleDraft,
    rescheduleLesson,
    setRescheduleDraft,
    saveRescheduleLesson,
    closeRescheduleModal,
    seriesScopeDialogState,
    confirmSeriesScope,
    cancelSeriesScope,
  } = useLessonActions();

  useEffect(() => {
    if (dialogState?.type !== 'recurring-delete') {
      setRecurringDeleteSubmitting(false);
    }
  }, [dialogState]);

  return (
    <>
      <StudentModal
        open={studentModalOpen}
        variant={studentModalVariant}
        focusField={studentModalFocusField}
        onClose={closeStudentModal}
        draft={newStudentDraft}
        emailSuggestions={studentEmailSuggestions}
        isEditing={isEditingStudent}
        isSubmitting={isStudentSubmitting}
        onDraftChange={setStudentDraft}
        onSubmit={submitStudent}
      />

      <LessonModal
        open={lessonModalOpen}
        variant={lessonModalVariant}
        focusTarget={lessonModalFocus}
        onClose={closeLessonModal}
        editingLessonId={editingLessonId}
        editingLesson={editingLesson}
        defaultDuration={defaultLessonDuration}
        linkedStudents={linkedStudents}
        weekendWeekdays={weekendWeekdays}
        draft={lessonDraft}
        recurrenceLocked={recurrenceLocked}
        onDraftChange={setLessonDraft}
        onDelete={editingLessonId ? requestDeleteLesson : undefined}
        isSubmitting={lessonModalSubmitting}
        onSubmit={saveLesson}
        onToggleCompleted={
          editingLesson && editingLesson.status !== 'CANCELED'
            ? () => {
                void markLessonCompleted(editingLesson.id);
              }
            : undefined
        }
        onTogglePaid={
          editingLesson && editingLesson.status !== 'CANCELED'
            ? () => {
                const primaryStudentId = editingLesson.participants?.[0]?.studentId;
                void togglePaid(editingLesson.id, primaryStudentId, {
                  currentIsPaid: Boolean(editingLesson.isPaid),
                });
              }
            : undefined
        }
        onCancelLesson={
          editingLesson && editingLesson.status !== 'CANCELED'
            ? () => {
                void cancelLesson(editingLesson, 'SINGLE');
              }
            : undefined
        }
      />

      <RescheduleLessonModal
        open={rescheduleModalOpen}
        lesson={rescheduleLesson}
        weekendWeekdays={weekendWeekdays}
        draft={rescheduleDraft}
        onDraftChange={setRescheduleDraft}
        onClose={closeRescheduleModal}
        isSubmitting={rescheduleModalSubmitting}
        onSubmit={saveRescheduleLesson}
      />

      {dialogState &&
        dialogState.type !== 'recurring-delete' &&
        dialogState.type !== 'payment-cancel' &&
        dialogState.type !== 'payment-balance' &&
        dialogState.type !== 'lesson-edit-payment-reset' && (
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
        <Modal open title={dialogState.title} onClose={recurringDeleteSubmitting ? () => undefined : onCloseDialog}>
          <p className={modalStyles.message}>{dialogState.message}</p>
          <div className={modalStyles.toggleRow}>
            <label className={controls.switch}>
              <input
                type="checkbox"
                checked={dialogState.applyToSeries}
                disabled={recurringDeleteSubmitting}
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
            <button
              type="button"
              className={controls.secondaryButton}
              onClick={() => {
                if (recurringDeleteSubmitting) return;
                void Promise.resolve(dialogState.onCancel());
              }}
              disabled={recurringDeleteSubmitting}
            >
              Отмена
            </button>
            <button
              type="button"
              className={controls.dangerButton}
              disabled={recurringDeleteSubmitting}
              onClick={() => {
                if (recurringDeleteSubmitting) return;
                setRecurringDeleteSubmitting(true);
                void Promise.resolve(dialogState.onConfirm(dialogState.applyToSeries)).finally(() => {
                  setRecurringDeleteSubmitting(false);
                });
              }}
            >
              <span className={modalStyles.buttonContent}>
                {recurringDeleteSubmitting ? <span className={modalStyles.buttonSpinner} aria-hidden /> : null}
                <span>Удалить</span>
              </span>
            </button>
          </div>
        </Modal>
      )}
      {dialogState?.type === 'payment-cancel' && (
        <PaymentCancelModal
          open
          title={dialogState.title}
          message={dialogState.message}
          helperText={dialogState.helperText}
          refundText={dialogState.refundText}
          writeOffText={dialogState.writeOffText}
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
      {dialogState?.type === 'lesson-edit-payment-reset' && (
        <LessonEditPaymentResetModal
          open
          title={dialogState.title}
          message={dialogState.message}
          onClose={dialogState.onCancel}
          onConfirm={dialogState.onConfirm}
        />
      )}

      <SeriesScopeDialog
        open={Boolean(seriesScopeDialogState)}
        title={seriesScopeDialogState?.title}
        confirmText={seriesScopeDialogState?.confirmText}
        defaultScope={seriesScopeDialogState?.defaultScope}
        previews={seriesScopeDialogState?.previews}
        onClose={cancelSeriesScope}
        onConfirm={confirmSeriesScope}
      />
    </>
  );
};
