import { FC } from 'react';
import { HomeworkAttachment, HomeworkBlockMedia } from '../../../../entities/types';
import { pluralizeRu } from '../../../../shared/lib/pluralizeRu';
import { resolveHomeworkStorageUrl } from '../../../homework-submit/model/upload';
import {
  formatTemplateMaterialSize,
  resolveTemplateMaterialDisplayName,
  resolveTemplateMaterialKind,
  resolveTemplateMaterialLinkSubtitle,
  type TemplateMaterialKind,
} from '../../model/lib/templateMaterials';
import {
  HomeworkArrowUpRightFromSquareIcon,
  HomeworkFileAudioIcon,
  HomeworkFileImageIcon,
  HomeworkFileLinesIcon,
  HomeworkFilePdfIcon,
  HomeworkFileVideoIcon,
  HomeworkFileWordIcon,
  HomeworkLinkIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './AssignmentMaterialsReadOnlySection.module.css';

interface AssignmentMaterialsReadOnlySectionProps {
  mediaBlock: HomeworkBlockMedia;
}

const TYPE_ICON_CLASS_MAP: Record<TemplateMaterialKind, string> = {
  pdf: styles.iconTonePdf,
  word: styles.iconToneWord,
  image: styles.iconToneImage,
  audio: styles.iconToneAudio,
  video: styles.iconToneVideo,
  link: styles.iconToneLink,
  file: styles.iconToneFile,
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

const resolveAttachmentMeta = (attachment: HomeworkAttachment, kind: TemplateMaterialKind) => {
  if (kind === 'link') return resolveTemplateMaterialLinkSubtitle(attachment);
  return formatTemplateMaterialSize(Number(attachment.size) || 0);
};

export const AssignmentMaterialsReadOnlySection: FC<AssignmentMaterialsReadOnlySectionProps> = ({ mediaBlock }) => {
  const attachments = mediaBlock.attachments ?? [];

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Материалы</h2>
          <p className={styles.subtitle}>
            {attachments.length > 0
              ? `${pluralizeRu(attachments.length, { one: 'материал', few: 'материала', many: 'материалов' })} прикреплено`
              : 'Дополнительные материалы не добавлены'}
          </p>
        </div>
      </div>

      {attachments.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>Материалы пока отсутствуют</strong>
          <p>Если добавить файлы или ссылки, они появятся здесь в режиме просмотра.</p>
        </div>
      ) : (
        <div className={styles.materialsList}>
          {attachments.map((attachment) => {
            const kind = resolveTemplateMaterialKind(attachment);
            return (
              <a
                key={attachment.id}
                className={styles.materialCard}
                href={resolveHomeworkStorageUrl(attachment.url)}
                target="_blank"
                rel="noreferrer"
              >
                <span className={`${styles.materialIcon} ${TYPE_ICON_CLASS_MAP[kind]}`}>{resolveTypeIcon(kind)}</span>

                <span className={styles.materialMeta}>
                  <strong>{resolveTemplateMaterialDisplayName(attachment)}</strong>
                  <span>{resolveAttachmentMeta(attachment, kind)}</span>
                </span>

                <span className={styles.materialAction}>
                  <HomeworkArrowUpRightFromSquareIcon size={14} />
                </span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
};
