/* Design System Map — runtime data & renderers */

// ============================================
// DATA
// ============================================

const NAV = [
  {
    title: 'Начало',
    items: [
      { id: 'overview', label: 'Обзор' },
      { id: 'principles', label: 'Принципы' },
      { id: 'issues', label: 'Inconsistencies', badge: '7' },
    ],
  },
  {
    title: 'Основы',
    items: [
      { id: 'colors', label: 'Цвета и токены' },
      { id: 'typography', label: 'Типографика' },
      { id: 'spacing', label: 'Spacing и радиусы' },
      { id: 'shadows', label: 'Тени' },
      { id: 'icons', label: 'Иконки' },
    ],
  },
  {
    title: 'Компоненты',
    items: [
      { id: 'buttons', label: 'Buttons' },
      { id: 'inputs', label: 'Inputs & Select' },
      { id: 'checkbox', label: 'Checkbox / Switch' },
      { id: 'cards', label: 'Cards' },
      { id: 'badges', label: 'Badges' },
      { id: 'modal', label: 'Modal & Sheet' },
      { id: 'toast', label: 'Toast' },
      { id: 'avatar', label: 'Avatar & Tooltip' },
    ],
  },
  {
    title: 'Паттерны',
    items: [
      { id: 'layout', label: 'Layout / Sidebar' },
      { id: 'screens', label: 'Экраны' },
      { id: 'motion', label: 'Анимации' },
    ],
  },
];

const COLOR_GROUPS = [
  {
    name: 'Neutral / Slate',
    desc: 'Основа для layout, бордеров и текста.',
    colors: [
      { name: 'slate-900', token: '--color-slate-900', hex: '#0f172a', use: 'primary text, dark surfaces' },
      { name: 'slate-800', token: '--color-slate-800', hex: '#1f2937', use: 'dark surfaces' },
      { name: 'slate-700', token: '--color-slate-700', hex: '#334155', use: 'strong text' },
      { name: 'slate-600', token: '--color-slate-600', hex: '#475569', use: 'secondary text' },
      { name: 'slate-500', token: '--color-slate-500', hex: '#64748b', use: 'muted text' },
      { name: 'slate-400', token: '--color-slate-400', hex: '#94a3b8', use: 'placeholders, section titles' },
      { name: 'slate-300', token: '--color-slate-300', hex: '#cbd5e1', use: 'borders' },
      { name: 'slate-200', token: '--color-slate-200', hex: '#e2e8f0', use: 'borders, dividers' },
      { name: 'slate-100', token: '--color-slate-100', hex: '#f1f5f9', use: 'hover bg, chip bg' },
      { name: 'slate-50', token: '--color-slate-50', hex: '#f8fafc', use: 'page bg' },
      { name: 'ink-900', token: '--color-ink-900', hex: '#1b1c21', use: 'Telegram webapp text' },
    ],
  },
  {
    name: 'Gray (дубликат шкалы)',
    desc: 'Параллельная шкала gray — часто дублирует slate. Кандидат на унификацию.',
    colors: [
      { name: 'gray-900', token: '--color-gray-900', hex: '#111827', use: 'dark product panels' },
      { name: 'gray-500', token: '--color-gray-500', hex: '#6b7280', use: '' },
      { name: 'gray-250', token: '--color-gray-250', hex: '#e4e6eb', use: '' },
      { name: 'gray-200', token: '--color-gray-200', hex: '#e5e7eb', use: 'borders в homework editor' },
      { name: 'gray-100', token: '--color-gray-100', hex: '#f3f4f6', use: '' },
      { name: 'gray-50', token: '--color-gray-50', hex: '#f9fafb', use: 'question card bg' },
    ],
  },
  {
    name: 'Lime — product accent',
    desc: 'Текущий акцент для CTA, активного пункта меню, новых экранов.',
    colors: [
      { name: 'lime-500', token: '--color-lime-500 / --accent-primary', hex: '#a3e635', use: 'primary CTA, sidebar active' },
      { name: 'lime-600', token: '--color-lime-600 / --accent-primary-hover', hex: '#94d82d', use: 'hover / pressed' },
      { name: 'lime-400', token: '--color-lime-400 / --accent-primary-strong', hex: '#c4f33f', use: 'accent text highlight' },
      { name: 'lime-300', token: '--color-lime-300', hex: '#d9f99d', use: '' },
      { name: 'lime-100', token: '--color-lime-100 / --accent-primary-soft', hex: '#f7fee7', use: 'soft tinted bg' },
      { name: 'lime-050', token: '--color-lime-050 / --accent-primary-softest', hex: '#fbfef1', use: '' },
      { name: 'lime-900', token: '--color-lime-900 / --accent-primary-text', hex: '#111827', use: 'text on lime' },
      { name: 'hw-lime', token: 'local: --hw-lime', hex: '#bbff48', use: 'homework hero — ⚠ дубликат lime' },
    ],
  },
  {
    name: 'Blue — legacy',
    desc: 'Историческая палитра. Использовать осторожно: только в старом коде.',
    colors: [
      { name: 'primary', token: '--primary', hex: '#5b8def', use: 'legacy button gradient' },
      { name: 'primary-weak', token: '--primary-weak', hex: '#8eb7ff', use: 'focus ring' },
      { name: 'primary-strong', token: '--primary-strong', hex: '#3a6fdc', use: 'card title' },
      { name: 'blue-700', token: '--color-blue-700', hex: '#1d4ed8', use: '' },
      { name: 'blue-600', token: '--color-blue-600', hex: '#2563eb', use: 'focus, switch active' },
      { name: 'blue-200', token: '--color-blue-200', hex: '#bfdbfe', use: '' },
      { name: 'blue-100', token: '--color-blue-100', hex: '#e0ebff', use: 'ghost button bg' },
      { name: 'blue-50', token: '--color-blue-50', hex: '#eff6ff', use: '' },
      { name: 'sky-80', token: '--color-sky-80', hex: '#eef3ff', use: 'toast bg' },
      { name: 'indigo-100', token: '--color-indigo-100', hex: '#eef4ff', use: '' },
      { name: 'indigo-50', token: '--color-indigo-50', hex: '#eef2ff', use: '' },
    ],
  },
  {
    name: 'Semantic — success / error / warning',
    desc: 'Семантические цвета. emerald = успех, red = ошибка, orange = предупреждение.',
    colors: [
      { name: 'emerald-500', token: '--color-emerald-500', hex: '#10b981', use: 'success' },
      { name: 'emerald-50', token: '--color-emerald-50', hex: '#ecfdf3', use: 'success soft' },
      { name: 'green-700', token: '--color-green-700', hex: '#15803d', use: '' },
      { name: 'green-200', token: '--color-green-200', hex: '#bbf7d0', use: 'success border' },
      { name: 'red-700', token: '--color-red-700', hex: '#b91c1c', use: 'danger text' },
      { name: 'red-600', token: '--color-red-600', hex: '#dc2626', use: 'field error' },
      { name: 'red-500', token: '--color-red-500', hex: '#ef4444', use: 'danger icon' },
      { name: 'red-50', token: '--color-red-50', hex: '#fef2f2', use: 'danger bg' },
      { name: 'rose-200', token: '--color-rose-200', hex: '#fecdd3', use: 'danger border' },
      { name: 'orange-700', token: '--color-orange-700', hex: '#c2410c', use: '' },
      { name: 'orange-200', token: '--color-orange-200', hex: '#fed7aa', use: 'warning border' },
      { name: 'orange-50', token: '--color-orange-50', hex: '#fff7ed', use: 'warning bg' },
    ],
  },
];

const SPACING = [
  { name: 'space-4', v: '4px' }, { name: 'space-6', v: '6px' }, { name: 'space-8', v: '8px' },
  { name: 'space-10', v: '10px' }, { name: 'space-12', v: '12px' }, { name: 'space-14', v: '14px' },
  { name: 'space-16', v: '16px' }, { name: 'space-18', v: '18px' }, { name: 'space-20', v: '20px' },
  { name: 'space-24', v: '24px' }, { name: 'space-32', v: '32px' },
];
// ⚠ В коде нет числовой spacing-шкалы. Это наблюдаемые значения из CSS-модулей.

