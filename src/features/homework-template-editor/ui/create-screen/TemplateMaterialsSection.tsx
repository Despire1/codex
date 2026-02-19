import { FC, useMemo, useState } from 'react';
import { HomeworkBlockMedia } from '../../../../entities/types';
import { uploadFileToHomeworkStorage, resolveHomeworkStorageUrl } from '../../../homework-submit/model/upload';
import {
  createAttachmentFromUrl,
} from '../../model/lib/createTemplateScreen';
import {
  HomeworkCloudArrowUpIcon,
  HomeworkLinkIcon,
  HomeworkPaperclipIcon,
  HomeworkXMarkIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './TemplateMaterialsSection.module.css';

interface TemplateMaterialsSectionProps {
  mediaBlock: HomeworkBlockMedia;
  onMediaBlockChange: (nextBlock: HomeworkBlockMedia) => void;
}

export const TemplateMaterialsSection: FC<TemplateMaterialsSectionProps> = ({ mediaBlock, onMediaBlockChange }) => {
  const [pendingLink, setPendingLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attachments = useMemo(() => mediaBlock.attachments ?? [], [mediaBlock.attachments]);

  const appendAttachments = (items: HomeworkBlockMedia['attachments']) => {
    onMediaBlockChange({
      ...mediaBlock,
      attachments: [...attachments, ...items],
    });
  };

  const handlePickFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError(null);
    setUploading(true);
    try {
      const uploaded = await Promise.all(Array.from(files).map((file) => uploadFileToHomeworkStorage(file)));
      appendAttachments(uploaded);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : '';
      setError(message ? `Не удалось загрузить файлы: ${message}` : 'Не удалось загрузить файлы');
    } finally {
      setUploading(false);
    }
  };

  const addLink = () => {
    const attachment = createAttachmentFromUrl(pendingLink);
    if (!attachment) return;
    appendAttachments([attachment]);
    setPendingLink('');
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>
          <HomeworkPaperclipIcon size={15} />
        </span>
        <div>
          <h2 className={styles.sectionTitle}>Материалы</h2>
          <p className={styles.sectionSubtitle}>Добавьте файлы, ссылки или инструкции</p>
        </div>
      </div>

      <label className={styles.uploadArea}>
        <input
          type="file"
          className={styles.fileInput}
          multiple
          disabled={uploading}
          onChange={(event) => {
            void handlePickFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <span className={styles.uploadIconWrap}>
          <HomeworkCloudArrowUpIcon size={22} />
        </span>
        <strong>Загрузите файлы</strong>
        <span>PDF, DOC, JPG, PNG до 50MB</span>
        <span className={styles.uploadButton}>{uploading ? 'Загружаю…' : 'Выбрать файлы'}</span>
      </label>

      <div className={styles.orDivider}>ИЛИ</div>

      <div className={styles.linkRow}>
        <input
          type="url"
          className={styles.linkInput}
          placeholder="Вставьте ссылку на материал..."
          value={pendingLink}
          onChange={(event) => setPendingLink(event.target.value)}
        />
        <button type="button" className={styles.linkAddButton} onClick={addLink}>
          <HomeworkLinkIcon size={12} /> Добавить
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {attachments.length > 0 ? (
        <div className={styles.attachmentsList}>
          {attachments.map((attachment) => (
            <article key={attachment.id} className={styles.attachmentCard}>
              <a href={resolveHomeworkStorageUrl(attachment.url)} target="_blank" rel="noreferrer">
                {attachment.fileName || attachment.url}
              </a>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() =>
                  onMediaBlockChange({
                    ...mediaBlock,
                    attachments: attachments.filter((item) => item.id !== attachment.id),
                  })
                }
              >
                <HomeworkXMarkIcon size={12} />
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
};
