import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import { useOnboardingState } from '../../features/onboarding/model/useOnboardingState';
import { useStudentsActions } from '../students/model/useStudentsActions';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import { useTimeZone } from '../../shared/lib/timezoneContext';
import { useIsMobile } from '../../shared/lib/useIsMobile';
import { useToast } from '../../shared/lib/toast';
import { api } from '../../shared/api/client';
import {
  buildOnboardingReminderMessage,
  type OnboardingReminderTemplate,
} from '../../shared/lib/onboardingReminder';
import { trackEvent } from '../../shared/lib/analytics';
import controls from '../../shared/styles/controls.module.css';
import { OnboardingHeroCard } from './OnboardingHeroCard';
import { OnboardingStepper } from './OnboardingStepper';
import { SendReminderSheet } from './SendReminderSheet';
import { ConnectTelegramSheet } from './ConnectTelegramSheet';
import styles from './OnboardingEmptyState.module.css';

type StepSource = 'hero_cta' | 'stepper' | 'quick_action';

const resolveStep = (hasStudent: boolean, hasLesson: boolean) => {
  if (!hasStudent) return 1 as const;
  if (!hasLesson) return 2 as const;
  return 3 as const;
};

const parseErrorCode = (error: unknown) => {
  if (!(error instanceof Error)) return null;
  try {
    const parsed = JSON.parse(error.message) as { message?: string };
    return parsed.message ?? error.message;
  } catch {
    return error.message;
  }
};

interface OnboardingEmptyStateProps {
  onRefreshSummary: () => void;
}