const RADII = [
  { name: 'radius-8', v: '8px', use: 'small icon buttons' },
  { name: 'radius-10', v: '10px', use: 'legacy button, input, pill' },
  { name: 'radius-12', v: '12px', use: 'card, new inputs, toggle' },
  { name: 'radius-14', v: '14px', use: 'toast, dropdown item' },
  { name: 'radius-16', v: '16px', use: 'modal, CTA lime, tight card' },
  { name: 'radius-18', v: '18px', use: 'live badges, secondary actions' },
  { name: 'radius-20', v: '20px', use: 'sidebar, media card' },
  { name: 'radius-22', v: '22px', use: 'dropdown panel' },
  { name: 'radius-24', v: '24px', use: 'auth card, BottomSheet top' },
  { name: 'radius-32', v: '32px', use: 'homework main card, section' },
  { name: 'radius-full', v: '999px', use: 'avatars, round buttons, pills' },
];

const SHADOWS = [
  { name: 'shadow-xs', v: '0 1px 2px var(--shadow-slate-900-08)', use: 'active nav item' },
  { name: 'shadow-sm', v: '0 8px 20px rgba(30, 36, 51, 0.04)', use: 'circular header button' },
  { name: 'shadow-md', v: '0 14px 30px var(--shadow-slate-900-06)', use: 'sidebar' },
  { name: 'shadow-lg', v: '0 18px 40px rgba(0, 0, 0, 0.12)', use: 'modal' },
  { name: 'shadow-card', v: '0 18px 44px rgba(40, 45, 61, 0.05)', use: 'homework/sidebar card' },
  { name: 'shadow-card-soft', v: '0 22px 56px rgba(40, 45, 61, 0.06)', use: 'auth card' },
  { name: 'shadow-primary', v: '0 6px 18px var(--shadow-primary-30)', use: 'legacy button' },
  { name: 'shadow-sheet', v: '0 -12px 32px rgba(17, 18, 20, 0.18)', use: 'BottomSheet' },
];

const TYPE_SAMPLES = [
  { name: 'Display', size: 44, weight: 800, ls: '-0.03em', sample: '128', info: 'font-size: 44px, weight: 800' },
  { name: 'Page title', size: 36, weight: 800, ls: '-0.03em', sample: 'Дизайн-система', info: 'doc page title' },
  { name: 'Section h2', size: 24, weight: 700, ls: '-0.02em', sample: 'Компоненты редактора', info: 'section-h2' },
  { name: 'Modal title', size: 22, weight: 700, ls: '-0.01em', sample: 'Добавить ученика', info: 'modal-title' },
  { name: 'Card title', size: 20, weight: 800, ls: '-0.02em', sample: 'Урок в понедельник', info: 'homework card title' },
  { name: 'Subtitle', size: 18, weight: 700, ls: '-0.005em', sample: 'Домашнее задание', info: 'modal header' },
  { name: 'Body', size: 14, weight: 400, ls: '0', sample: 'Обычный текст интерфейса, базовый размер.', info: 'default body, input font-size' },
  { name: 'Body-mobile', size: 16, weight: 400, ls: '0', sample: 'iOS-safe input size на мобильных.', info: '@media (max-width: 768px) inputs' },
  { name: 'Meta', size: 13, weight: 500, ls: '0', sample: 'Вспомогательный текст, чиповые подписи', info: 'card meta' },
  { name: 'Label', size: 12, weight: 600, ls: '0', sample: 'ПОДПИСЬ ПОЛЯ', info: 'field label' },
  { name: 'Caption', size: 11, weight: 700, ls: '0.08em', sample: 'SECTION / UPPERCASE', info: 'sidebar section title' },
];

// Icons — пиктограммы-SVG в стиле материал/штрих (абстрактные placeholders для категорий из кода)
const ICON_GROUPS = [
  {
    name: 'Навигация (sidebar)',
    icons: ['calendar', 'users', 'book', 'chart', 'settings', 'bell', 'home', 'search'],
  },
  {
    name: 'Действия в редакторе',
    icons: ['plus', 'pencil', 'trash', 'drag', 'copy', 'check', 'close', 'more'],
  },
  {
    name: 'Типы вопросов (homework)',
    icons: ['short', 'long', 'single', 'multi', 'number', 'table', 'sort', 'image'],
  },
  {
    name: 'Статусы',
    icons: ['paid', 'unpaid', 'pending', 'draft', 'archive', 'warn'],
  },
];

const ISSUES = [
  {
    level: 'critical',
    title: 'Два акцентных цвета в одном продукте — blue legacy и lime modern',
    desc: 'Shared Button и Input используют синий градиент и синий focus; homework/modal/sidebar — lime. На одном экране могут встретиться обе палитры одновременно.',
    fix: '1. Задекларировать lime единственным акцентом.\n2. Shared Button: переписать на --accent-primary / --accent-primary-text.\n3. Shared Input: переключить focus на --accent-primary.\n4. Удалить --primary / --primary-weak / --primary-strong из новых экранов.',
  },
  {
    level: 'critical',
    title: 'Дубликат шкалы lime: --color-lime-500 и local --hw-lime',
    desc: 'homework-template-view определяет свой lime #bbff48, отличный от глобального #a3e635. На hero homework цвет другой, чем в sidebar active.',
    fix: 'Унифицировать: удалить --hw-lime, использовать var(--accent-primary) или var(--color-lime-400). Или, если нужен более яркий hero, добавить --color-lime-450 глобально.',
  },
  {
    level: 'critical',
    title: 'Параллельные шкалы slate и gray',
    desc: '--color-slate-* и --color-gray-* описывают почти одно и то же (slate-200 ≠ gray-200 на 1-2 пункта). Используются непоследовательно: editor использует gray-*, layout — slate-*.',
    fix: 'Выбрать одну шкалу (рекомендуется slate). Для gray-* оставить алиас на 2 квартала, потом удалить.',
  },
  {
    level: 'warning',
    title: 'Checkbox / radio checked цвет захардкожен',
    desc: 'В Checkbox.module.css и TemplateQuestionsSection.module.css хардкод #a3e635 вместо var(--accent-primary).',
    fix: 'Заменить #a3e635 → var(--accent-primary), #111 → var(--accent-primary-text).',
  },
  {
    level: 'warning',
    title: 'Focus-ring несогласован',
    desc: 'В одних местах outline: 2px solid var(--color-blue-600); в других box-shadow: 0 0 0 2px var(--shadow-primary-12); в Input.module.css — outline: 2px solid var(--primary-weak).',
    fix: 'Ввести единый токен --focus-ring: 0 0 0 3px rgba(163, 230, 53, 0.35). Использовать box-shadow везде для совместимости с border-radius.',
  },
  {
    level: 'warning',
    title: 'Radius-хаос: 10 / 12 / 16 / 18 на одинаковых ролях',
    desc: 'Кнопки встречаются с 10px (legacy), 12px (controls), 16px (lime CTA). Input с 10px и 12px. Card с 12px и 32px без ясной логики.',
    fix: 'Фиксировать: input = 12, button = 14, card-compact = 16, card-hero = 24, modal = 20, sheet-top = 24. Обновить все модули.',
  },
  {
    level: 'notice',
    title: 'Нет единой spacing-шкалы',
    desc: 'CSS-модули используют произвольные 10/12/14/16/18/22/24/28/32px. Нет --space-N токенов.',
    fix: 'Ввести spacing-шкалу 2/4/6/8/12/16/20/24/32/40/48. Постепенный рефакторинг.',
  },
];

// ============================================
// RENDERERS
// ============================================

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

// --- Nav
function renderNav() {
  const nav = document.getElementById('nav');
  const brand = h('div', { class: 'nav-brand' },
    h('div', { class: 'nav-brand-logo' }, 'К'),
    h('div', null,
      h('div', { class: 'nav-brand-title' }, 'Codex DS'),
      h('div', { class: 'nav-brand-sub' }, 'Карта дизайн-системы')
    )
  );
  nav.appendChild(brand);

  NAV.forEach(group => {
    nav.appendChild(h('div', { class: 'nav-section-title' }, group.title));
    group.items.forEach(item => {
      const btn = h('button', {
        class: 'nav-link',
        'data-target': item.id,
        onclick: () => navigate(item.id),
      }, item.label);
      if (item.badge) btn.appendChild(h('span', { class: 'nav-link-badge' }, item.badge));
      nav.appendChild(btn);
    });
  });
}

function navigate(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  document.querySelectorAll('.nav-link').forEach(l =>
    l.classList.toggle('active', l.getAttribute('data-target') === id));
  if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  try { localStorage.setItem('ds_page', id); } catch {}
  window.scrollTo(0, 0);
}

