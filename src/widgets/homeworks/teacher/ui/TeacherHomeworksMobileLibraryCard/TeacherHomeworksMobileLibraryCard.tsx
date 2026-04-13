import { KeyboardEvent, MouseEvent, type FC } from 'react';
import { HomeworkTemplate } from '../../../../../entities/types';
import {
  HomeworkClockIcon,
  HomeworkEllipsisVerticalIcon,
  HomeworkFileLinesIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkPaperclipIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { AddOutlinedIcon } from '../../../../../icons/MaterialIcons';
import {
  resolveMobileTemplateDescription,
  resolveMobileTemplateMeta,
  resolveMobileTemplateTopicLabel,
  resolveMobileTemplateTopicTone,
  resolveMobileTemplateUpdatedLabel,
} from '../../model/lib/mobileHomeworkPresentation';
import styles from './TeacherHomeworksMobileLibraryCard.module.css';

interface TeacherHomeworksMobileLibraryCardProps {
  template: HomeworkTemplate;
  onOpen: (template: HomeworkTemplate) => void;
  onIssue: (template: HomeworkTemplate) => void;
  onMore: (template: HomeworkTemplate) => void;
}

const toToneClassName = (value: string) => `${value[0].toUpperCase()}${value.slice(1)}`;

const renderMetricIcon = (icon: string) => {
  switch (icon) {
    case 'questions':
      return <HomeworkListCheckIcon size={16} />;
    case 'paperclip':
      return <HomeworkPaperclipIcon size={16} />;
    case 'microphone':
      return <HomeworkMicrophoneIcon size={16} />;
    case 'file':
      return <HomeworkFileLinesIcon size={16} />;
    case 'clock':
    default:
      return <HomeworkClockIcon size={16} />;
  }
};

export const TeacherHomeworksMobileLibraryCard: FC<TeacherHomeworksMobileLibraryCardProps> = ({
  template,
  onOpen,
  onIssue,
  onMore,
}) => {
  const topicTone = resolveMobileTemplateTopicTone(template);
  const topicLabel = resolveMobileTemplateTopicLabel(template);
  const description = resolveMobileTemplateDescription(template);
  const meta = resolveMobileTemplateMeta(template);
  const metaItems = meta.slice(0, 2);
  const updatedLabel = resolveMobileTemplateUpdatedLabel(template);

  const handleCardActivate = () => onOpen(template);

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleCardActivate();
  };

  const stop = (event: MouseEvent<HTMLElement>) => event.stopPropagation();

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={handleCardActivate}
      onKeyDown={handleCardKeyDown}
      aria-label={`Открыть задание ${template.title}`}
    >
      <div className={styles.content}>
        <div className={styles.head}>
          <div className={styles.titleBlock}>
            <h3 className={styles.title}>{template.title}</h3>
          </div>

          <button
            type="button"
            className={styles.menuButton}
            onClick={(event) => {
              stop(event);
              onMore(template);
            }}
            aria-label="Действия с заданием"
          >
            <HomeworkEllipsisVerticalIcon size={18} />
          </button>
        </div>

        <div className={styles.metaLine}>
          {topicLabel ? (
            <span className={`${styles.topicBadge} ${styles[`topicBadge${toToneClassName(topicTone)}`]}`}>
              {topicLabel}
            </span>
          ) : null}
          {metaItems.map((item, index) => (
            <span key={`${template.id}_${item.label}_${index}`} className={styles.metaItem}>
              {(topicLabel || index > 0) ? <span className={styles.metaDot} aria-hidden /> : null}
              {index === 0 ? <span className={styles.metaIcon}>{renderMetricIcon(item.icon)}</span> : null}
              <span>{item.label}</span>
            </span>
          ))}
        </div>

        {description ? <p className={styles.description}>{description}</p> : null}
      </div>

      <div className={styles.footer}>
        <span className={styles.updatedLabel}>{updatedLabel}</span>

        <button
          type="button"
          className={styles.issueButton}
          onClick={(event) => {
            stop(event);
            onIssue(template);
          }}
        >
          <AddOutlinedIcon width={16} height={16} />
          <span>Выдать</span>
        </button>
      </div>
    </article>
  );
};