export const OnboardingEmptyState: FC<OnboardingEmptyStateProps> = ({ onRefreshSummary }) => {
  const onboarding = useOnboardingState();
  const { openCreateStudentModal } = useStudentsActions();
  const { openCreateLessonForStudent } = useLessonActions();
  const timeZone = useTimeZone();
  const { showToast } = useToast();
  const isMobile = useIsMobile(767);
  const device = isMobile ? 'mobile' : 'desktop';
  const [reminderOpen, setReminderOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [template, setTemplate] = useState<OnboardingReminderTemplate>('TODAY');
  const [isSending, setIsSending] = useState(false);
  const [reminderSource, setReminderSource] = useState<StepSource>('hero_cta');
  const shownRef = useRef(false);

  const hasStudent = Boolean(onboarding.createdStudent);
  const hasLesson = Boolean(onboarding.createdLesson);
  const step = resolveStep(hasStudent, hasLesson);
  const studentName = onboarding.createdStudent?.link.customName || 'ученик';
  const isTelegramReady = Boolean(onboarding.createdStudent?.student.isActivated);

  const reminderPreview = useMemo(() => {
    if (!onboarding.createdLesson) return 'Выберите шаблон, чтобы посмотреть текст.';
    return buildOnboardingReminderMessage({
      template,
      studentName,
      lessonStartAt: new Date(onboarding.createdLesson.startAt),
      timeZone,
    });
  }, [onboarding.createdLesson, studentName, template, timeZone]);

  useEffect(() => {
    if (!onboarding.isActive || shownRef.current) return;
    shownRef.current = true;
    trackEvent('onboarding_zero_shown', {
      userId: onboarding.teacherId,
      device,
    });
  }, [device, onboarding.isActive, onboarding.teacherId]);

  const trackStepClick = (nextStep: 1 | 2 | 3, source: StepSource) => {
    trackEvent('onboarding_step_clicked', {
      userId: onboarding.teacherId,
      device,
      step: nextStep,
      source,
    });
  };

  const handlePrimaryAction = (source: StepSource) => {
    trackStepClick(step, source);
    const variant = isMobile ? 'sheet' : 'modal';
    if (step === 1) {
      openCreateStudentModal({ source: 'onboarding_hero', variant });
      return;
    }
    if (step === 2) {
      openCreateLessonForStudent(onboarding.createdStudent?.student.id, {
        source: 'onboarding_hero',
        variant,
        skipNavigation: true,
      });
      return;
    }
    if (!hasLesson) return;
    setReminderSource(source);
    if (!isTelegramReady) {
      setConnectOpen(true);
      trackEvent('telegram_connect_started', { userId: onboarding.teacherId, device, source });
      return;
    }
    setReminderOpen(true);
  };

  const handleStepClick = (nextStep: 1 | 2 | 3) => {
    trackStepClick(nextStep, 'stepper');
    const variant = isMobile ? 'sheet' : 'modal';
    if (nextStep === 1) {
      openCreateStudentModal({ source: 'onboarding_stepper', variant });
      return;
    }
    if (nextStep === 2 && onboarding.createdStudent) {
      openCreateLessonForStudent(onboarding.createdStudent.student.id, {
        source: 'onboarding_stepper',
        variant,
        skipNavigation: true,
      });
      return;
    }
    if (nextStep === 3) {
      if (!hasLesson) return;
      setReminderSource('stepper');
      if (!isTelegramReady) {
        setConnectOpen(true);
        trackEvent('telegram_connect_started', { userId: onboarding.teacherId, device, source: 'stepper' });
        return;
      }
      setReminderOpen(true);
    }
  };

  const handleQuickAddStudent = () => {
    trackStepClick(step, 'quick_action');
    openCreateStudentModal({
      source: 'onboarding_quick_action',
      variant: isMobile ? 'sheet' : 'modal',
    });
  };

  const handleQuickCreateLesson = () => {
    trackStepClick(step, 'quick_action');
    openCreateLessonForStudent(onboarding.createdStudent?.student.id, {
      source: 'onboarding_quick_action',
      variant: isMobile ? 'sheet' : 'modal',
      skipNavigation: true,
    });
  };

  const handleSendReminder = async () => {
    if (!onboarding.createdLesson) return;
    setIsSending(true);
    trackEvent('reminder_send_started', {
      userId: onboarding.teacherId,
      device,
      source: reminderSource,
      template,
    });

    try {
      await api.sendLessonReminder({ lessonId: onboarding.createdLesson.id, template });
      showToast({ message: 'Напоминание отправлено. TeacherBot в деле 🚀', variant: 'success' });
      onboarding.setReminderSent(true);
      onRefreshSummary();
      trackEvent('reminder_send_success', { userId: onboarding.teacherId, device, source: reminderSource, template });
      trackEvent('onboarding_completed', { userId: onboarding.teacherId, device, source: reminderSource });
      if (!isTelegramReady) {
        trackEvent('telegram_connect_success', { userId: onboarding.teacherId, device, source: reminderSource });
      }
      setReminderOpen(false);
    } catch (error) {
      const code = parseErrorCode(error);
      if (code === 'student_not_activated' || code === 'notifications_disabled') {
        showToast({ message: 'Подключи Telegram, чтобы отправлять напоминания', variant: 'error' });
        trackEvent('telegram_connect_error', { userId: onboarding.teacherId, device, source: reminderSource });
        setReminderOpen(false);
        setConnectOpen(true);
      } else {
        showToast({ message: 'Не удалось отправить напоминание', variant: 'error' });
      }
      trackEvent('reminder_send_error', {
        userId: onboarding.teacherId,
        device,
        source: reminderSource,
        template,
        error: code ?? 'unknown',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className={styles.container}>
      <OnboardingHeroCard
        createdStudent={onboarding.createdStudent}
        createdLesson={onboarding.createdLesson}
        onPrimaryAction={() => handlePrimaryAction('hero_cta')}
      />
      <OnboardingStepper
        createdStudent={onboarding.createdStudent}
        createdLesson={onboarding.createdLesson}
        reminderSent={onboarding.reminderSent}
        onStepClick={handleStepClick}
      />
      <div className={styles.actionsCard}>
        <div className={styles.actionsTitle}>Быстрые действия</div>
        <div className={styles.actionsRow}>
          <button type="button" className={controls.secondaryButton} onClick={handleQuickAddStudent}>
            Добавить ученика
          </button>
          <button
            type="button"
            className={controls.secondaryButton}
            onClick={handleQuickCreateLesson}
            disabled={!onboarding.createdStudent}
          >
            Создать урок
          </button>
        </div>
      </div>

      <SendReminderSheet
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        template={template}
        onTemplateChange={setTemplate}
        previewText={reminderPreview}
        onSend={handleSendReminder}
        isSending={isSending}
        variant={isMobile ? 'sheet' : 'modal'}
      />

      <ConnectTelegramSheet
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onContinue={() => {
          setConnectOpen(false);
          setReminderOpen(true);
        }}
        studentUsername={onboarding.createdStudent?.student.username ?? null}
        variant={isMobile ? 'sheet' : 'modal'}
      />
    </section>
  );
};