// --- Swatch
function Swatch(c) {
  const el = h('div', { class: 'swatch', title: 'Click to copy ' + c.hex },
    h('div', { class: 'swatch-color', style: `background:${c.hex}` }),
    h('div', { class: 'swatch-meta' },
      h('div', { class: 'swatch-name' }, c.name),
      h('span', { class: 'swatch-token' }, c.token),
      h('span', { class: 'swatch-hex' }, c.hex + (c.use ? ' · ' + c.use : ''))
    )
  );
  el.addEventListener('click', () => {
    navigator.clipboard?.writeText(c.hex);
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1200);
  });
  return el;
}

function renderColors() {
  const root = document.getElementById('page-colors');
  COLOR_GROUPS.forEach(g => {
    root.appendChild(h('div', { class: 'section' },
      h('h3', { class: 'section-h2' }, g.name),
      h('p', { class: 'section-desc' }, g.desc),
      h('div', { class: 'swatch-grid' }, g.colors.map(Swatch))
    ));
  });
}

// --- Typography
function renderType() {
  const root = document.getElementById('page-typography');
  root.appendChild(h('div', { class: 'panel' },
    h('div', { class: 'panel-body' },
      TYPE_SAMPLES.map(t =>
        h('div', { class: 'type-row' },
          h('div', { class: 'type-meta' },
            h('span', { class: 'type-meta-name' }, t.name),
            h('span', { class: 'type-meta-info' }, t.info),
            h('span', { class: 'type-meta-info' }, `weight ${t.weight} · ls ${t.ls}`)
          ),
          h('div', {
            class: 'type-sample',
            style: `font-size:${t.size}px;font-weight:${t.weight};letter-spacing:${t.ls};line-height:1.25;`
          }, t.sample)
        )
      )
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Стек шрифтов'),
    h('p', { class: 'section-desc' },
      'Единственный стек, определён в global.css. Новые экраны не вводят новых шрифтов.'),
    h('pre', { class: 'demo-code', style: 'border-radius:12px' },
      'font-family: \'Inter\', system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif;')
  ));
}

// --- Scale cells
function renderSpacing() {
  const root = document.getElementById('page-spacing');
  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Spacing'),
    h('p', { class: 'section-desc' },
      'В коде нет --space-N шкалы. Это фактические значения, собранные из CSS-модулей (см. раздел Inconsistencies).'),
    h('div', { class: 'scale-grid' }, SPACING.map(s =>
      h('div', { class: 'scale-cell' },
        h('div', { class: 'scale-vis' },
          h('div', { class: 'scale-spacer', style: `width:${s.v}` })
        ),
        h('div', { class: 'scale-name' }, s.name),
        h('div', { class: 'scale-value' }, s.v)
      )
    ))
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Радиусы'),
    h('p', { class: 'section-desc' }, 'Все border-radius значения, встречающиеся в коде, с их типичным применением.'),
    h('div', { class: 'scale-grid' }, RADII.map(r =>
      h('div', { class: 'scale-cell' },
        h('div', { class: 'scale-vis' },
          h('div', { class: 'scale-box', style: `border-radius:${r.v}` })
        ),
        h('div', { class: 'scale-name' }, r.name),
        h('div', { class: 'scale-value' }, r.v),
        h('div', { class: 'mono-sm muted' }, r.use)
      )
    ))
  ));
}

function renderShadows() {
  const root = document.getElementById('page-shadows');
  root.appendChild(h('div', { class: 'scale-grid' }, SHADOWS.map(s =>
    h('div', { class: 'scale-cell shadow-cell' },
      h('div', { class: 'scale-vis' },
        h('div', { class: 'shadow-box', style: `box-shadow:${s.v}` })
      ),
      h('div', { class: 'scale-name' }, s.name),
      h('div', { class: 'scale-value', style: 'white-space:normal;word-break:break-all' }, s.v),
      h('div', { class: 'mono-sm muted' }, s.use)
    )
  )));
}

// --- Icons (inline SVG, абстрактные штриховые)
const ICON_SVG = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6"/><circle cx="17" cy="7" r="2.5"/><path d="M14 14c4 0 6 2 6 5"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h9a4 4 0 014 4v12H9a4 4 0 01-4-4V4z"/><path d="M5 16a4 4 0 014-4h9"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h16"/><rect x="6" y="10" width="3" height="8"/><rect x="11" y="6" width="3" height="12"/><rect x="16" y="13" width="3" height="5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.4.9a7 7 0 00-2-1.2L14 3h-4l-.5 2.5a7 7 0 00-2 1.2L5 5.8l-2 3.5 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-.9c.6.5 1.3.9 2 1.2L10 21h4l.5-2.5c.7-.3 1.4-.7 2-1.2l2.4.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 16V11a6 6 0 1112 0v5l1 2H5l1-2zM10 20a2 2 0 004 0"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-9z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/></svg>',
  drag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 011-1h11"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M6 18L18 6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  short: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="9" width="18" height="6" rx="2"/></svg>',
  long: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 9h12M6 12h12M6 15h7"/></svg>',
  single: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="16" r="3" fill="currentColor"/><path d="M14 8h7M14 16h7"/></svg>',
  multi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="6" height="6" rx="1"/><rect x="3" y="13" width="6" height="6" rx="1" fill="currentColor"/><path d="M13 8h8M13 16h8"/></svg>',
  number: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9l2-2v10M12 7h6M12 17h6M18 17v-4M18 13h-4v-3a2 2 0 012-2h2"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M3 15h18M10 5v14"/></svg>',
  sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 5v14M7 19l-3-3M7 5l3 3M17 19V5M17 5l3 3M17 19l-3-3"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 17l5-5 4 4 3-3 4 4"/></svg>',
  paid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>',
  unpaid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  draft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4h8l4 4v12H6z"/><path d="M14 4v4h4"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/></svg>',
};

function renderIcons() {
  const root = document.getElementById('page-icons');
  root.appendChild(h('div', { class: 'callout callout-tip' },
    h('span', { class: 'callout-ico' }, 'i'),
    h('div', null,
      'Библиотеки в коде: MUI Icons (@mui/icons-material), FontAwesome (regular/solid). Ниже — абстрактные плейсхолдеры для категорий в 24×24 штриховом стиле, которые сервис использует в разных местах.'
    )
  ));
  ICON_GROUPS.forEach(g => {
    root.appendChild(h('div', { class: 'section' },
      h('h3', { class: 'section-h2' }, g.name),
      h('div', { class: 'icon-grid' }, g.icons.map(i =>
        h('div', { class: 'icon-cell' },
          h('div', { html: ICON_SVG[i] || ICON_SVG.check }),
          h('div', { class: 'icon-name' }, i)
        )
      ))
    ));
  });
}

