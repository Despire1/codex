import { FC } from 'react';
import { HomeworkBlockTest } from '../../../../entities/types';
import { resolveHomeworkStorageUrl } from '../../../homework-submit/model/upload';
import { HomeworkTemplateEditorDraft } from '../../model/types';
import { getQuestionKind } from '../../model/lib/createTemplateScreen';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import styles from './TemplatePreviewModal.module.css';

interface TemplatePreviewModalProps {
  open: boolean;
  draft: HomeworkTemplateEditorDraft;
  onClose: () => void;
}

const renderQuestionPreview = (question: HomeworkBlockTest['questions'][number], index: number) => {
  const kind = getQuestionKind(question);

  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    return (
      <div className={styles.previewQuestion} key={question.id}>
        <p>
          {index + 1}. {question.prompt || 'Вопрос без текста'}
        </p>
        <ul>
          {(question.options ?? []).map((option) => (
            <li key={option.id}>{option.text || 'Вариант без текста'}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (kind === 'FILL_WORD') {
    const text = question.fillInTheBlankText?.trim() || 'Текст с пропусками не заполнен';
    return (
      <div className={styles.previewQuestion} key={question.id}>
        <p>
          {index + 1}. {question.prompt || 'Вопрос без текста'}
        </p>
        <p>{text}</p>
      </div>
    );
  }

  if (kind === 'TABLE') {
    const table = question.table;
    return (
      <div className={styles.previewQuestion} key={question.id}>
        <p>
          {index + 1}. {question.prompt || 'Вопрос без текста'}
        </p>
        <span className={styles.previewQuestionType}>
          Таблица: {table?.rows?.length ?? 0} строк, {table?.answerHeaders?.length ?? 0} колонок для ответа
        </span>
      </div>
    );
  }

  return (
    <div className={styles.previewQuestion} key={question.id}>
      <p>
        {index + 1}. {question.prompt || 'Вопрос без текста'}
      </p>
      <span className={styles.previewQuestionType}>Тип ответа: {kind}</span>
    </div>
  );
};

export const TemplatePreviewModal: FC<TemplatePreviewModalProps> = ({ open, draft, onClose }) => {
  return (
    <Modal open={open} onClose={onClose} title="Предпросмотр шаблона">
      <div className={styles.previewContent}>
        <header>
          <h3>{draft.title || 'Без названия'}</h3>
          {draft.subject ? <p>Категория: {draft.subject}</p> : null}
        </header>

        {draft.blocks.map((block) => {
          if (block.type === 'TEXT') {
            return (
              <section key={block.id} className={styles.previewSection}>
                <h4>Описание</h4>
                <p>{block.content || 'Описание не заполнено'}</p>
              </section>
            );
          }

          if (block.type === 'MEDIA') {
            return (
              <section key={block.id} className={styles.previewSection}>
                <h4>Материалы</h4>
                <div className={styles.previewList}>
                  {(block.attachments ?? []).map((attachment) => (
                    <a key={attachment.id} href={resolveHomeworkStorageUrl(attachment.url)} target="_blank" rel="noreferrer">
                      {attachment.fileName || attachment.url}
                    </a>
                  ))}
                </div>
              </section>
            );
          }

          if (block.type === 'TEST') {
            return (
              <section key={block.id} className={styles.previewSection}>
                <h4>{block.title || 'Тест'}</h4>
                {block.questions.map((question, index) => renderQuestionPreview(question, index))}
              </section>
            );
          }

          const formats = [
            block.allowText ? 'текст' : null,
            block.allowFiles ? 'файлы' : null,
            block.allowPhotos ? 'фото' : null,
            block.allowDocuments ? 'документы' : null,
            block.allowAudio ? 'аудио' : null,
            block.allowVideo ? 'видео' : null,
            block.allowVoice ? 'voice' : null,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <section key={block.id} className={styles.previewSection}>
              <h4>Ответ ученика</h4>
              <p>Разрешенные форматы: {formats || 'не выбраны'}</p>
            </section>
          );
        })}
      </div>
    </Modal>
  );
};
