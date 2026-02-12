import { FC } from 'react';
import { Modal } from '../../../shared/ui/Modal/Modal';
import { HomeworkTemplateEditorDraft, HomeworkTemplateEditorMode } from '../model/types';
import { HomeworkTemplateEditorForm } from './HomeworkTemplateEditorForm';

interface HomeworkTemplateEditorModalProps {
  open: boolean;
  mode: HomeworkTemplateEditorMode;
  draft: HomeworkTemplateEditorDraft;
  submitting: boolean;
  onDraftChange: (draft: HomeworkTemplateEditorDraft) => void;
  onSubmit: () => Promise<boolean>;
  onClose: () => void;
}

export const HomeworkTemplateEditorModal: FC<HomeworkTemplateEditorModalProps> = ({
  open,
  mode,
  draft,
  submitting,
  onDraftChange,
  onSubmit,
  onClose,
}) => {
  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={mode === 'create' ? 'Создать шаблон' : 'Редактировать шаблон'}>
      <HomeworkTemplateEditorForm
        mode={mode}
        draft={draft}
        submitting={submitting}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        onCancel={handleClose}
        onSubmitSuccess={onClose}
      />
    </Modal>
  );
};