// --- Demo wrapper with tabs
function Demo(stage, code, props) {
  const tabs = [
    { id: 'preview', label: 'Preview' },
    { id: 'code', label: 'Code' },
  ];
  if (props) tabs.push({ id: 'props', label: 'Props' });

  const state = { active: 'preview' };
  const stageEl = h('div', { class: 'demo-stage center' }, stage);
  const codeEl = h('pre', { class: 'demo-code' }, h('code', { html: code }));
  const propsEl = props ? h('div', { class: 'demo-props' }, props) : null;

  const body = h('div', { class: 'demo-footer' });
  const tabsEl = h('div', { class: 'demo-tabs' });
  const contentEl = h('div', {});

  function update() {
    contentEl.innerHTML = '';
    if (state.active === 'code') contentEl.appendChild(codeEl);
    else if (state.active === 'props' && propsEl) contentEl.appendChild(propsEl);
    else contentEl.appendChild(h('div', { style: 'padding:16px;color:var(--doc-muted);font-size:12px' },
      'Переключитесь на Code или Props для деталей.'));
    tabsEl.querySelectorAll('.demo-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.id === state.active));
  }

  tabs.forEach(t => {
    tabsEl.appendChild(h('button', {
      class: 'demo-tab',
      'data-id': t.id,
      onclick: () => { state.active = t.id; update(); }
    }, t.label));
  });
  body.appendChild(tabsEl);
  body.appendChild(contentEl);

  const wrap = h('div', { class: 'demo' }, stageEl, body);
  update();
  return wrap;
}

function PropRow(name, type, desc) {
  return h('div', { class: 'prop-row' },
    h('span', { class: 'prop-name' }, name),
    h('span', { class: 'prop-type' }, type),
    h('span', { class: 'prop-desc' }, desc)
  );
}

// --- Buttons
function renderButtons() {
  const root = document.getElementById('page-buttons');

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Primary CTA — Lime (modern)'),
    h('p', { class: 'section-desc' },
      'Текущий стандарт для основных действий в homework-editor, modal, sidebar active. Используется --accent-primary → --accent-primary-hover. Border-radius 16px, font-weight 700.'),
    Demo(
      h('div', { class: 'row' },
        h('button', { class: 'btn-lime' }, 'Добавить вопрос'),
        h('button', { class: 'btn-lime' }, 'Сохранить'),
        h('button', { class: 'btn-lime', disabled: true }, 'Disabled')
      ),
      `<span class="tk-com">/* Из TemplateQuestionsSection.module.css */</span>
.addQuestionButton {
  <span class="tk-key">border-radius</span>: <span class="tk-val">16px</span>;
  <span class="tk-key">background</span>: <span class="tk-val">var(--accent-primary)</span>;    <span class="tk-com">/* #a3e635 */</span>
  <span class="tk-key">color</span>: <span class="tk-val">var(--accent-primary-text)</span>;    <span class="tk-com">/* #111827 */</span>
  <span class="tk-key">padding</span>: <span class="tk-val">10px 18px</span>;
  <span class="tk-key">font-weight</span>: <span class="tk-val">700</span>;
  <span class="tk-key">transition</span>: <span class="tk-val">background 0.2s ease</span>;
}
.addQuestionButton:hover { <span class="tk-key">background</span>: <span class="tk-val">var(--accent-primary-hover)</span>; }`,
      [
        PropRow('bg', '--accent-primary', '#a3e635'),
        PropRow('bg (hover)', '--accent-primary-hover', '#94d82d'),
        PropRow('text', '--accent-primary-text', '#111827'),
        PropRow('radius', '16–18px', 'зависит от контекста'),
        PropRow('weight', '700', ''),
      ]
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Secondary / Danger / Ghost'),
    h('p', { class: 'section-desc' },
      'Источник — shared/styles/controls.module.css. Используются для второстепенных действий в рядом с lime CTA.'),
    Demo(
      h('div', { class: 'row' },
        h('button', { class: 'btn-secondary' }, 'Отмена'),
        h('button', { class: 'btn-danger' }, 'Удалить'),
        h('button', { class: 'btn-ghost' }, 'Ghost'),
        h('button', { class: 'btn-icon', html: ICON_SVG.pencil })
      ),
      `.secondaryButton { <span class="tk-key">border</span>: <span class="tk-val">1px solid var(--color-slate-200)</span>; <span class="tk-key">border-radius</span>: <span class="tk-val">12px</span>; }
.dangerButton { <span class="tk-key">border</span>: <span class="tk-val">1px solid var(--color-rose-200)</span>; <span class="tk-key">color</span>: <span class="tk-val">var(--color-red-700)</span>; }
.primaryGhost { <span class="tk-key">background</span>: <span class="tk-val">var(--color-blue-100)</span>; <span class="tk-key">color</span>: <span class="tk-val">var(--color-blue-700)</span>; }
.iconButton { <span class="tk-key">width</span>: <span class="tk-val">34px</span>; <span class="tk-key">height</span>: <span class="tk-val">34px</span>; <span class="tk-key">border-radius</span>: <span class="tk-val">10px</span>; }`
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Legacy Button (shared/ui/Button)'),
    h('p', { class: 'section-desc' },
      'Shared-примитив. Синий градиент с primary shadow. В modal/sheet перекрывается CSS-переменными --primary-button-* на lime.'),
    Demo(
      h('div', { class: 'row' },
        h('button', { class: 'btn-legacy' }, 'Сохранить'),
        h('button', { class: 'btn-legacy', disabled: true, style: 'opacity:0.6' }, 'Disabled')
      ),
      `<span class="tk-com">/* shared/ui/Button/Button.module.css */</span>
.button {
  <span class="tk-key">border-radius</span>: <span class="tk-val">10px</span>;
  <span class="tk-key">background</span>: <span class="tk-val">var(--primary-button-bg,</span>
    <span class="tk-val">linear-gradient(120deg, var(--primary), var(--primary-strong)))</span>;
  <span class="tk-key">color</span>: <span class="tk-val">var(--primary-button-text, #fff)</span>;
  <span class="tk-key">box-shadow</span>: <span class="tk-val">0 6px 18px var(--shadow-primary-30)</span>;
}`
    ),
    h('div', { class: 'callout callout-warn', style: 'margin-top:14px' },
      h('span', { class: 'callout-ico' }, '!'),
      h('div', null,
        h('b', null, 'Inconsistency: '),
        'Shared Button по умолчанию синий, но во всех современных модалках перекрыт на lime через --primary-button-bg. Кандидат на рефакторинг: сделать lime дефолтом.')
    )
  ));
}

// --- Inputs
function renderInputs() {
  const root = document.getElementById('page-inputs');

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Text input'),
    h('p', { class: 'section-desc' }, 'shared/styles/controls.module.css — основной стиль. radius 12px, border slate-300, focus blue-600.'),
    Demo(
      h('div', { class: 'col', style: 'min-width:280px' },
        h('div', { class: 'field' },
          h('span', { class: 'field-label' }, 'Название задания'),
          h('input', { class: 'inp', placeholder: 'Например, Контрольная #3' })
        ),
        h('div', { class: 'field' },
          h('span', { class: 'field-label' }, 'С lime focus (новый стиль)'),
          h('input', { class: 'inp inp-lime', placeholder: 'Фокус в lime — предложение унификации' })
        ),
        h('div', { class: 'field' },
          h('span', { class: 'field-label' }, 'Ошибка валидации'),
          h('input', { class: 'inp inp-error', value: '', placeholder: 'Обязательное поле' }),
          h('span', { class: 'field-error' }, 'Это поле обязательно')
        )
      ),
      `.input {
  <span class="tk-key">padding</span>: <span class="tk-val">12px</span>;
  <span class="tk-key">border</span>: <span class="tk-val">1px solid var(--color-slate-300)</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">12px</span>;
  <span class="tk-key">font-size</span>: <span class="tk-val">14px</span>;
}
.input:focus {
  <span class="tk-key">border-color</span>: <span class="tk-val">var(--color-blue-600)</span>;
  <span class="tk-key">box-shadow</span>: <span class="tk-val">0 0 0 1px var(--shadow-blue-600-12)</span>;
}`,
      [
        PropRow('radius', '12px', 'controls.module.css'),
        PropRow('border', 'slate-300', 'normal'),
        PropRow('focus', 'blue-600 + ring', 'текущий — кандидат на lime'),
        PropRow('error', 'red-500 + red ring', 'rgba(239,68,68,0.14)'),
      ]
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Select'),
    Demo(
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Тип вопроса'),
        h('select', { class: 'inp' },
          h('option', null, 'Короткий ответ'),
          h('option', null, 'Длинный текст'),
          h('option', null, 'Один вариант'),
          h('option', null, 'Несколько вариантов')
        )
      ),
      `<span class="tk-com">/* shared/ui/Select/Select.module.css */</span>
.select {
  <span class="tk-key">border-radius</span>: <span class="tk-val">10px</span>;
  <span class="tk-key">border</span>: <span class="tk-val">1px solid var(--border)</span>;
  <span class="tk-key">padding</span>: <span class="tk-val">10px</span>;
}`
    )
  ));
}

