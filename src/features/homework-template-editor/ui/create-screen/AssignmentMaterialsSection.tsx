import { ChangeEvent, FC, useMemo, useState } from 'react';
import { HomeworkAttachment, HomeworkBlockMedia } from '../../../../entities/types';
import { uploadFileToHomeworkStorage } from '../../../homework-submit/model/upload';
import {
  MAX_TEMPLATE_MATERIAL_FILE_SIZE_BYTES,
  TEMPLATE_MATERIAL_FILE_ACCEPT,
  TEMPLATE_MATERIAL_FILE_HINT,
  createAttachmentFromUrl,
  formatTemplateMaterialSize,
  resolveTemplateMaterialDisplayName,
  resolveTemplateMaterialKind,
} from '../../model/lib/templateMaterials';
import {
  HomeworkCloudArrowUpIcon,
  HomeworkLinkIcon,
  HomeworkTrashIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './AssignmentMaterialsSection.module.css';

interface AssignmentMaterialsSectionProps {
  mediaBlock: HomeworkBlockMedia;
  onMediaBlockChange: (nextBlock: HomeworkBlockMedia) => void;
}

export const AssignmentMaterialsSection: FC<AssignmentMaterialsSectionProps> = ({
  mediaBlock,
  onMediaBlockChange,
}) => {
  const [pendingLink, setPendingLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attachments = useMemo(() => mediaBlock.attachments ?? [], [mediaBlock.attachments]);

  const appendAttachments = (items: HomeworkAttachment[]) => {
    if (!items.length) return;
    onMediaBlockChange({
      ...mediaBlock,
      attachments: [...attachments, ...items],
    });
  };

  const removeAttachment = (attachmentId: string) => {
    onMediaBlockChange({
      ...mediaBlock,
      attachments: attachments.filter((item) => item.id !== attachmentId),
    });
  };

  const handlePickFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList?.length) return;

    const pickedFiles = Array.from(fileList);
    const oversizedFiles = pickedFiles.filter((file) => file.size > MAX_TEMPLATE_MATERIAL_FILE_SIZE_BYTES);
    const validFiles = pickedFiles.filter((file) => file.size <= MAX_TEMPLATE_MATERIAL_FILE_SIZE_BYTES);

    if (!validFiles.length) {
      setError(
        oversizedFiles.length > 0
          ? `Каждый файл должен быть до 50MB. Не подходят: ${oversizedFiles.map((file) => file.name).join(', ')}`
          : 'Выберите хотя бы один файл',
      );
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const results = await Promise.allSettled(validFiles.map((file) => uploadFileToHomeworkStorage(file)));
      const uploaded: HomeworkAttachment[] = [];
      const failedNames: string[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          uploaded.push(result.value);
        } else {
          failedNames.push(validFiles[index]?.name ?? `Файл #${index + 1}`);
        }
      });

      if (uploaded.length > 0) {
        appendAttachments(uploaded);
      }

      if (failedNames.length > 0 || oversizedFiles.length > 0) {
        setError(
          [
            oversizedFiles.length > 0 ? `Больше 50MB: ${oversizedFiles.map((file) => file.name).join(', ')}` : null,
            failedNames.length > 0 ? `Не загрузились: ${failedNames.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join('. '),
        );
      }
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить файлы';
      setError(message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleAddLink = () => {
    const attachment = createAttachmentFromUrl(pendingLink);
    if (!attachment) {
      setError('Укажите корректную ссылку в формате https://...');
      return;
    }

    setError(null);
    setPendingLink('');
    appendAttachments([attachment]);
  };

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Материалы</h2>
          <p className={styles.subtitle}>Файлы и ссылки для задания</p>
        </div>
      </div>

      <div className={styles.content}>
        <label className={styles.uploadZone}>
          <input type="file" multiple accept={TEMPLATE_MATERIAL_FILE_ACCEPT} className={styles.fileInput} onChange={handlePickFiles} />
          <span className={styles.uploadIcon}>
            <HomeworkCloudArrowUpIcon size={20} />
          </span>
          <strong>{uploading ? 'Загружаем файлы…' : 'Перетащите файлы сюда'}</strong>
          <span>или нажмите для выбора</span>
          <small>{TEMPLATE_MATERIAL_FILE_HINT}</small>
        </label>

        {attachments.length > 0 ? (
          <div className={styles.materialsList}>
            {attachments.map((attachment) => (
              <article key={attachment.id} className={styles.materialCard}>
                <div>
                  <h3 className={styles.materialTitle}>{resolveTemplateMaterialDisplayName(attachment)}</h3>
                  <p className={styles.materialMeta}>
                    {resolveTemplateMaterialKind(attachment) === 'link'
                      ? attachment.url
                      : formatTemplateMaterialSize(attachment.size)}
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`Удалить материал ${resolveTemplateMaterialDisplayName(attachment)}`}
                >
                  <HomeworkTrashIcon size={12} />
                </button>
              </article>
            ))}
          </div>
        ) : null}

        <div className={styles.separator}>
          <span />
          <p>ИЛИ</p>
          <span />
        </div>

        <div className={styles.linkRow}>
          <input
            type="url"
            className={styles.linkInput}
            placeholder="Вставьте ссылку на материал..."
            value={pendingLink}
            onChange={(event) => setPendingLink(event.target.value)}
          />
          <button type="button" className={styles.linkButton} onClick={handleAddLink}>
            <HomeworkLinkIcon size={14} />
            <span>Добавить</span>
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </section>
  );
};
