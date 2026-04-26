import { FC, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { HomeworkAssignment } from '../../entities/types';
import { resolveHomeworkAssignmentWorkflow } from '../../entities/homework-assignment/model/lib/workflow';
import styles from './StudentDashboardSection.module.css';

type StudentDashboardSectionProps = {
  activeTeacherName?: string | null;
};

type Summary = {
  activeCount: number;
  overdueCount: number;
  submittedCount: number;
  reviewedCount: number;
  dueTodayCount: number;
};

const emptySummary: Summary = {
  activeCount: 0,
  overdueCount: 0,
  submittedCount: 0,
  reviewedCount: 0,
  dueTodayCount: 0,
};

const parseDeadlineMs = (assignment: HomeworkAssignment) => {
  if (!assignment.deadlineAt) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(assignment.deadlineAt);
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
};

const pickNextAssignment = (assignments: HomeworkAssignment[]): HomeworkAssignment | null => {
  const actionable = assignments.filter((assignment) => {
    const workflow = resolveHomeworkAssignmentWorkflow(assignment);
    return workflow.needsStudentAction;
  });
  if (!actionable.length) return null;
  return actionable.slice().sort((left, right) => parseDeadlineMs(left) - parseDeadlineMs(right))[0] ?? null;
};

const formatDeadlineLabel = (assignment: HomeworkAssignment) => {
  if (!assignment.deadlineAt) return 'без дедлайна';
  const date = new Date(assignment.deadlineAt);
  if (Number.isNaN(date.getTime())) return 'без дедлайна';
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs < 0) return 'просрочено';
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const timeLabel = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
  if (sameDay) return `сегодня в ${timeLabel}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  if (isTomorrow) return `завтра в ${timeLabel}`;
  const dateLabel = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
  return `${dateLabel} в ${timeLabel}`;
};

export const StudentDashboardSection: FC<StudentDashboardSectionProps> = ({ activeTeacherName }) => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getStudentHomeworkSummaryV2().catch(() => emptySummary),
      api
        .listStudentHomeworkAssignmentsV2({ filter: 'active', limit: 20 })
        .catch(() => ({ items: [] as HomeworkAssignment[] })),
    ])
      .then(([summaryResult, assignmentsResult]) => {
        if (cancelled) return;
        setSummary(summaryResult);
        setAssignments(assignmentsResult.items ?? []);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const nextAssignment = useMemo(() => pickNextAssignment(assignments), [assignments]);

  return (
    <section className={styles.page}>
      <div className={styles.headline}>Главная</div>
      {activeTeacherName ? <div className={styles.teacher}>Преподаватель: {activeTeacherName}</div> : null}

      {nextAssignment ? (
        <article className={styles.heroCard}>
          <div className={styles.heroHeader}>
            <span>Ближайшее задание</span>
            <span className={styles.heroDeadlineBadge}>⏰ {formatDeadlineLabel(nextAssignment)}</span>
          </div>
          <h3 className={styles.heroTitle}>{nextAssignment.title || 'Домашнее задание'}</h3>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.heroPrimaryAction}
              onClick={() => navigate(`/homeworks/${nextAssignment.id}`)}
            >
              Открыть задание
            </button>
            <button type="button" className={styles.heroSecondaryAction} onClick={() => navigate('/homeworks')}>
              Все задания
            </button>
          </div>
        </article>
      ) : !loading ? (
        <article className={styles.emptyHero}>
          <h3 className={styles.emptyHeroTitle}>Добро пожаловать! 👋</h3>
          <p className={styles.emptyHeroSubtitle}>
            {activeTeacherName
              ? `Преподаватель ${activeTeacherName} ещё не выдал домашнее задание. Когда появится — оно будет здесь.`
              : 'Здесь будут появляться задания от преподавателя.'}
          </p>
          <ul className={styles.emptyHeroChecklist}>
            <li>💬 Проверьте Telegram — скоро придёт первое задание.</li>
            <li>🔔 Включите push-уведомления, чтобы не пропустить дедлайны.</li>
            <li>⚙️ Загляните в «Настройки» — укажите часовой пояс и язык.</li>
          </ul>
          <div className={styles.emptyHeroActions}>
            <button type="button" className={styles.heroSecondaryAction} onClick={() => navigate('/settings')}>
              Открыть настройки
            </button>
          </div>
        </article>
      ) : null}

      {!loading &&
      (summary.activeCount > 0 ||
        summary.dueTodayCount > 0 ||
        summary.overdueCount > 0 ||
        summary.reviewedCount > 0) ? (
        <>
          <h4 className={styles.statsHeading}>Статистика</h4>
          <div className={styles.grid}>
            <article className={styles.card}>
              <div className={styles.label}>Активные</div>
              <div className={styles.value}>{summary.activeCount}</div>
            </article>
            <article className={styles.card}>
              <div className={styles.label}>Дедлайн сегодня</div>
              <div className={styles.value}>{summary.dueTodayCount}</div>
            </article>
            <article className={styles.card}>
              <div className={styles.label}>Просроченные</div>
              <div className={styles.value}>{summary.overdueCount}</div>
            </article>
            <article className={styles.card}>
              <div className={styles.label}>Проверенные</div>
              <div className={styles.value}>{summary.reviewedCount}</div>
            </article>
          </div>
        </>
      ) : null}

      <div className={styles.quickActions}>
        <button type="button" className={styles.quickAction} onClick={() => navigate('/homeworks')}>
          <span>Все мои задания</span>
          <span className={styles.quickActionArrow}>→</span>
        </button>
        <button type="button" className={styles.quickAction} onClick={() => navigate('/settings')}>
          <span>Настройки</span>
          <span className={styles.quickActionArrow}>→</span>
        </button>
      </div>
    </section>
  );
};
