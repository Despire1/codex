import { FC } from 'react';
import {
  HomeworkFileArrowUpIcon,
  HomeworkLayerGroupIcon,
  HomeworkLinkIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkPenToSquareIcon,
  HomeworkPuzzlePieceIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import { CreateTemplateType } from '../../model/lib/createTemplateScreen';
import styles from './TemplateTypeSection.module.css';

interface TemplateTypeSectionProps {
  selectedType: CreateTemplateType;
  onSelectType: (type: CreateTemplateType) => void;
}

type TemplateTypeCard = {
  id: CreateTemplateType;
  title: string;
  description: string;
  icon: JSX.Element;
  tone: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'gray';
};

const CARDS: TemplateTypeCard[] = [
  {
    id: 'TEST',
    title: 'Тест',
    description: 'Вопросы с вариантами ответов',
    icon: <HomeworkListCheckIcon size={18} />,
    tone: 'blue',
  },
  {
    id: 'WRITTEN',
    title: 'Письменное',
    description: 'Эссе, сочинение, текст',
    icon: <HomeworkPenToSquareIcon size={18} />,
    tone: 'purple',
  },
  {
    id: 'ORAL',
    title: 'Устное',
    description: 'Аудио или видео ответ',
    icon: <HomeworkMicrophoneIcon size={18} />,
    tone: 'green',
  },
  {
    id: 'FILE',
    title: 'Файл',
    description: 'Загрузка документа/фото',
    icon: <HomeworkFileArrowUpIcon size={18} />,
    tone: 'orange',
  },
  {
    id: 'COMBO',
    title: 'Комбо',
    description: 'Несколько типов',
    icon: <HomeworkPuzzlePieceIcon size={18} />,
    tone: 'pink',
  },
  {
    id: 'EXTERNAL',
    title: 'Внешняя',
    description: 'Ссылка на платформу',
    icon: <HomeworkLinkIcon size={18} />,
    tone: 'gray',
  },
];

export const TemplateTypeSection: FC<TemplateTypeSectionProps> = ({ selectedType, onSelectType }) => {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>
          <HomeworkLayerGroupIcon size={16} />
        </span>
        <h2 className={styles.sectionTitle}>Тип задания</h2>
      </div>

      <div className={styles.grid}>
        {CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`${styles.card} ${styles[`card${card.tone.charAt(0).toUpperCase() + card.tone.slice(1)}`]} ${
              selectedType === card.id ? styles.cardSelected : ''
            }`}
            onClick={() => onSelectType(card.id)}
          >
            <span className={styles.cardIcon}>{card.icon}</span>
            <span className={styles.cardTitle}>{card.title}</span>
            <span className={styles.cardDescription}>{card.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