// --- Checkbox / switch
function renderCheckbox() {
  const root = document.getElementById('page-checkbox');

  const cbChecked = h('input', { type: 'checkbox', class: 'cb', checked: true });
  const cbUnchecked = h('input', { type: 'checkbox', class: 'cb' });
  const sw1 = h('input', { type: 'checkbox', checked: true });
  const sw2 = h('input', { type: 'checkbox' });

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Checkbox'),
    h('p', { class: 'section-desc' }, 'shared/ui/Checkbox. 18×18, радиус 6, checked — lime #a3e635 с чёрной галочкой.'),
    Demo(
      h('div', { class: 'row' },
        h('label', { class: 'row' }, cbChecked, h('span', null, ' Checked')),
        h('label', { class: 'row' }, cbUnchecked, h('span', null, ' Unchecked')),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', class: 'cb', disabled: true, checked: true, style: 'opacity:0.5' }),
          h('span', { class: 'muted' }, ' Disabled'))
      ),
      `.checkbox {
  <span class="tk-key">width</span>: <span class="tk-val">18px</span>; <span class="tk-key">height</span>: <span class="tk-val">18px</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">6px</span>;
  <span class="tk-key">border</span>: <span class="tk-val">2px solid var(--color-slate-300)</span>;
}
.checkbox:checked {
  <span class="tk-key">border-color</span>: <span class="tk-val">#a3e635</span>;  <span class="tk-com">/* ⚠ хардкод — см. issues */</span>
  <span class="tk-key">background</span>: <span class="tk-val">#a3e635</span>;
}`
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Radio (choice marker)'),
    h('p', { class: 'section-desc' }, 'Из TemplateQuestionsSection — выбор правильного ответа.'),
    Demo(
      h('div', { class: 'col' },
        h('label', { class: 'row' }, h('span', { class: 'radio-marker checked' }), h('span', null, ' Правильный ответ')),
        h('label', { class: 'row' }, h('span', { class: 'radio-marker' }), h('span', null, ' Неправильный')),
        h('label', { class: 'row' }, h('span', { class: 'radio-marker' }), h('span', null, ' Неправильный'))
      ),
      `.choiceMarker {
  <span class="tk-key">width</span>: <span class="tk-val">18px</span>; <span class="tk-key">height</span>: <span class="tk-val">18px</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">999px</span>;
  <span class="tk-key">border</span>: <span class="tk-val">2px solid var(--color-slate-300)</span>;
}`
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Switch'),
    h('p', { class: 'section-desc' }, 'shared/styles/controls.module.css — 48×26, active blue-600 по умолчанию (можно переопределить --switch-on-bg).'),
    Demo(
      h('div', { class: 'row' },
        h('label', { class: 'switch' }, sw1, h('span', { class: 'switch-track' })),
        h('label', { class: 'switch' }, sw2, h('span', { class: 'switch-track' }))
      ),
      `.switch input:checked + .slider {
  <span class="tk-key">background-color</span>: <span class="tk-val">var(--switch-on-bg, var(--color-blue-600))</span>;
}`,
      [
        PropRow('width', '48px', ''),
        PropRow('height', '26px', ''),
        PropRow('active bg', 'blue-600', '⚠ лучше заменить на lime-500'),
      ]
    )
  ));
}

// --- Cards
function renderCards() {
  const root = document.getElementById('page-cards');

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Shared Card (legacy)'),
    h('p', { class: 'section-desc' }, 'shared/ui/Card. Простой компонент с заголовком и мета. radius 12px, primary-strong title.'),
    Demo(
      h('article', { class: 'card-product' },
        h('h4', null, 'Алгебра, 8 класс'),
        h('p', null, 'Следующий урок: понедельник 15:00')
      ),
      `.card {
  <span class="tk-key">background</span>: <span class="tk-val">#fff</span>;
  <span class="tk-key">border</span>: <span class="tk-val">1px solid var(--border)</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">12px</span>;
  <span class="tk-key">padding</span>: <span class="tk-val">10px 12px</span>;
}
.title { <span class="tk-key">color</span>: <span class="tk-val">var(--primary-strong)</span>; <span class="tk-key">font-weight</span>: <span class="tk-val">700</span>; }`
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Modern Product Card'),
    h('p', { class: 'section-desc' }, 'Homework detail. Крупный radius 32, мягкая тень. Primary card surface.'),
    Demo(
      h('div', { class: 'card-modern' },
        h('h3', null, 'Контрольная работа по теме "Векторы"'),
        h('p', null, 'Решено 12 из 18 учеников. Средний балл — 4.2.')
      ),
      `.card {
  <span class="tk-key">background</span>: <span class="tk-val">#fff</span>;
  <span class="tk-key">border</span>: <span class="tk-val">1px solid #eef1f4</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">32px</span>;
  <span class="tk-key">box-shadow</span>: <span class="tk-val">0 18px 44px rgba(40,45,61,0.05)</span>;
  <span class="tk-key">padding</span>: <span class="tk-val">32px</span>;
}`
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Stats Card (lime hero)'),
    h('p', { class: 'section-desc' }, 'Акцентная карточка статистики в homework detail. Градиент из local --hw-lime (#bbff48).'),
    Demo(
      h('div', { class: 'card-stats' },
        h('div', { class: 'big' }, '87%'),
        h('div', { class: 'lbl' }, 'Средний результат по классу')
      ),
      `.statsCard {
  <span class="tk-key">background</span>: <span class="tk-val">linear-gradient(180deg, #c4ff54 0%, #b7ff47 100%)</span>;
  <span class="tk-key">color</span>: <span class="tk-val">var(--hw-lime-dark)</span>;  <span class="tk-com">/* #0f1d0b */</span>
  <span class="tk-key">border-radius</span>: <span class="tk-val">32px</span>;
  <span class="tk-key">padding</span>: <span class="tk-val">32px</span>;
}`
    )
  ));
}

// --- Badges
function renderBadges() {
  const root = document.getElementById('page-badges');

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Badge variants'),
    h('p', { class: 'section-desc' }, 'Payment / group / pending. Компонент shared/ui/Badge с withDot.'),
    Demo(
      h('div', { class: 'row' },
        h('span', { class: 'bdg bdg-paid' }, h('span', { class: 'bdg-dot' }), 'Оплачено'),
        h('span', { class: 'bdg bdg-unpaid' }, h('span', { class: 'bdg-dot' }), 'Не оплачено'),
        h('span', { class: 'bdg bdg-group-paid' }, 'Группа оплачена'),
        h('span', { class: 'bdg bdg-group-unpaid' }, 'Группа не оплачена'),
        h('span', { class: 'bdg bdg-pending' }, 'Ожидание')
      ),
      `.badge {
  <span class="tk-key">border-radius</span>: <span class="tk-val">10px</span>;
  <span class="tk-key">padding</span>: <span class="tk-val">6px 10px</span>;
  <span class="tk-key">font-weight</span>: <span class="tk-val">700</span>;
  <span class="tk-key">font-size</span>: <span class="tk-val">12px</span>;
}
.paid { <span class="tk-key">background</span>: <span class="tk-val">#e3f8e6</span>; <span class="tk-key">color</span>: <span class="tk-val">#188542</span>; }
.unpaid { <span class="tk-key">background</span>: <span class="tk-val">#fcecec</span>; <span class="tk-key">color</span>: <span class="tk-val">#c73939</span>; }
.pending { <span class="tk-key">background</span>: <span class="tk-val">#fff7e6</span>; <span class="tk-key">color</span>: <span class="tk-val">#b26a00</span>; }`
    ),
    h('div', { class: 'callout callout-warn', style: 'margin-top:14px' },
      h('span', { class: 'callout-ico' }, '!'),
      h('div', null,
        h('b', null, 'Inconsistency: '),
        'Badge.module.css использует локальные hex (#e3f8e6, #188542) вместо токенов emerald-*. Кандидат на маппинг.'
      )
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Live / Status badges (homework)'),
    h('p', { class: 'section-desc' }, 'Пилюли больше Badge — 42px высота, radius 18. Используются в шапке homework detail.'),
    Demo(
      h('div', { class: 'row' },
        h('span', { class: 'live-badge live-active' }, h('span', { class: 'live-dot' }), 'Активно'),
        h('span', { class: 'live-badge live-draft' }, h('span', { class: 'live-dot' }), 'Черновик'),
        h('span', { class: 'live-badge live-archived' }, h('span', { class: 'live-dot' }), 'Архив')
      ),
      `.liveBadgeActive { <span class="tk-key">background</span>: <span class="tk-val">#ecfdf3</span>; <span class="tk-key">color</span>: <span class="tk-val">#23954c</span>; }
.liveBadgeDraft { <span class="tk-key">background</span>: <span class="tk-val">#edf2ff</span>; <span class="tk-key">color</span>: <span class="tk-val">#4760d1</span>; }
.liveBadgeArchived { <span class="tk-key">background</span>: <span class="tk-val">#eef1f5</span>; <span class="tk-key">color</span>: <span class="tk-val">#5b667a</span>; }`
    )
  ));
}

