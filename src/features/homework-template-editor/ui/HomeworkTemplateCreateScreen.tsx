import { FC } from 'react';
import { ChevronLeftIcon } from '../../../icons/MaterialIcons';
import { HomeworkTemplateEditorDraft } from '../model/types';
import { HomeworkTemplateEditorForm } from './HomeworkTemplateEditorForm';
import styles from './HomeworkTemplateCreateScreen.module.css';

interface HomeworkTemplateCreateScreenProps {
  draft: HomeworkTemplateEditorDraft;
  submitting: boolean;
  onDraftChange: (draft: HomeworkTemplateEditorDraft) => void;
  onSubmit: () => Promise<boolean>;
  onBack: () => void;
}

export const HomeworkTemplateCreateScreen: FC<HomeworkTemplateCreateScreenProps> = ({
  draft,
  submitting,
  onDraftChange,
  onSubmit,
  onBack,
}) => {
  return (
    <section className={styles.page}>
      <div className={styles.backRow}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <ChevronLeftIcon width={18} height={18} />
          Назад к домашкам
        </button>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.title}>Создать шаблон</h2>
        <HomeworkTemplateEditorForm
          mode="create"
          draft={draft}
          submitting={submitting}
          onDraftChange={onDraftChange}
          onSubmit={onSubmit}
          onCancel={onBack}
          onSubmitSuccess={onBack}
        />
      </section>
    </section>
  );
};
