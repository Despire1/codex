# Codex Product Design System

Этот файл фиксирует фактическую дизайн-систему проекта по текущему коду. Использовать как источник правды для новых экранов и рефакторингов UI.

## Sources

- Global tokens: [src/app/styles/global.css](/Users/artempolitanskij/Проекты/codex/src/app/styles/global.css:1)
- Shared button primitive: [src/shared/ui/Button/Button.module.css](/Users/artempolitanskij/Проекты/codex/src/shared/ui/Button/Button.module.css:1)
- Lime primary actions in overlays: [src/features/modals/modal.module.css](/Users/artempolitanskij/Проекты/codex/src/features/modals/modal.module.css:1)
- Main navigation accent: [src/widgets/layout/Sidebar.module.css](/Users/artempolitanskij/Проекты/codex/src/widgets/layout/Sidebar.module.css:1)
- Homework/detail lime tokens: [src/features/homework-template-view/ui/HomeworkTemplateDetailScreen.module.css](/Users/artempolitanskij/Проекты/codex/src/features/homework-template-view/ui/HomeworkTemplateDetailScreen.module.css:1)
- Add question CTA reference: [src/features/homework-template-editor/ui/create-screen/TemplateQuestionsSection.module.css](/Users/artempolitanskij/Проекты/codex/src/features/homework-template-editor/ui/create-screen/TemplateQuestionsSection.module.css:1)

## Foundation

### Typography

- Base font family: `Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Product text is mostly neutral, dense, and utilitarian.
- Default text hierarchy:
  - Headings: `700-800`
  - Body: `400-600`
  - Labels/meta: `11-14px`, often `600-700`

Rule:
- Новые продуктовые экраны по умолчанию не вводят новые шрифты.
- Дружелюбность достигается цветом, композицией, радиусами и акцентами, а не случайной сменой типографики.

### Neutral palette

Primary neutral system:

- `#0f172a` `--color-slate-900`
- `#1f2937` `--color-slate-800`
- `#334155` `--color-slate-700`
- `#475569` `--color-slate-600`
- `#64748b` `--color-slate-500`
- `#94a3b8` `--color-slate-400`
- `#e2e8f0` `--color-slate-200`
- `#f1f5f9` `--color-slate-100`
- `#f8fafc` `--color-slate-50`
- `#111827` and `#1f2937` are also heavily used as strong dark surfaces/text in product modules.

Usage:
- Backgrounds: mostly white or `slate-50`
- Borders: `slate-200` or nearby gray values
- Primary text: `#111827` or `#0f172a`
- Secondary text: `#475569` / `#64748b`

### Accent system

There are two active accent families in the codebase.

#### 1. Legacy blue foundation

- `--primary: #5b8def`
- `--primary-weak: #8eb7ff`
- `--primary-strong: #3a6fdc`
- Used in older/shared widgets and some generic primitives.

Rule:
- Не расширять blue как основной акцент для новых homework/editor/auth сценариев, если экран ближе к современной части продукта.

#### 2. Current lime accent for key CTAs

This is the accent the user referred to.

- Primary lime: `#a3e635`
- Hover/pressed lime: `#94d82d`
- Brighter lime highlight: `#c4f33f`
- Homework lime token: `#bbff48`
- Dark text on lime: `#111` or `#111827`

Observed usage:

- Sidebar active item: `#a3e635`
- Modal / bottom sheet primary button variables: `#a3e635`, hover `#94d82d`
- Add question button: `#a3e635`, hover `#94d82d`
- Schedule / homework accent text: `#c4f33f`

Rule:
- Для основных CTA в актуальном продукте использовать lime как accent-first цвет.
- Lime не должен заливать весь экран.
- Правильный паттерн: neutral surface + lime CTA/accent + dark readable text.

### Semantic support colors

- Success green: `--color-emerald-500: #10b981`
- Success soft: `--color-emerald-50: #ecfdf3`
- Green border/support: `--color-green-200: #bbf7d0`
- Error: `#dc2626`, `#ef4444`
- Warning/orange: `#c2410c`, `#fed7aa`, `#fff7ed`

Rule:
- `emerald` is semantic success/support.
- `lime` is product/action accent.
- Do not mix them randomly in one component.

## Surfaces

Common product surfaces:

- Page background: `#f8fafc` or near-white
- Card background: `#ffffff`
- Soft card background: `#f3f4f7`, `#eef0f4`, `#f7f8fc`
- Dark product panels: `#111827`, `#0f172a`, `#1f2937`

Rule:
- Use white cards over light neutral backgrounds.
- Dark gradients are reserved for focal blocks, dashboards, homework/student hero panels, and chrome accents.

## Borders, radius, shadows

### Radius scale

Common values in repo:

- `10px`, `12px` for compact controls
- `16px` for inputs/buttons
- `18px`, `20px` for pills and compact cards
- `24px`, `28px`, `32px` for major cards/sections

Rule:
- Auth and modal-like cards should sit in the `24-32px` range.
- Inputs and primary buttons should stay in the `16-18px` range.

### Shadows

Common pattern:

- Soft dark shadows with slate alpha, not colored neon shadows.
- Examples:
  - `0 14px 30px rgba(15, 23, 42, 0.06)`
  - `0 20px 40px rgba(15, 23, 42, 0.08)`
  - `0 22px 56px rgba(40, 45, 61, 0.06)`

Rule:
- Keep shadows soft and structural.
- Accent color should come from fills/borders, not from aggressive tinted glow.

## Buttons

### Primary CTA

Current product-consistent primary button for modern flows:

- Background: `#a3e635`
- Hover: `#94d82d`
- Text: `#111` or `#111827`
- Weight: `700`
- Radius: `16px` to `18px`

### Secondary CTA

- White background
- Border: `slate-200`
- Text: `slate-700`

Rule:
- If a screen has one obvious action, it should be lime.
- Avoid navy primary buttons on screens that belong to the newer homework/editor visual language.

## Inputs

Shared input direction:

- White surface
- Neutral border
- Rounded corners `16px`
- Dark text
- Focus state visible and soft

Rule:
- Focus rings can use lime-tinted outline on screens aligned to the current accent family.
- Keep placeholders muted, not decorative.

## Logos and branding

- Product icon exists in `public/pwa-icon.svg`
- Brand should sit on neutral/white plaque, not on muddy tinted blocks.
- The logo should establish context; supporting text should stay minimal.

Rule:
- On auth screens, logo + service name is enough.
- Do not add marketing copy unless the screen explicitly needs onboarding context.

## Auth screen guidance

Target visual pattern for auth:

- Light neutral page background
- White or near-white centered card
- Logo visible at the top
- Product name small, page title concise
- Inputs neutral
- Single lime primary CTA

Avoid:

- Full-screen green wash
- Yellow-green mud mixes
- New typography systems not used elsewhere in product
- Explanatory text blocks that compete with the form

## Decision rules for future UI work

When designing new screens:

1. Start from `global.css` tokens and current module patterns, not from an abstract generated palette.
2. Prefer `slate` neutrals for layout and text.
3. Use `lime` for modern product CTAs and active accents.
4. Use `emerald` only for semantic success/support states.
5. Keep cards white, rounded, and softly shadowed.
6. Keep typography on the existing Inter/system stack unless there is a strong product-level reason.