// --- Modal / Sheet
function renderModal() {
  const root = document.getElementById('page-modal');

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Modal'),
    h('p', { class: 'section-desc' }, 'shared/ui/Modal. max-width 520, radius 16, backdrop slate-900/35%, primary action — lime (перекрыто через --primary-button-*).'),
    Demo(
      h('div', { class: 'modal-mock' },
        h('div', { class: 'modal-mock-head' },
          h('span', null, 'Добавить ученика'),
          h('button', { class: 'x' }, '×')
        ),
        h('div', { class: 'modal-mock-body' },
          h('div', { class: 'field' },
            h('span', { class: 'field-label' }, 'Имя'),
            h('input', { class: 'inp', placeholder: 'Иван Иванов' })
          )
        ),
        h('div', { class: 'modal-mock-actions' },
          h('button', { class: 'btn-secondary' }, 'Отмена'),
          h('button', { class: 'btn-lime' }, 'Добавить')
        )
      ),
      `.modal {
  <span class="tk-key">--primary-button-bg</span>: <span class="tk-val">#a3e635</span>;
  <span class="tk-key">--primary-button-hover-bg</span>: <span class="tk-val">#94d82d</span>;
  <span class="tk-key">--primary-button-text</span>: <span class="tk-val">#111</span>;
  <span class="tk-key">background</span>: <span class="tk-val">#fff</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">16px</span>;
  <span class="tk-key">box-shadow</span>: <span class="tk-val">0 18px 40px rgba(0,0,0,0.12)</span>;
  <span class="tk-key">max-width</span>: <span class="tk-val">520px</span> | <span class="tk-val">640px</span>;  <span class="tk-com">/* два модуля с разным лимитом */</span>
}
.backdrop { <span class="tk-key">background</span>: <span class="tk-val">rgba(5, 14, 40, 0.35)</span>; <span class="tk-key">backdrop-filter</span>: <span class="tk-val">blur(2px)</span>; }`
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'BottomSheet'),
    h('p', { class: 'section-desc' }, 'Мобильный вариант диалогов. max-height 85vh, radius 24 сверху, handle 44×4.'),
    Demo(
      h('div', { class: 'sheet-mock' },
        h('div', { class: 'sheet-handle-zone' },
          h('div', { class: 'sheet-handle' })
        ),
        h('div', { style: 'padding:4px 4px 16px' },
          h('div', { style: 'font-weight:800;font-size:16px;margin-bottom:10px' }, 'Действие с уроком'),
          h('div', { class: 'col' },
            h('button', { class: 'btn-lime', style: 'width:100%' }, 'Перенести урок'),
            h('button', { class: 'btn-secondary', style: 'width:100%' }, 'Отменить')
          )
        )
      ),
      `.sheet {
  <span class="tk-key">border-radius</span>: <span class="tk-val">24px 24px 0 0</span>;
  <span class="tk-key">max-height</span>: <span class="tk-val">85vh</span>;
  <span class="tk-key">box-shadow</span>: <span class="tk-val">0 -12px 32px rgba(17, 18, 20, 0.18)</span>;
  <span class="tk-key">--primary-button-bg</span>: <span class="tk-val">#a3e635</span>;
}
.handle { <span class="tk-key">width</span>: <span class="tk-val">44px</span>; <span class="tk-key">height</span>: <span class="tk-val">4px</span>; }`
    )
  ));
}

// --- Toast
function renderToast() {
  const root = document.getElementById('page-toast');
  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Toast'),
    h('p', { class: 'section-desc' }, 'shared/ui/Toast. По умолчанию sky bg, для success добавляется тонкий зелёный бордер, для error — красный.'),
    Demo(
      h('div', { class: 'col' },
        h('div', { class: 'toast-demo success' },
          h('span', { class: 'ico', html: ICON_SVG.check }),
          h('span', null, 'Изменения сохранены'),
          h('button', { class: 'btn-icon', style: 'width:22px;height:22px;font-size:11px', html: ICON_SVG.close })
        ),
        h('div', { class: 'toast-demo error' },
          h('span', { class: 'ico', html: ICON_SVG.close }),
          h('span', null, 'Не удалось отправить уведомление')
        )
      ),
      `.toast {
  <span class="tk-key">padding</span>: <span class="tk-val">12px 16px</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">14px</span>;
  <span class="tk-key">background</span>: <span class="tk-val">var(--color-sky-80)</span>;  <span class="tk-com">/* #eef3ff */</span>
  <span class="tk-key">box-shadow</span>: <span class="tk-val">var(--shadow)</span>;
  <span class="tk-key">min-width</span>: <span class="tk-val">280px</span>;
}`
    )
  ));
}

// --- Avatar / Tooltip
function renderAvatarTooltip() {
  const root = document.getElementById('page-avatar');

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Avatar'),
    h('p', { class: 'section-desc' }, 'shared/ui/Avatar. 36×36, slate-100 fallback с инициалами slate-700.'),
    Demo(
      h('div', { class: 'row' },
        h('div', { class: 'avatar avatar-sm' }, 'АП'),
        h('div', { class: 'avatar' }, 'АП'),
        h('div', { class: 'avatar avatar-lg' }, 'АП'),
        h('div', { class: 'avatar', style: 'background:#a3e635;color:#111;border-color:#86b329' }, 'ИВ')
      ),
      `.avatar {
  <span class="tk-key">width</span>: <span class="tk-val">36px</span>; <span class="tk-key">height</span>: <span class="tk-val">36px</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">50%</span>;
  <span class="tk-key">border</span>: <span class="tk-val">1px solid var(--color-slate-200)</span>;
  <span class="tk-key">background</span>: <span class="tk-val">var(--color-slate-100)</span>;
  <span class="tk-key">color</span>: <span class="tk-val">var(--color-slate-700)</span>;
}`
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Tooltip'),
    h('p', { class: 'section-desc' }, 'Portal-tooltip, slate-900/94% фон, белый текст 12/600.'),
    Demo(
      h('div', null,
        h('button', { class: 'btn-secondary' }, 'Наведите курсор'),
        h('div', { class: 'tooltip-demo' }, 'Подсказка о действии')
      ),
      `.tooltip {
  <span class="tk-key">padding</span>: <span class="tk-val">6px 10px</span>;
  <span class="tk-key">border-radius</span>: <span class="tk-val">10px</span>;
  <span class="tk-key">background</span>: <span class="tk-val">rgba(15, 23, 42, 0.94)</span>;
  <span class="tk-key">color</span>: <span class="tk-val">#fff</span>;
  <span class="tk-key">font-size</span>: <span class="tk-val">12px</span>;
  <span class="tk-key">font-weight</span>: <span class="tk-val">600</span>;
  <span class="tk-key">box-shadow</span>: <span class="tk-val">0 12px 24px rgba(15, 23, 42, 0.18)</span>;
}
<span class="tk-com">/* Скрыт на touch-устройствах */</span>
@media (hover: none) { .tooltip { <span class="tk-key">display</span>: <span class="tk-val">none</span>; } }`
    )
  ));
}

// --- Layout
function renderLayout() {
  const root = document.getElementById('page-layout');

  const sidebar = h('div', { class: 'layout-sidebar' },
    h('div', { class: 'layout-brand' },
      h('div', { class: 'layout-brand-logo' }, 'К'),
      h('div', { class: 'layout-brand-name' }, 'Codex')
    ),
    h('div', { class: 'layout-nav-link active' },
      h('span', { html: ICON_SVG.calendar, style: 'display:inline-flex;width:18px;height:18px' }),
      h('span', null, 'Расписание'),
      h('span', { class: 'layout-nav-badge' }, '3')
    ),
    h('div', { class: 'layout-nav-link' },
      h('span', { html: ICON_SVG.users, style: 'display:inline-flex;width:18px;height:18px' }),
      h('span', null, 'Ученики')
    ),
    h('div', { class: 'layout-nav-link' },
      h('span', { html: ICON_SVG.book, style: 'display:inline-flex;width:18px;height:18px' }),
      h('span', null, 'Задания')
    ),
    h('div', { class: 'layout-nav-link' },
      h('span', { html: ICON_SVG.chart, style: 'display:inline-flex;width:18px;height:18px' }),
      h('span', null, 'Аналитика')
    ),
    h('div', { class: 'layout-nav-link' },
      h('span', { html: ICON_SVG.settings, style: 'display:inline-flex;width:18px;height:18px' }),
      h('span', null, 'Настройки')
    )
  );

  const content = h('div', { class: 'layout-content' },
    h('div', { class: 'layout-content-title' }, 'Расписание · Апрель'),
    h('div', { class: 'layout-row' },
      h('div', { class: 'layout-block' }, 'Сетка календаря'),
      h('div', { class: 'layout-block' }, 'Сайд-панель')
    ),
    h('div', { class: 'layout-block' }, 'Нижний блок / лента')
  );

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'App shell'),
    h('p', { class: 'section-desc' },
      'Sidebar: 256px (collapsed 64px), cubic-bezier(0.22,1,0.36,1) 0.28s, белый фон, radius 20, slate-200 border, shadow-md. Active item — lime с радиусом 12.'),
    h('div', { class: 'layout-card' }, sidebar, content)
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Расписание — фрагменты'),
    h('p', { class: 'section-desc' }, 'Паттерн строки расписания: левый time-stamp, цветной chip под статус.'),
    Demo(
      h('div', { class: 'col', style: 'min-width:320px' },
        h('div', { class: 'sch-row' },
          h('span', { class: 'sch-time' }, '09:00'),
          h('span', { class: 'sch-chip lime' }, 'Алгебра · Иван')
        ),
        h('div', { class: 'sch-row' },
          h('span', { class: 'sch-time' }, '11:00'),
          h('span', { class: 'sch-chip green' }, 'Геометрия · Анна')
        ),
        h('div', { class: 'sch-row' },
          h('span', { class: 'sch-time' }, '14:30'),
          h('span', { class: 'sch-chip' }, 'Группа 8-Б · Физика')
        )
      ),
      '<span class="tk-com">/* Sch-row: white, 1px slate-200, radius 12 */</span>'
    )
  ));
}

