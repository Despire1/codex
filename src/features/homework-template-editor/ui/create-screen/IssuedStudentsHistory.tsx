import { FC, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeworkAssignment } from '../../../../entities/types';
import { Ellipsis } from '../../../../shared/ui/Ellipsis/Ellipsis';
import { AnchoredPopover } from '../../../../shared/ui/AnchoredPopover/AnchoredPopover';
import {
  resolveAssignmentStudentAvatarColor,
  resolveAssignmentStudentAvatarTextColor,
} from '../../../../widgets/homeworks/teacher/model/lib/assignmentPresentation';
import styles from './IssuedStudentsHistory.module.css';

type IssuedStudentStatusTone = 'success' | 'warning' | 'muted';

type IssuedStudentItem = {
  assignmentId: number;
  studentId: number;
  name: string;
  avatarLabel: string;
  avatarColor: string;
  avatarTextColor: string;
  photoUrl: string | null;
  statusLabel: string;
  statusTone: IssuedStudentStatusTone;
};

const CHIP_GAP = 12;

const getStudentInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'У';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

const resolveStudentName = (assignment: HomeworkAssignment) =>
  assignment.studentName?.trim() || assignment.studentUsername?.trim() || `Ученик #${assignment.studentId}`;

const isIssuedAssignment = (assignment: HomeworkAssignment) =>
  assignment.status !== 'DRAFT' && assignment.status !== 'SCHEDULED';

const resolveAssignmentSortTs = (assignment: HomeworkAssignment) => {
  const source =
    assignment.sentAt ??
    assignment.reviewedAt ??
    assignment.latestSubmissionSubmittedAt ??
    assignment.updatedAt ??
    assignment.createdAt;
  const ts = source ? new Date(source).getTime() : Number.NaN;
  return Number.isFinite(ts) ? ts : 0;
};

const resolveIssuedStudentStatus = (
  assignment: HomeworkAssignment,
): { label: string; tone: IssuedStudentStatusTone } => {
  if (
    assignment.status === 'REVIEWED' ||
    assignment.status === 'SUBMITTED' ||
    assignment.status === 'IN_REVIEW' ||
    assignment.latestSubmissionStatus === 'SUBMITTED' ||
    assignment.latestSubmissionStatus === 'REVIEWED'
  ) {
    return { label: 'Сдано', tone: 'success' };
  }

  if (assignment.status === 'RETURNED' || assignment.latestSubmissionStatus === 'DRAFT') {
    return { label: 'В работе', tone: 'warning' };
  }

  return { label: 'Не начато', tone: 'muted' };
};

const buildIssuedStudentItems = (assignments: HomeworkAssignment[]): IssuedStudentItem[] => {
  const latestByStudentId = new Map<number, HomeworkAssignment>();

  assignments
    .filter(isIssuedAssignment)
    .forEach((assignment) => {
      const studentId = Number(assignment.studentId);
      if (!Number.isFinite(studentId) || studentId <= 0) return;
      const current = latestByStudentId.get(studentId);
      if (!current || resolveAssignmentSortTs(assignment) > resolveAssignmentSortTs(current)) {
        latestByStudentId.set(studentId, assignment);
      }
    });

  return Array.from(latestByStudentId.values())
    .sort((left, right) => {
      const tsDiff = resolveAssignmentSortTs(right) - resolveAssignmentSortTs(left);
      if (tsDiff !== 0) return tsDiff;
      return resolveStudentName(left).localeCompare(resolveStudentName(right), 'ru');
    })
    .map((assignment) => {
      const name = resolveStudentName(assignment);
      const avatarColor = resolveAssignmentStudentAvatarColor(assignment);
      const status = resolveIssuedStudentStatus(assignment);
      const photoUrlCandidate = (assignment as HomeworkAssignment & { photoUrl?: string | null }).photoUrl;

      return {
        assignmentId: assignment.id,
        studentId: assignment.studentId,
        name,
        avatarLabel: getStudentInitials(name),
        avatarColor,
        avatarTextColor: resolveAssignmentStudentAvatarTextColor(avatarColor),
        photoUrl: typeof photoUrlCandidate === 'string' && photoUrlCandidate.trim().length > 0 ? photoUrlCandidate : null,
        statusLabel: status.label,
        statusTone: status.tone,
      };
    });
};

interface IssuedStudentCardProps {
  item: IssuedStudentItem;
}

