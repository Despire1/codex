export const messages = {
  ru: {
    // ─── Common ──────────────────────────────────────────────────
    'common.close': 'Закрыть',
    'common.back': 'Назад',
    'common.next': 'Дальше',
    'common.skip': 'Пропустить',
    'common.gotIt': 'Понятно',
    'common.continue': 'Продолжить',

    // ─── Welcome modal — Teacher (web + TWA) ────────────────────
    'welcome.title': 'Добро пожаловать в TeacherBot',
    'welcome.subtitle':
      'Здесь вы ведёте учеников, расписание и домашки в одном месте — а Telegram-бот сам напоминает вам и вашим ученикам.',
    'welcome.bullets.intro': 'За минуту покажем главное:',
    'welcome.bullets.1': 'Где смотреть расписание и оплаты',
    'welcome.bullets.2': 'Как добавить ученика и выдать домашку',
    'welcome.bullets.3': 'Как настроить автоматические напоминания',
    'welcome.cta.tour': 'Показать на примере',
    'welcome.cta.skip': 'Я сам разберусь',

    // ─── Product Tour — controls ────────────────────────────────
    'tour.controls.next': 'Дальше',
    'tour.controls.back': 'Назад',
    'tour.controls.skip': 'Пропустить тур',
    'tour.controls.progress': 'Шаг {step} из {total}',
    'tour.controls.finish': 'Готово',

    // ─── Product Tour — Teacher Web (5 steps) ───────────────────
    'tour.step1.title': 'Здесь живут пять разделов',
    'tour.step1.body':
      'Главная — сводка дня. Расписание — календарь уроков. Ученики — карточки с историей. Домашки — шаблоны и проверка заданий. Настройки — уведомления, оплата, Telegram. Между разделами можно переключаться в любой момент — данные не потеряются.',

    'tour.step2.title': 'Создавайте что угодно отсюда',
    'tour.step2.body':
      'Эта кнопка открывает меню: добавить ученика, поставить урок, выдать домашку или собрать новый шаблон. Удобно, когда не хочется искать нужный раздел. На десктопе работает горячая клавиша ⌘K — командная палитра.',

    'tour.step3.title': 'Лента — что произошло за день',
    'tour.step3.body':
      'Ученик подтвердил урок, прислал домашнее задание, оплатил месяц — всё попадает сюда. Открывается одной кнопкой и не отвлекает поп-апами.',

    'tour.step5.title': 'Telegram-бот делает рутину за вас',
    'tour.step5.body':
      'TeacherBot в Telegram сам напоминает ученикам про урок и оплату, принимает сданные домашки и подтверждает занятия. Подключите его в настройках — и забудьте про напоминания вручную.',

    'tour.finish.title': 'Готово, начинаем 🚀',
    'tour.finish.body': 'Вы знаете, где что находится. Если что-то забудется — нажмите «?» в правом верхнем углу.',
    'tour.finish.cta': 'Перейти к первым шагам',

    // ─── Product Tour — Teacher Telegram WebApp (3 steps) ───────
    'tour.twa.step1.title': 'Пять разделов внизу',
    'tour.twa.step1.body':
      'Главная, Расписание, Ученики, Домашки, Настройки. Переключайтесь между ними в любой момент — данные сохранятся.',

    'tour.twa.step2.title': 'Главная кнопка действия',
    'tour.twa.step2.body':
      'Через неё вы добавляете учеников, ставите уроки и выдаёте домашки — не надо искать по разделам.',

    'tour.twa.finish.title': 'Поехали 🚀',
    'tour.twa.finish.body': 'Если что-то забудется — нажмите «?» в правом верхнем углу.',

    // ─── Welcome + Tour — Student (3 steps) ─────────────────────
    'student.welcome.title': 'Привет! Это ваш кабинет',
    'student.welcome.subtitle.withTeacher':
      'Здесь будут появляться домашние задания от {teacherName}. Покажем, где их найти и как сдавать.',
    'student.welcome.subtitle.withoutTeacher':
      'Здесь будут появляться домашние задания от вашего преподавателя. Покажем, где их найти и как сдавать.',
    'student.welcome.cta.tour': 'Показать',
    'student.welcome.cta.skip': 'Я сам',

    'student.tour.step1.title': 'Главная — что нужно сделать сейчас',
    'student.tour.step1.body':
      'Здесь видно ближайшее задание и сколько времени до дедлайна. Когда задание появится, его можно открыть прямо отсюда.',

    'student.tour.step2.title': 'Все ваши задания — на одной вкладке',
    'student.tour.step2.body':
      'Активные, проверенные и просроченные. Нажмите на задание, чтобы открыть его, прикрепить файлы или ответ и отправить преподавателю.',

    'student.tour.step3.title': 'Не пропустите дедлайн',
    'student.tour.step3.body':
      'В настройках включите push-уведомления и проверьте часовой пояс. Преподаватель и бот напишут в Telegram, когда будет новое задание или приближается срок сдачи.',

    'student.tour.finish.title': 'Готово',
    'student.tour.finish.body': 'Когда появится первое задание, оно будет на главной. Удачи в учёбе ✨',

    // ─── Contextual hints — Teacher ─────────────────────────────
    'hint.teacher.schedule.create.title': 'Урок ставится в один клик',
    'hint.teacher.schedule.create.body':
      'Кликните на свободный слот — откроется форма с подставленным временем. Или нажмите «+» в шапке.',

    'hint.teacher.schedule.views.title': 'Три режима просмотра',
    'hint.teacher.schedule.views.body':
      'День — для оперативной работы, неделя — для нагрузки, месяц — для планирования. Выбор сохраняется автоматически.',

    'hint.teacher.student.tabs.title': 'Всё про ученика — на одной карточке',
    'hint.teacher.student.tabs.body':
      'Уроки, домашки, оплаты и заметки. Изменения подтянутся сами — переключаться можно без сохранения.',

    'hint.teacher.homework.modes.title': 'Три режима выдачи',
    'hint.teacher.homework.modes.body':
      'Сразу — отправить ученику прямо сейчас. После урока — бот выдаст автоматически, как только урок пройдёт. По расписанию — в нужный день и час. Особенно удобно для регулярных учеников.',

    'hint.teacher.homework.templates.title': 'Шаблон — это домашка, которую можно переиспользовать',
    'hint.teacher.homework.templates.body': 'Соберите упражнения один раз и выдавайте в один клик любому ученику.',

    'hint.teacher.settings.notifications.title': 'Бот напомнит ученикам сам',
    'hint.teacher.settings.notifications.body':
      'За сутки и утром в день урока — про занятие. По вашему графику — про оплату. Тексты можно переписать под свой стиль.',

    'hint.teacher.settings.billing.title': 'Триал 14 дней включён',
    'hint.teacher.settings.billing.body':
      'После — $790/мес, можно отключить в любой момент. Все ваши данные сохранятся.',

    // ─── Contextual hints — Student ─────────────────────────────
    'hint.student.homework.open.title': 'Откройте задание, чтобы сдать',
    'hint.student.homework.open.body': 'Внутри — описание, файлы преподавателя и кнопка отправить ответ.',

    'hint.student.homework.statuses.title': 'Цвет показывает статус',
    'hint.student.homework.statuses.body': 'Серый — новое, оранжевый — приближается дедлайн, зелёный — проверено.',

    'hint.student.settings.teachers.title': 'У вас несколько преподавателей?',
    'hint.student.settings.teachers.body': 'Переключайтесь между кабинетами — задания и история разделены по каждому.',

    // ─── Help menu ──────────────────────────────────────────────
    'help.menu.contextHints': 'Подсказки по этому экрану',
    'help.menu.restartTour': 'Перезапустить тур',
    'help.menu.resetHints': 'Сбросить все подсказки',
    'help.menu.changelog': 'Что нового',
    'help.menu.support': 'Связаться с поддержкой',
    'help.contextHints.empty': 'Для этого экрана подсказок пока нет.',
    'help.title': 'Помощь',
  },
  en: {} as Record<string, string>,
} as const;

export type Locale = keyof typeof messages;
export type MessageKey = keyof (typeof messages)['ru'];
