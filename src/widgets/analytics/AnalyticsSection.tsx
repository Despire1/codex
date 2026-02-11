import { type FC, type SVGProps } from 'react';
import styles from './AnalyticsSection.module.css';

type FeatureTone = 'blue' | 'green' | 'purple';
type InfoTone = 'orange' | 'pink';

interface FeatureItem {
  title: string;
  description: string;
  tone: FeatureTone;
  Icon: FC<SVGProps<SVGSVGElement>>;
}

interface InfoItem {
  title: string;
  description: string;
  tone: InfoTone;
  Icon: FC<SVGProps<SVGSVGElement>>;
}

const ChartLineIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64V400c0 44.2 35.8 80 80 80H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H80c-8.8 0-16-7.2-16-16V64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z" />
  </svg>
);

const SparklesIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M156.5 447.7 143.9 477.2c-18.7-9.5-35.9-21.2-51.5-34.9l22.7-22.7c12.5 10.9 26.4 20.4 41.4 28.1zM64.3 156.5c7.8-14.9 17.2-28.8 28.1-41.5L69.7 92.3c-13.7 15.6-25.5 32.8-34.9 51.5l29.5 12.7zm333.5 263.1c-13.9 12-29.4 22.3-46.1 30.4l11.9 29.8c20.7-9.9 39.8-22.6 56.9-37.6l-22.7-22.6zM447.7 355.5c-7.8 14.9-17.2 28.8-28.1 41.5l22.7 22.7c13.7-15.6 25.5-32.9 34.9-51.5l-29.5-12.7zM240 471.4c-18.8-1.4-37-5.2-54.1-11.1l-12.6 29.5c21.1 7.5 43.5 12.2 66.8 13.6v-32zM272 40.6c18.8 1.4 36.9 5.2 54.1 11.1l12.6-29.5C317.7 14.7 295.3 10 272 8.5v32.1zm125 51.8 22.7-22.7c-15.6-13.7-32.8-25.5-51.5-34.9l-12.6 29.5c14.8 7.8 28.8 17.2 41.4 28.1zm74.4 179.6h32.1c-1.4-21.2-5.4-41.7-11.7-61.1L462 190.8c5 15.7 8.2 32.2 9.4 49.2zM40.6 240H8.5c1.4-23.3 6.2-45.7 13.7-66.8l29.5 12.7c-5.9 17.1-9.7 35.3-11.1 54.1zM321.2 462c-15.7 5-32.2 8.2-49.2 9.4v32.1c21.2-1.4 41.7-5.4 61.1-11.7L321.2 462zM92.4 397c-12-13.9-22.3-29.4-30.4-46.1l-29.8 11.9c9.9 20.7 22.6 39.8 37.6 56.9L92.4 397z" />
    <circle cx="256" cy="364" r="28" />
    <path d="M263.7 312h-16c-6.6 0-12-5.4-12-12 0-71 77.4-63.9 77.4-107.8 0-20-17.8-40.2-57.4-40.2-29.1 0-44.3 9.6-59.2 28.7-3.9 5-11.1 6-16.2 2.4l-13.1-9.2c-5.6-3.9-6.9-11.8-2.6-17.2 21.2-27.2 46.4-44.7 91.2-44.7 52.3 0 97.4 29.8 97.4 80.2 0 67.6-77.4 63.5-77.4 107.8 0 6.6-5.4 12-12 12z" />
  </svg>
);

const ChartPieIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 576 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M304 240V16.6c0-9 7-16.6 16-16.6C443.7 0 544 100.3 544 224c0 9-7.6 16-16.6 16H304zM32 272C32 150.7 122.1 50.3 239 34.3c9.2-1.3 17 6.1 17 15.4V288L412.5 444.5c6.7 6.7 6.2 17.7-1.5 23.1C371.8 495.6 323.8 512 272 512C139.5 512 32 404.6 32 272zm526.4 16c9.3 0 16.6 7.8 15.4 17-7.7 55.9-34.6 105.6-73.9 142.3-6 5.6-15.4 5.2-21.2-.7L320 288H558.4z" />
  </svg>
);

const TrophyIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 576 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M400 0H176c-26.5 0-48.1 21.8-47.1 48.2.2 5.3.4 10.6.7 15.8H24C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7 44.3 43.1 98.3 64.8 138.1 75.8 23.4 6.5 39.4 26 39.4 45.6 0 20.9-17 37.9-37.9 37.9H192c-17.7 0-32 14.3-32 32s14.3 32 32 32H384c17.7 0 32-14.3 32-32s-14.3-32-32-32H357.9C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6 39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24H446.4c.3-5.2.5-10.4.7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112h84.4c9.1 90.1 29.2 150.3 51.9 190.6-24.9-11-50.8-26.5-73.2-48.3-32-31.1-58-76-63-142.3zm415.2 142.3c-22.4 21.8-48.3 37.3-73.2 48.3 22.7-40.3 42.8-100.5 51.9-190.6h84.4c-5.1 66.3-31.1 111.2-63 142.3z" />
  </svg>
);

const CalendarCheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M128 0c17.7 0 32 14.3 32 32V64H288V32c0-17.7 14.3-32 32-32s32 14.3 32 32V64h48c26.5 0 48 21.5 48 48v48H0V112C0 85.5 21.5 64 48 64H96V32c0-17.7 14.3-32 32-32zM0 192H448V464c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V192zM329 305c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-95 95-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L329 305z" />
  </svg>
);

const ClockIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120V256c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2V120c0-13.3-10.7-24-24-24s-24 10.7-24 24z" />
  </svg>
);

const FileExportIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 576 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M0 64C0 28.7 28.7 0 64 0H224V128c0 17.7 14.3 32 32 32H384V288H216c-13.3 0-24 10.7-24 24s10.7 24 24 24H384V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V64zM384 336V288H494.1l-39-39c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l80 80c9.4 9.4 9.4 24.6 0 33.9l-80 80c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l39-39H384zm0-208H256V0L384 128z" />
  </svg>
);

const BellIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M224 0c-17.7 0-32 14.3-32 32V51.2C119 66 64 130.6 64 208v18.8c0 47-17.3 92.4-48.5 127.6l-7.4 8.3c-8.4 9.4-10.4 22.9-5.3 34.4S19.4 416 32 416H416c12.6 0 24-7.4 29.2-18.9s3.1-25-5.3-34.4l-7.4-8.3C401.3 319.2 384 273.9 384 226.8V208c0-77.4-55-142-128-156.8V32c0-17.7-14.3-32-32-32zm45.3 493.3c12-12 18.7-28.3 18.7-45.3H224 160c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7z" />
  </svg>
);

const primaryFeatures: FeatureItem[] = [
  {
    title: 'Финансовые отчёты',
    description: 'Детальная статистика доходов по периодам и ученикам',
    tone: 'blue',
    Icon: ChartPieIcon,
  },
  {
    title: 'Успеваемость',
    description: 'Отслеживание прогресса и достижений учеников',
    tone: 'green',
    Icon: TrophyIcon,
  },
  {
    title: 'Посещаемость',
    description: 'Статистика проведённых и пропущенных занятий',
    tone: 'purple',
    Icon: CalendarCheckIcon,
  },
];

const infoItems: InfoItem[] = [
  {
    title: 'Временные графики',
    description: 'Визуализация нагрузки по дням и часам',
    tone: 'orange',
    Icon: ClockIcon,
  },
  {
    title: 'Экспорт данных',
    description: 'Выгрузка отчётов в Excel и PDF',
    tone: 'pink',
    Icon: FileExportIcon,
  },
];

const featureToneClass: Record<FeatureTone, string> = {
  blue: styles.featureBlue,
  green: styles.featureGreen,
  purple: styles.featurePurple,
};

const featureIconToneClass: Record<FeatureTone, string> = {
  blue: styles.featureIconBlue,
  green: styles.featureIconGreen,
  purple: styles.featureIconPurple,
};

const infoToneClass: Record<InfoTone, string> = {
  orange: styles.infoOrange,
  pink: styles.infoPink,
};

const infoIconToneClass: Record<InfoTone, string> = {
  orange: styles.infoIconOrange,
  pink: styles.infoIconPink,
};

export const AnalyticsSection: FC = () => {
  return (
    <section className={styles.page}>
      <div id="coming-soon-section" className={styles.wrapper}>
        <div className={styles.inner}>
          <div className={styles.card}>
            <div className={styles.bgGlowTop} aria-hidden />
            <div className={styles.bgGlowBottom} aria-hidden />

            <div className={styles.content}>
              <div className={styles.heroIconBlock}>
                <div className={styles.heroIconCard}>
                  <ChartLineIcon className={styles.heroIcon} />
                </div>
                <div className={styles.sparklesBadge}>
                  <SparklesIcon className={styles.sparklesIcon} />
                </div>
              </div>

              <div className={styles.titleBlock}>
                <h2 className={styles.title}>
                  Скоро у нас появится модуль
                  <br />
                  "Аналитика"!
                </h2>
                <p className={styles.subtitle}>Здесь Вы сможете отследить свои финансы и успеваемость учеников</p>
              </div>

              <div className={styles.featuresGrid}>
                {primaryFeatures.map((feature) => (
                  <article key={feature.title} className={`${styles.featureCard} ${featureToneClass[feature.tone]}`}>
                    <div className={`${styles.featureIconShell} ${featureIconToneClass[feature.tone]}`}>
                      <feature.Icon className={styles.featureIcon} />
                    </div>
                    <h3 className={styles.featureTitle}>{feature.title}</h3>
                    <p className={styles.featureDescription}>{feature.description}</p>
                  </article>
                ))}
              </div>

              <div className={styles.infoGrid}>
                {infoItems.map((item) => (
                  <article key={item.title} className={`${styles.infoCard} ${infoToneClass[item.tone]}`}>
                    <div className={`${styles.infoIconShell} ${infoIconToneClass[item.tone]}`}>
                      <item.Icon className={styles.infoIcon} />
                    </div>
                    <div>
                      <h4 className={styles.infoTitle}>{item.title}</h4>
                      <p className={styles.infoDescription}>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className={styles.ctaWrap}>
                <div className={styles.ctaChip}>
                  <BellIcon className={styles.ctaIcon} />
                  <span className={styles.ctaText}>Мы сообщим вам, когда модуль будет готов</span>
                </div>
              </div>
            </div>
          </div>

          <p className={styles.bottomText}>
            Хотите повлиять на функционал?{' '}
            <a href="#" className={styles.bottomLink}>
              Оставьте пожелание
            </a>
          </p>
        </div>
      </div>
    </section>
  );
};
