import { FC, RefObject } from 'react';
import styles from './AssignmentBasicsSection.module.css';

interface AssignmentBasicsSectionProps {
  surface?: 'card' | 'plain';
  title: string;
  description: string;
  titleError?: string | null;
  titleValidationPath?: string;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

export const AssignmentBasicsSection: FC<AssignmentBasicsSectionProps> = ({
  surface = 'card',
  title,
  description,
  titleError = null,
  titleValidationPath,
  titleInputRef,
  onTitleChange,
  onDescriptionChange,
}) => (
  <section className={`${styles.card} ${surface === 'plain' ? styles.cardPlain : ''}`}>
    <div className={styles.field}>
      <label className={styles.label} htmlFor="assignment-title">
        Название задания <span className={styles.required}>*</span>
      </label>
      <input
        id="assignment-title"
        ref={titleInputRef}
        type="text"
        className={`${styles.input} ${titleError ? styles.inputError : ''}`}
        placeholder="Например: Present Perfect - практика"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        data-validation-path={titleValidationPath}
        aria-invalid={Boolean(titleError)}
        aria-describedby={titleError ? 'assignment-title-error' : undefined}
      />
      {titleError ? (
        <p id="assignment-title-error" className={styles.errorText}>
          {titleError}
        </p>
      ) : null}
    </div>

    <div className={styles.field}>
      <label className={styles.label} htmlFor="assignment-description">
        Инструкции для ученика
      </label>
      <textarea
        id="assignment-description"
        className={`${styles.input} ${styles.textarea}`}
        placeholder="Опишите, что нужно сделать..."
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
      />
    </div>
  </section>
);