// --- Screens
function renderScreens() {
  const root = document.getElementById('page-screens');

  const auth = h('div', { class: 'screen' },
    h('div', { class: 'screen-preview auth-screen' },
      h('div', { class: 'auth-card' },
        h('div', { class: 'auth-logo' }, 'К'),
        h('div', { class: 'auth-title' }, 'Codex'),
        h('div', { class: 'auth-inp' }),
        h('div', { class: 'auth-inp' }),
        h('div', { class: 'auth-cta' }, 'Войти')
      )
    ),
    h('div', { class: 'screen-caption' }, 'Login', h('span', { class: 'muted' }, ' · white card, lime CTA'))
  );

  const homework = h('div', { class: 'screen' },
    h('div', { class: 'screen-preview' },
      h('div', { style: 'display:grid;grid-template-columns:2fr 1fr;gap:8px;height:100%' },
        h('div', { class: 'col' },
          h('div', { style: 'background:#fff;border:1px solid #eef1f4;border-radius:12px;padding:10px;flex:1' },
            h('div', { style: 'font-weight:800;font-size:12px' }, 'Вопрос 1. Краткий ответ'),
            h('div', { style: 'background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;height:20px;margin-top:6px' })
          ),
          h('div', { style: 'background:#fff;border:1px solid #eef1f4;border-radius:12px;padding:10px;flex:1' },
            h('div', { style: 'font-weight:800;font-size:12px' }, 'Вопрос 2. Варианты'),
            h('div', { style: 'display:flex;gap:6px;margin-top:6px' },
              h('span', { class: 'radio-marker checked', style: 'transform:scale(0.7)' }),
              h('span', { class: 'radio-marker', style: 'transform:scale(0.7)' })
            )
          )
        ),
        h('div', { class: 'hw-hero' },
          h('div', { class: 'num' }, '87%'),
          h('div', { class: 'lbl' }, 'Средний результат')
        )
      )
    ),
    h('div', { class: 'screen-caption' }, 'Homework detail', h('span', { class: 'muted' }, ' · lime stats hero + white question cards'))
  );

  const editor = h('div', { class: 'screen' },
    h('div', { class: 'screen-preview' },
      h('div', { style: 'background:#fff;border:1px solid #eef1f4;border-radius:16px;padding:10px;height:100%' },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' },
          h('div', { style: 'font-weight:800;font-size:12px' }, 'Вопросы'),
          h('div', { style: 'background:#a3e635;color:#111;padding:4px 8px;border-radius:10px;font-size:10px;font-weight:700' }, '+ Добавить')
        ),
        h('div', { style: 'background:#f9fafb;border:2px solid #e5e7eb;border-radius:12px;padding:8px;margin-bottom:6px' },
          h('div', { style: 'font-size:10px;color:#6b7280' }, '01 · короткий ответ · 5 баллов'),
          h('div', { style: 'height:12px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin-top:4px' })
        ),
        h('div', { style: 'background:#f9fafb;border:2px solid #e5e7eb;border-radius:12px;padding:8px' },
          h('div', { style: 'font-size:10px;color:#6b7280' }, '02 · выбор · 10 баллов')
        ),
        h('div', { style: 'border:2px dashed #cbd5e1;border-radius:12px;padding:8px;margin-top:6px;text-align:center;font-size:10px;color:#94a3b8' },
          '+ Добавить вопрос')
      )
    ),
    h('div', { class: 'screen-caption' }, 'Template editor', h('span', { class: 'muted' }, ' · вопросы + lime CTA'))
  );

  const sidebar = h('div', { class: 'screen' },
    h('div', { class: 'screen-preview', style: 'padding:10px' },
      h('div', { style: 'background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:10px;height:100%;display:flex;flex-direction:column;gap:4px' },
        h('div', { style: 'display:flex;align-items:center;gap:8px;padding-bottom:6px;border-bottom:1px solid #f1f5f9' },
          h('div', { class: 'layout-brand-logo', style: 'width:24px;height:24px;border-radius:6px;font-size:10px' }, 'К'),
          h('div', { style: 'font-weight:800;font-size:12px' }, 'Codex')
        ),
        h('div', { style: 'background:#a3e635;border-radius:8px;padding:6px;font-size:10px;font-weight:600' }, 'Расписание'),
        h('div', { style: 'padding:6px;font-size:10px;color:#475569' }, 'Ученики'),
        h('div', { style: 'padding:6px;font-size:10px;color:#475569' }, 'Задания'),
        h('div', { style: 'padding:6px;font-size:10px;color:#475569' }, 'Аналитика'),
        h('div', { style: 'padding:6px;font-size:10px;color:#475569' }, 'Настройки')
      )
    ),
    h('div', { class: 'screen-caption' }, 'Sidebar', h('span', { class: 'muted' }, ' · active pill in lime'))
  );

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Композиции'),
    h('p', { class: 'section-desc' }, 'Мини-превью ключевых экранов. Реальные файлы — в codex/src/features/*.'),
    h('div', { class: 'screen-grid' }, auth, homework, editor, sidebar)
  ));
}

// --- Motion
function renderMotion() {
  const root = document.getElementById('page-motion');
  const box = h('div', {
    style: 'width:140px;height:60px;background:#a3e635;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;transition:transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),box-shadow 0.28s cubic-bezier(0.22, 1, 0.36, 1);cursor:pointer'
  }, 'Hover me');
  box.addEventListener('mouseenter', () => {
    box.style.transform = 'translateY(-4px) scale(1.02)';
    box.style.boxShadow = '0 14px 30px rgba(15,23,42,0.14)';
  });
  box.addEventListener('mouseleave', () => {
    box.style.transform = '';
    box.style.boxShadow = '';
  });

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Motion tokens'),
    h('p', { class: 'section-desc' }, 'Единственный явно заданный easing — в Sidebar (--sidebar-motion-ease). Остальные модули используют ease или ease-in-out.'),
    h('div', { class: 'panel' },
      h('table', { class: 'token-table' },
        h('thead', null,
          h('tr', null,
            h('th', null, 'Токен'),
            h('th', null, 'Значение'),
            h('th', null, 'Где используется')
          )
        ),
        h('tbody', null,
          h('tr', null,
            h('td', { class: 'mono' }, '--sidebar-motion-duration'),
            h('td', { class: 'mono' }, '0.28s'),
            h('td', { class: 'desc' }, 'Sidebar collapse')
          ),
          h('tr', null,
            h('td', { class: 'mono' }, '--sidebar-motion-ease'),
            h('td', { class: 'mono' }, 'cubic-bezier(0.22, 1, 0.36, 1)'),
            h('td', { class: 'desc' }, 'Sidebar, nav')
          ),
          h('tr', null,
            h('td', { class: 'mono' }, 'duration-xs'),
            h('td', { class: 'mono' }, '0.1s ease'),
            h('td', { class: 'desc' }, 'Button active transform')
          ),
          h('tr', null,
            h('td', { class: 'mono' }, 'duration-sm'),
            h('td', { class: 'mono' }, '0.15s ease'),
            h('td', { class: 'desc' }, 'Input border, hover')
          ),
          h('tr', null,
            h('td', { class: 'mono' }, 'duration-md'),
            h('td', { class: 'mono' }, '0.2s ease'),
            h('td', { class: 'desc' }, 'Button hover, checkbox')
          ),
          h('tr', null,
            h('td', { class: 'mono' }, 'duration-lg'),
            h('td', { class: 'mono' }, '0.25s ease'),
            h('td', { class: 'desc' }, 'BottomSheet slide')
          ),
          h('tr', null,
            h('td', { class: 'mono' }, 'modalButtonSpin'),
            h('td', { class: 'mono' }, '0.8s linear infinite'),
            h('td', { class: 'desc' }, 'Loading spinner в modal')
          )
        )
      )
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Живой пример'),
    h('p', { class: 'section-desc' }, 'Hover / active transitions на lime CTA — типичная реакция на действие.'),
    h('div', { class: 'demo' },
      h('div', { class: 'demo-stage center' }, box)
    ),
    h('div', { class: 'callout callout-tip', style: 'margin-top:14px' },
      h('span', { class: 'callout-ico' }, '★'),
      h('div', null,
        h('b', null, 'Предложение: '),
        'Вынести в global.css токены --motion-duration-[xs/sm/md/lg] и --motion-ease-standard, чтобы не плодить магические числа в каждом модуле.'
      )
    )
  ));
}

