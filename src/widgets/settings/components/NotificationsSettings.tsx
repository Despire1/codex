import { FC, useState } from 'react';
import { Teacher } from '../../../entities/types';
import {
  CalendarIcon,
  ContentCopyOutlinedIcon,
  NotificationsNoneOutlinedIcon,
  PersonOutlineIcon,
  SettingsIcon,
} from '../../../icons/MaterialIcons';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../SettingsSection.module.css';
import { StudentNotificationTemplates } from './StudentNotificationTemplates';

interface NotificationsSettingsProps {
  teacher: Teacher;
  onChange: (patch: Partial<Teacher>) => void;
  onSaveNow: (patch: Partial<Teacher>) => Promise<{ ok: boolean; error?: string }>;
}

type NotificationsPane = 'me' | 'student' | 'templates';

const lessonReminderOptions = [5, 10, 15, 30, 60, 120];
const paymentDelayOptions = [2, 6, 12, 24, 48];
const paymentRepeatOptions = [24, 48, 72];
const paymentMaxOptions = [1, 2, 3, 5];
const homeworkOverdueMaxOptions = [1, 2, 3, 5];

export const NotificationsSettings: FC<NotificationsSettingsProps> = ({ teacher, onChange, onSaveNow }) => {
  const [activePane, setActivePane] = useState<NotificationsPane>('me');
  const studentSectionDisabled = !teacher.studentNotificationsEnabled;

  return (
    <div className={styles.moduleStack}>
      <div className={styles.sectionTabs}>
        <button
          type="button"
          className={`${styles.sectionTabButton} ${activePane === 'me' ? styles.sectionTabButtonActive : ''}`}
          onClick={() => setActivePane('me')}
        >
          Мне
        </button>
        <button
          type="button"
          className={`${styles.sectionTabButton} ${activePane === 'student' ? styles.sectionTabButtonActive : ''}`}
          onClick={() => setActivePane('student')}
        >
          Ученику
        </button>
        <button
          type="button"
          className={`${styles.sectionTabButton} ${activePane === 'templates' ? styles.sectionTabButtonActive : ''}`}
          onClick={() => setActivePane('templates')}
        >
          Шаблоны сообщений
        </button>
      </div>

      {activePane === 'me' ? (
        <>
          <section className={styles.settingsCard}>
            <div className={styles.sectionHeader}>
              <div className={`${styles.sectionIcon} ${styles.sectionIconBlue}`}>
                <NotificationsNoneOutlinedIcon width={20} height={20} />
              </div>
              <div className={styles.sectionHeaderCopy}>
                <h2 className={styles.sectionHeading}>Напоминания о занятии</h2>
                <p className={styles.sectionDescription}>Получать уведомления перед уроками</p>
              </div>
            </div>

            <div className={styles.cardStack}>
              <div className={styles.infoRow}>
                <div>
                  <div className={styles.infoRowTitle}>Напоминания о предстоящем уроке</div>
                  <div className={styles.infoRowDescription}>Telegram-уведомление или PWA Push перед началом.</div>
                </div>
                <label className={`${controls.switch} ${styles.switchControl}`}>
                  <input
                    type="checkbox"
                    checked={teacher.lessonReminderEnabled}
                    onChange={(event) => onChange({ lessonReminderEnabled: event.target.checked })}
                  />
                  <span className={controls.slider} />
                </label>
              </div>

              {teacher.lessonReminderEnabled ? (
                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel}>За сколько минут до урока</label>
                  <select
                    className={`${controls.input} ${styles.fieldInput}`}
                    value={teacher.lessonReminderMinutes}
                    onChange={(event) => onChange({ lessonReminderMinutes: Number(event.target.value) })}
                  >
                    {lessonReminderOptions.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} минут
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.sectionHeader}>
              <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}>
                <CalendarIcon width={20} height={20} />
              </div>
              <div className={styles.sectionHeaderCopy}>
                <h2 className={styles.sectionHeading}>Сводки</h2>
                <p className={styles.sectionDescription}>Ежедневная информация о занятиях</p>
              </div>
            </div>

            <div className={styles.cardStack}>
              <div className={styles.infoRow}>
                <div>
                  <div className={styles.infoRowTitle}>Сводка на сегодня</div>
                  <div className={styles.infoRowDescription}>Список занятий на текущий день и неоплаченные уроки.</div>
                </div>
                <label className={`${controls.switch} ${styles.switchControl}`}>
                  <input
                    type="checkbox"
                    checked={teacher.dailySummaryEnabled}
                    onChange={(event) => onChange({ dailySummaryEnabled: event.target.checked })}
                  />
                  <span className={controls.slider} />
                </label>
              </div>

              {teacher.dailySummaryEnabled ? (
                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel}>Время отправки сводки на сегодня</label>
                  <input
                    className={`${controls.input} ${styles.fieldInput}`}
                    type="time"
                    value={teacher.dailySummaryTime}
                    onChange={(event) => onChange({ dailySummaryTime: event.target.value })}
                  />
                </div>
              ) : null}

              <div className={styles.infoRow}>
                <div>
                  <div className={styles.infoRowTitle}>Сводка на завтра</div>
                  <div className={styles.infoRowDescription}>Список занятий на следующий день.</div>
                </div>
                <label className={`${controls.switch} ${styles.switchControl}`}>
                  <input
                    type="checkbox"
                    checked={teacher.tomorrowSummaryEnabled}
                    onChange={(event) => onChange({ tomorrowSummaryEnabled: event.target.checked })}
                  />
                  <span className={controls.slider} />
                </label>
              </div>

              {teacher.tomorrowSummaryEnabled ? (
                <div className={styles.fieldBlock}>
                  <label className={styles.fieldLabel}>Время отправки сводки на завтра</label>
                  <input
                    className={`${controls.input} ${styles.fieldInput}`}
                    type="time"
                    value={teacher.tomorrowSummaryTime}
                    onChange={(event) => onChange({ tomorrowSummaryTime: event.target.value })}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {activePane === 'student' ? (
        <>
          <section className={styles.settingsCard}>
            <div className={styles.sectionHeader}>
              <div className={`${styles.sectionIcon} ${styles.sectionIconGreen}`}>
                <PersonOutlineIcon width={20} height={20} />
              </div>
              <div className={styles.sectionHeaderCopy}>
                <h2 className={styles.sectionHeading}>Общие уведомления ученику</h2>
                <p className={styles.sectionDescription}>Базовые параметры отправки</p>
              </div>
            </div>

            <div className={styles.infoRow}>
              <div>
                <div className={styles.infoRowTitle}>Напоминания ученикам о занятиях</div>
                <div className={styles.infoRowDescription}>Главный переключатель всех уведомлений ученику.</div>
              </div>
              <label className={`${controls.switch} ${styles.switchControl}`}>
                <input
                  type="checkbox"
                  checked={teacher.studentNotificationsEnabled}
                  onChange={(event) => onChange({ studentNotificationsEnabled: event.target.checked })}
                />
                <span className={controls.slider} />
              </label>
            </div>
          </section>

          <section className={`${styles.settingsCard} ${studentSectionDisabled ? styles.disabledSection : ''}`}>
            <div className={styles.sectionHeader}>
              <div className={`${styles.sectionIcon} ${styles.sectionIconWarm}`}>
                <SettingsIcon width={20} height={20} />
              </div>
              <div className={styles.sectionHeaderCopy}>
                <h2 className={styles.sectionHeading}>Напоминания об оплате</h2>
                <p className={styles.sectionDescription}>Автоматические уведомления о платежах</p>
              </div>
            </div>

            <div className={styles.cardStack}>
              <div className={styles.infoRow}>
                <div>
                  <div className={styles.infoRowTitle}>Автоматические напоминания ученику об оплате</div>
                  <div className={styles.infoRowDescription}>Учитываются только завершённые и неоплаченные занятия.</div>
                </div>
                <label className={`${controls.switch} ${styles.switchControl}`}>
                  <input
                    type="checkbox"
                    checked={teacher.globalPaymentRemindersEnabled}
                    onChange={(event) => onChange({ globalPaymentRemindersEnabled: event.target.checked })}
                    disabled={studentSectionDisabled}
                  />
                  <span className={controls.slider} />
                </label>
              </div>

              {teacher.globalPaymentRemindersEnabled ? (
                <>
                  <div className={styles.fieldGridThree}>
                    <div className={styles.fieldBlock}>
                      <label className={styles.fieldLabel}>Отправлять через</label>
                      <select
                        className={`${controls.input} ${styles.fieldInput}`}
                        value={teacher.paymentReminderDelayHours}
                        onChange={(event) => onChange({ paymentReminderDelayHours: Number(event.target.value) })}
                        disabled={studentSectionDisabled}
                      >
                        {paymentDelayOptions.map((hours) => (
                          <option key={hours} value={hours}>
                            {hours} ч
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <label className={styles.fieldLabel}>Повторять</label>
                      <select
                        className={`${controls.input} ${styles.fieldInput}`}
                        value={teacher.paymentReminderRepeatHours}
                        onChange={(event) => onChange({ paymentReminderRepeatHours: Number(event.target.value) })}
                        disabled={studentSectionDisabled}
                      >
                        {paymentRepeatOptions.map((hours) => (
                          <option key={hours} value={hours}>
                            каждые {hours} ч
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.fieldBlock}>
                      <label className={styles.fieldLabel}>Максимум напоминаний</label>
                      <select
                        className={`${controls.input} ${styles.fieldInput}`}
                        value={teacher.paymentReminderMaxCount}
                        onChange={(event) => onChange({ paymentReminderMaxCount: Number(event.target.value) })}
                        disabled={studentSectionDisabled}
                      >
                        {paymentMaxOptions.map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className={styles.fieldGridTwo}>
                    <div className={styles.infoRowCompact}>
                      <span className={styles.infoRowCompactTitle}>Уведомлять меня об авто-напоминаниях</span>
                      <label className={`${controls.switch} ${styles.switchControl}`}>
                        <input
                          type="checkbox"
                          checked={teacher.notifyTeacherOnAutoPaymentReminder}
                          onChange={(event) => onChange({ notifyTeacherOnAutoPaymentReminder: event.target.checked })}
                          disabled={studentSectionDisabled}
                        />
                        <span className={controls.slider} />
                      </label>
                    </div>

                    <div className={styles.infoRowCompact}>
                      <span className={styles.infoRowCompactTitle}>Уведомлять меня о ручных напоминаниях</span>
                      <label className={`${controls.switch} ${styles.switchControl}`}>
                        <input
                          type="checkbox"
                          checked={teacher.notifyTeacherOnManualPaymentReminder}
                          onChange={(event) => onChange({ notifyTeacherOnManualPaymentReminder: event.target.checked })}
                          disabled={studentSectionDisabled}
                        />
                        <span className={controls.slider} />
                      </label>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className={`${styles.settingsCard} ${studentSectionDisabled ? styles.disabledSection : ''}`}>
            <div className={styles.sectionHeader}>
              <div className={`${styles.sectionIcon} ${styles.sectionIconIndigo}`}>
                <ContentCopyOutlinedIcon width={20} height={20} />
              </div>
              <div className={styles.sectionHeaderCopy}>
                <h2 className={styles.sectionHeading}>Домашка</h2>
                <p className={styles.sectionDescription}>Уведомления о домашних заданиях</p>
              </div>
            </div>

            <div className={styles.cardStack}>
              <div className={styles.infoRowCompact}>
                <span className={styles.infoRowCompactTitle}>Уведомлять при выдаче домашки</span>
                <label className={`${controls.switch} ${styles.switchControl}`}>
                  <input
                    type="checkbox"
                    checked={teacher.homeworkNotifyOnAssign}
                    onChange={(event) => onChange({ homeworkNotifyOnAssign: event.target.checked })}
                    disabled={studentSectionDisabled}
                  />
                  <span className={controls.slider} />
                </label>
              </div>

              {teacher.homeworkNotifyOnAssign ? (
                <>
                  <div className={styles.infoRowCompact}>
                    <span className={styles.infoRowCompactTitle}>Напоминание за 24 часа</span>
                    <label className={`${controls.switch} ${styles.switchControl}`}>
                      <input
                        type="checkbox"
                        checked={teacher.homeworkReminder24hEnabled}
                        onChange={(event) => onChange({ homeworkReminder24hEnabled: event.target.checked })}
                        disabled={studentSectionDisabled}
                      />
                      <span className={controls.slider} />
                    </label>
                  </div>

                  <div className={styles.infoRowCompact}>
                    <span className={styles.infoRowCompactTitle}>Утром в день дедлайна</span>
                    <label className={`${controls.switch} ${styles.switchControl}`}>
                      <input
                        type="checkbox"
                        checked={teacher.homeworkReminderMorningEnabled}
                        onChange={(event) => onChange({ homeworkReminderMorningEnabled: event.target.checked })}
                        disabled={studentSectionDisabled}
                      />
                      <span className={controls.slider} />
                    </label>
                  </div>

                  {teacher.homeworkReminderMorningEnabled ? (
                    <div className={styles.fieldBlock}>
                      <label className={styles.fieldLabel}>Время утреннего напоминания</label>
                      <input
                        className={`${controls.input} ${styles.fieldInput}`}
                        type="time"
                        value={teacher.homeworkReminderMorningTime}
                        onChange={(event) => onChange({ homeworkReminderMorningTime: event.target.value })}
                        disabled={studentSectionDisabled}
                      />
                    </div>
                  ) : null}

                  <div className={styles.infoRowCompact}>
                    <span className={styles.infoRowCompactTitle}>Напоминание за 3 часа</span>
                    <label className={`${controls.switch} ${styles.switchControl}`}>
                      <input
                        type="checkbox"
                        checked={teacher.homeworkReminder3hEnabled}
                        onChange={(event) => onChange({ homeworkReminder3hEnabled: event.target.checked })}
                        disabled={studentSectionDisabled}
                      />
                      <span className={controls.slider} />
                    </label>
                  </div>

                  <div className={styles.infoRowCompact}>
                    <span className={styles.infoRowCompactTitle}>Просрочено: напоминать ежедневно</span>
                    <label className={`${controls.switch} ${styles.switchControl}`}>
                      <input
                        type="checkbox"
                        checked={teacher.homeworkOverdueRemindersEnabled}
                        onChange={(event) => onChange({ homeworkOverdueRemindersEnabled: event.target.checked })}
                        disabled={studentSectionDisabled}
                      />
                      <span className={controls.slider} />
                    </label>
                  </div>

                  {teacher.homeworkOverdueRemindersEnabled ? (
                    <div className={styles.fieldGridTwo}>
                      <div className={styles.fieldBlock}>
                        <label className={styles.fieldLabel}>Время overdue-напоминания</label>
                        <input
                          className={`${controls.input} ${styles.fieldInput}`}
                          type="time"
                          value={teacher.homeworkOverdueReminderTime}
                          onChange={(event) => onChange({ homeworkOverdueReminderTime: event.target.value })}
                          disabled={studentSectionDisabled}
                        />
                      </div>

                      <div className={styles.fieldBlock}>
                        <label className={styles.fieldLabel}>Максимум overdue-напоминаний</label>
                        <select
                          className={`${controls.input} ${styles.fieldInput}`}
                          value={teacher.homeworkOverdueReminderMaxCount}
                          onChange={(event) => onChange({ homeworkOverdueReminderMaxCount: Number(event.target.value) })}
                          disabled={studentSectionDisabled}
                        >
                          {homeworkOverdueMaxOptions.map((count) => (
                            <option key={count} value={count}>
                              {count}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {activePane === 'templates' ? (
        <section className={styles.settingsCard}>
          <StudentNotificationTemplates teacher={teacher} onChange={onChange} onSaveNow={onSaveNow} />
        </section>
      ) : null}
    </div>
  );
};