const IssuedStudentCard: FC<IssuedStudentCardProps> = ({ item }) => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className={styles.studentCard}
      onClick={() => navigate(`/homeworks/assignments/${item.assignmentId}`)}
      aria-label={`Открыть задание ученика ${item.name}`}
    >
    <div className={styles.avatarFrame}>
      {item.photoUrl ? (
        <img src={item.photoUrl} alt={item.name} className={styles.avatarImage} />
      ) : (
        <div
          className={styles.avatarFallback}
          style={{ background: item.avatarColor, color: item.avatarTextColor }}
          aria-hidden="true"
        >
          {item.avatarLabel}
        </div>
      )}
    </div>

    <div className={styles.studentMeta}>
      <Ellipsis className={styles.studentName} title={item.name}>
        {item.name}
      </Ellipsis>
      <p className={`${styles.studentStatus} ${styles[`studentStatus_${item.statusTone}`]}`}>{item.statusLabel}</p>
    </div>
    </button>
  );
};

interface IssuedStudentsHistoryProps {
  assignments: HomeworkAssignment[];
  expectedCount?: number;
}

export const IssuedStudentsHistory: FC<IssuedStudentsHistoryProps> = ({ assignments, expectedCount }) => {
  const items = useMemo(() => {
    const builtItems = buildIssuedStudentItems(assignments);
    if (!Number.isFinite(expectedCount) || (expectedCount ?? 0) < 0) {
      return builtItems;
    }
    return builtItems.slice(0, expectedCount);
  }, [assignments, expectedCount]);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [overflowAnchorEl, setOverflowAnchorEl] = useState<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (!items.length) {
      setVisibleCount(0);
      return;
    }

    const rowNode = rowRef.current;
    if (!rowNode) {
      setVisibleCount(items.length);
      return;
    }

    const calculateVisibleCount = () => {
      const containerWidth = rowNode.clientWidth;
      if (containerWidth <= 0) {
        setVisibleCount(items.length);
        return;
      }

      const rawCardWidth = getComputedStyle(rowNode).getPropertyValue('--issued-student-card-width').trim();
      const cardWidth = Number.parseFloat(rawCardWidth);
      const normalizedCardWidth = Number.isFinite(cardWidth) && cardWidth > 0 ? cardWidth : 138;
      const availableSlots = Math.max(1, Math.floor((containerWidth + CHIP_GAP) / (normalizedCardWidth + CHIP_GAP)));
      const nextVisibleCount =
        items.length <= availableSlots
          ? items.length
          : Math.max(0, availableSlots - 1);

      setVisibleCount(nextVisibleCount);
    };

    calculateVisibleCount();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      calculateVisibleCount();
    });
    observer.observe(rowNode);

    return () => {
      observer.disconnect();
    };
  }, [items]);

  useLayoutEffect(() => {
    if (overflowAnchorEl && visibleCount >= items.length) {
      setOverflowAnchorEl(null);
    }
  }, [items.length, overflowAnchorEl, visibleCount]);

  if (!items.length) return null;

  const visibleItems = items.slice(0, visibleCount);
  const hiddenItems = items.slice(visibleCount);

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <span className={styles.label}>Выдано ученикам</span>
      </div>

      <div className={styles.row} ref={rowRef}>
        {visibleItems.map((item) => (
          <IssuedStudentCard key={`${item.studentId}_${item.assignmentId}`} item={item} />
        ))}

        {hiddenItems.length > 0 ? (
          <button
            type="button"
            className={styles.moreButton}
            onClick={(event) => setOverflowAnchorEl(event.currentTarget)}
            aria-haspopup="dialog"
            aria-expanded={Boolean(overflowAnchorEl)}
            aria-label={`Показать ещё ${hiddenItems.length} учеников`}
          >
            +{hiddenItems.length}
          </button>
        ) : null}
      </div>

      <AnchoredPopover
        isOpen={Boolean(overflowAnchorEl)}
        anchorEl={overflowAnchorEl}
        onClose={() => setOverflowAnchorEl(null)}
        side="bottom"
        align="start"
        offset={10}
        className={styles.popover}
      >
        <div className={styles.popoverContent}>
          <div className={styles.popoverHeader}>
            <strong>Остальные ученики</strong>
            <span>{hiddenItems.length}</span>
          </div>

          <div className={styles.popoverList}>
            {hiddenItems.map((item) => (
              <IssuedStudentCard key={`overflow_${item.studentId}_${item.assignmentId}`} item={item} />
            ))}
          </div>
        </div>
      </AnchoredPopover>
    </section>
  );
};