// --- Principles
function renderPrinciples() {
  const root = document.getElementById('page-principles');
  const items = [
    {
      n: '01',
      title: 'Neutral surface + lime CTA + dark text',
      desc: 'Правильный паттерн продукта. Lime не заливает весь экран — только действие и акцент. Фон — белый или slate-50.',
    },
    {
      n: '02',
      title: 'emerald = семантический success, lime = product action',
      desc: 'Не смешивать: зелёный цвет статуса ≠ акцентный зелёный кнопки. Разные роли, разные токены.',
    },
    {
      n: '03',
      title: 'Типографика — один стек',
      desc: 'Inter + system fallback. Дружелюбность достигается цветом, радиусом и композицией, не шрифтом.',
    },
    {
      n: '04',
      title: 'Radius по роли',
      desc: 'Input/legacy button — 10–12; CTA/toast — 14–18; card — 12/16/24/32 в зависимости от веса. Pill и аватар — 999.',
    },
    {
      n: '05',
      title: 'Тени мягкие и структурные',
      desc: 'Только нейтральные slate-shadows. Никаких цветных glow. Акцент — через fill, не через свечение.',
    },
    {
      n: '06',
      title: 'Not a primitive — not a token',
      desc: 'Если компонент встречается один раз — он не shared. Shared-ui/* только для реально переиспользуемых примитивов.',
    },
  ];
  root.appendChild(h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px' },
    items.map(it => h('div', { class: 'panel' },
      h('div', { class: 'panel-body' },
        h('div', { style: 'font-family:var(--doc-mono);font-size:11px;color:var(--color-lime-600);font-weight:800;margin-bottom:8px' }, it.n),
        h('h3', { style: 'margin:0 0 8px;font-size:18px;font-weight:800;letter-spacing:-0.015em' }, it.title),
        h('p', { class: 'muted', style: 'margin:0;font-size:13px;line-height:1.5' }, it.desc)
      )
    ))
  ));
}

// --- Overview
function renderOverview() {
  const root = document.getElementById('page-overview');

  const stats = [
    { big: '65+', lbl: 'цветовых токенов' },
    { big: '8', lbl: 'теневых паттернов' },
    { big: '17', lbl: 'shared-компонентов' },
    { big: '7', lbl: 'inconsistencies найдено' },
  ];

  root.appendChild(h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:32px' },
    stats.map((s, i) =>
      h('div', {
        class: 'panel',
        style: i === 0 ? 'background:linear-gradient(180deg,#c4ff54,#b7ff47);border-color:#a3e635' : ''
      },
        h('div', { style: 'padding:20px' },
          h('div', { style: 'font-size:36px;font-weight:800;letter-spacing:-0.03em;line-height:1' }, s.big),
          h('div', { style: 'font-size:12px;font-weight:700;color:' + (i === 0 ? '#0f1d0b' : 'var(--doc-muted)') + ';margin-top:6px;text-transform:uppercase;letter-spacing:0.08em' }, s.lbl)
        )
      )
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Источники правды'),
    h('div', { class: 'panel' },
      h('table', { class: 'token-table' },
        h('thead', null,
          h('tr', null,
            h('th', null, 'Слой'),
            h('th', null, 'Файл в репозитории'),
            h('th', null, 'Что определяет')
          )
        ),
        h('tbody', null,
          h('tr', null,
            h('td', null, 'Tokens'),
            h('td', { class: 'mono' }, 'src/app/styles/global.css'),
            h('td', { class: 'desc' }, 'цвета, shadows, legacy-аксессуары')
          ),
          h('tr', null,
            h('td', null, 'Shared UI'),
            h('td', { class: 'mono' }, 'src/shared/ui/*'),
            h('td', { class: 'desc' }, 'Button, Input, Card, Badge, Modal, Toast, Avatar и др.')
          ),
          h('tr', null,
            h('td', null, 'Shared styles'),
            h('td', { class: 'mono' }, 'src/shared/styles/controls.module.css'),
            h('td', { class: 'desc' }, 'утилитарные input/button/switch, актуальный стиль')
          ),
          h('tr', null,
            h('td', null, 'Modal tokens'),
            h('td', { class: 'mono' }, 'src/features/modals/modal.module.css'),
            h('td', { class: 'desc' }, 'lime-переопределение primary-button-*')
          ),
          h('tr', null,
            h('td', null, 'Sidebar'),
            h('td', { class: 'mono' }, 'src/widgets/layout/Sidebar.module.css'),
            h('td', { class: 'desc' }, 'motion, layout, активный state')
          ),
          h('tr', null,
            h('td', null, 'Homework lime'),
            h('td', { class: 'mono' }, 'src/features/homework-template-view/…'),
            h('td', { class: 'desc' }, 'локальные hw-токены, brighter lime #bbff48')
          ),
          h('tr', null,
            h('td', null, 'Документация'),
            h('td', { class: 'mono' }, 'design-system/MASTER.md'),
            h('td', { class: 'desc' }, 'правила, решения, decision-rules')
          )
        )
      )
    )
  ));

  root.appendChild(h('div', { class: 'section' },
    h('h3', { class: 'section-h2' }, 'Быстрая навигация'),
    h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px' },
      [
        ['colors', 'Цвета и токены', '65+ переменных'],
        ['typography', 'Типографика', 'Inter · 11 ступеней'],
        ['spacing', 'Spacing и радиусы', '11 радиусов'],
        ['buttons', 'Buttons', '4 варианта'],
        ['cards', 'Cards', '3 роли'],
        ['issues', 'Inconsistencies', '7 пунктов'],
      ].map(([id, title, sub]) =>
        h('button', {
          class: 'nav-link',
          style: 'padding:14px;border-radius:12px;background:#fff;border:1px solid var(--doc-border);flex-direction:column;align-items:flex-start;gap:4px;height:auto',
          onclick: () => navigate(id),
        },
          h('span', { style: 'font-weight:700;color:var(--color-slate-900)' }, title),
          h('span', { class: 'muted', style: 'font-size:11px' }, sub)
        )
      )
    )
  ));
}

// --- Issues
function renderIssues() {
  const root = document.getElementById('page-issues');
  root.appendChild(h('p', { class: 'section-desc' },
    'Места, где кодовая дизайн-система расходится сама с собой. Помечены по уровню: critical (влияет на визуал) / warning (риск рассинхрона) / notice (улучшение).'));

  ISSUES.forEach(i =>
    root.appendChild(h('div', { class: 'issue ' + i.level },
      h('div', { class: 'issue-head' },
        h('div', { class: 'issue-title' }, i.title),
        h('span', { class: 'issue-tag' }, i.level)
      ),
      h('p', { class: 'issue-desc' }, i.desc),
      h('pre', { class: 'issue-fix', style: 'white-space:pre-wrap' }, i.fix)
    ))
  );
}

// ============================================
// BOOT
// ============================================
function boot() {
  renderNav();
  renderOverview();
  renderPrinciples();
  renderIssues();
  renderColors();
  renderType();
  renderSpacing();
  renderShadows();
  renderIcons();
  renderButtons();
  renderInputs();
  renderCheckbox();
  renderCards();
  renderBadges();
  renderModal();
  renderToast();
  renderAvatarTooltip();
  renderLayout();
  renderScreens();
  renderMotion();

  // Initial route
  let target = location.hash.slice(1);
  if (!target) {
    try { target = localStorage.getItem('ds_page') || 'overview'; } catch { target = 'overview'; }
  }
  if (!document.getElementById('page-' + target)) target = 'overview';
  navigate(target);

  window.addEventListener('hashchange', () => {
    const t = location.hash.slice(1) || 'overview';
    if (document.getElementById('page-' + t)) navigate(t);
  });
}

document.addEventListener('DOMContentLoaded', boot);
