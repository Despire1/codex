import { FC, useEffect, useMemo, useState } from 'react';
import { HomeworkAttachment, HomeworkBlockMedia } from '../../../../entities/types';
import { uploadFileToHomeworkStorage, resolveHomeworkStorageUrl } from '../../../homework-submit/model/upload';
import {
  MAX_TEMPLATE_MATERIAL_FILE_SIZE_BYTES,
  TEMPLATE_MATERIAL_FILE_ACCEPT,
  TEMPLATE_MATERIAL_FILE_HINT,
  createAttachmentFromUrl,
  formatTemplateMaterialAddedAt,
  formatTemplateMaterialSize,
  resolveTemplateMaterialDisplayName,
  resolveTemplateMaterialKind,
  resolveTemplateMaterialLinkSubtitle,
  type TemplateMaterialKind,
} from '../../model/lib/templateMaterials';
import {
  HomeworkArrowUpRightFromSquareIcon,
  HomeworkCloudArrowUpIcon,
  HomeworkDownloadIcon,
  HomeworkEyeIcon,
  HomeworkFileAudioIcon,
  HomeworkFileImageIcon,
  HomeworkFileLinesIcon,
  HomeworkFilePdfIcon,
  HomeworkFileVideoIcon,
  HomeworkFileWordIcon,
  HomeworkLinkIcon,
  HomeworkPaperclipIcon,
  HomeworkPlayIcon,
  HomeworkTrashIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './TemplateMaterialsSection.module.css';

interface TemplateMaterialsSectionProps {
  mediaBlock: HomeworkBlockMedia;
  onMediaBlockChange: (nextBlock: HomeworkBlockMedia) => void;
}

const TYPE_BADGE_CLASS_MAP: Record<TemplateMaterialKind, string> = {
  pdf: styles.typeBadgePdf,
  word: styles.typeBadgeWord,
  image: styles.typeBadgeImage,
  audio: styles.typeBadgeAudio,
  video: styles.typeBadgeVideo,
  link: styles.typeBadgeLink,
  file: styles.typeBadgeFile,
};

const resolveTypeIcon = (kind: TemplateMaterialKind) => {
  switch (kind) {
    case 'pdf':
      return <HomeworkFilePdfIcon size={18} />;
    case 'word':
      return <HomeworkFileWordIcon size={18} />;
    case 'image':
      return <HomeworkFileImageIcon size={18} />;
    case 'audio':
      return <HomeworkFileAudioIcon size={18} />;
    case 'video':
      return <HomeworkFileVideoIcon size={18} />;
    case 'link':
      return <HomeworkLinkIcon size={18} />;
    default:
      return <HomeworkFileLinesIcon size={18} />;
  }
};

export const TemplateMaterialsSection: FC<TemplateMaterialsSectionProps> = ({ mediaBlock, onMediaBlockChange }) => {
  const [pendingLink, setPendingLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentAddedAtMap, setAttachmentAddedAtMap] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

  const attachments = useMemo(() => mediaBlock.attachments ?? [], [mediaBlock.attachments]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    setAttachmentAddedAtMap((previous) => {
      const nextMap: Record<string, number> = { ...previous };
      let hasChanges = false;

      attachments.forEach((attachment) => {
        if (!nextMap[attachment.id]) {
          nextMap[attachment.id] = Date.now();
          hasChanges = true;
        }
      });

      Object.keys(nextMap).forEach((attachmentId) => {
        const exists = attachments.some((attachment) => attachment.id === attachmentId);
        if (!exists) {
          delete nextMap[attachmentId];
          hasChanges = true;
        }
      });

      return hasChanges ? nextMap : previous;
    });
  }, [attachments]);

  const appendAttachments = (items: HomeworkAttachment[]) => {
    if (items.length === 0) return;
    const addedAt = Date.now();
    setAttachmentAddedAtMap((previous) => {
      const nextMap: Record<string, number> = { ...previous };
      items.forEach((item) => {
        nextMap[item.id] = addedAt;
      });
      return nextMap;
    });

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

  const openAttachment = (attachment: HomeworkAttachment) => {
    if (typeof window === 'undefined') return;
    const url = resolveHomeworkStorageUrl(attachment.url);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadAttachment = (attachment: HomeworkAttachment) => {
    if (typeof document === 'undefined') return;
    const link = document.createElement('a');
    link.href = resolveHomeworkStorageUrl(attachment.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = resolveTemplateMaterialDisplayName(attachment);
    document.body.append(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePickFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const pickedFiles = Array.from(fileList);
    const oversizedFiles = pickedFiles.filter((file) => file.size > MAX_TEMPLATE_MATERIAL_FILE_SIZE_BYTES);
    const validFiles = pickedFiles.filter((file) => file.size <= MAX_TEMPLATE_MATERIAL_FILE_SIZE_BYTES);

    if (validFiles.length === 0) {
      setError(
        oversizedFiles.length > 0
          ? `Каждый файл должен быть до 50MB. Не подходят: ${oversizedFiles.map((file) => file.name).join(', ')}`
          : 'Выберите хотя бы один файл',
      );
      return;
    }

    setError(null);
    setUploading(true);

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

      const problems: string[] = [];
      if (oversizedFiles.length > 0) {
        problems.push(`Больше 50MB: ${oversizedFiles.map((file) => file.name).join(', ')}`);
      }
      if (failedNames.length > 0) {
        problems.push(`Не загрузились: ${failedNames.join(', ')}`);
      }
      if (problems.length > 0) {
        setError(problems.join('. '));
      }
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : '';
      setError(message ? `Не удалось загрузить файлы: ${message}` : 'Не удалось загрузить файлы');
    } finally {
      setUploading(false);
    }
  };

  const addLink = () => {
    const attachment = createAttachmentFromUrl(pendingLink);
    if (!attachment) {
      setError('Укажите корректную ссылку в формате https://...');
      return;
    }
    setError(null);
    appendAttachments([attachment]);
    setPendingLink('');
  };

  const materialItems = useMemo(
    () =>
      attachments.map((attachment) => {
        const kind = resolveTemplateMaterialKind(attachment);
        const isLink = kind === 'link';
        const title = resolveTemplateMaterialDisplayName(attachment);
        const relativeTimeLabel = formatTemplateMaterialAddedAt(attachmentAddedAtMap[attachment.id], kind, now);
        const details = isLink
          ? `${resolveTemplateMaterialLinkSubtitle(attachment)} • ${relativeTimeLabel}`
          : `${formatTemplateMaterialSize(attachment.size)} • ${relativeTimeLabel}`;
        return {
          attachment,
          kind,
          isLink,
          title,
          details,
        };
      }),
    [attachmentAddedAtMap, attachments, now],
  );

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

      {materialItems.length > 0 ? (
        <div className={styles.materialsList}>
          {materialItems.map((item) => (
            <article key={item.attachment.id} className={styles.materialCard}>
              <div className={`${styles.typeBadge} ${TYPE_BADGE_CLASS_MAP[item.kind]}`}>{resolveTypeIcon(item.kind)}</div>
              <div className={styles.materialContent}>
                <h4 className={styles.materialTitle} title={item.title}>
                  {item.title}
                </h4>
                <p className={styles.materialMeta} title={item.details}>
                  {item.details}
                </p>
              </div>
              <div className={styles.materialActions}>
                {item.isLink ? (
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.actionOpen}`}
                    onClick={() => openAttachment(item.attachment)}
                    aria-label={`Открыть ссылку ${item.title}`}
                  >
                    <HomeworkArrowUpRightFromSquareIcon size={12} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.actionOpen}`}
                      onClick={() => openAttachment(item.attachment)}
                      aria-label={`Открыть файл ${item.title}`}
                    >
                      {item.kind === 'audio' ? <HomeworkPlayIcon size={12} /> : <HomeworkEyeIcon size={12} />}
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.actionDownload}`}
                      onClick={() => downloadAttachment(item.attachment)}
                      aria-label={`Скачать файл ${item.title}`}
                    >
                      <HomeworkDownloadIcon size={12} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.actionDelete}`}
                  onClick={() => removeAttachment(item.attachment.id)}
                  aria-label={`Удалить материал ${item.title}`}
                >
                  <HomeworkTrashIcon size={12} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <label className={styles.uploadArea}>
        <input
          type="file"
          className={styles.fileInput}
          accept={TEMPLATE_MATERIAL_FILE_ACCEPT}
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
        <span>{TEMPLATE_MATERIAL_FILE_HINT}</span>
        <span className={styles.uploadButton}>{uploading ? 'Загружаю…' : 'Выбрать файлы'}</span>
      </label>

      <div className={styles.orDivider}>
        <span className={styles.orDividerLine} />
        <span className={styles.orDividerText}>ИЛИ</span>
        <span className={styles.orDividerLine} />
      </div>

      <div className={styles.linkRow}>
        <input
          type="url"
          className={styles.linkInput}
          placeholder="Вставьте ссылку на материал..."
          value={pendingLink}
          onChange={(event) => setPendingLink(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addLink();
          }}
        />
        <button
          type="button"
          className={styles.linkAddButton}
          onClick={addLink}
          disabled={!pendingLink.trim()}
        >
          <HomeworkLinkIcon size={12} /> Добавить
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
    </section>
  );
};
