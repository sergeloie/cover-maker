// Журнальные текстовые стили и готовые шаблоны обложек.
// Все размеры заданы в "референсных" пикселях для страницы шириной 2480 px
// и масштабируются пропорционально реальной ширине документа.
// Позиции заданы долями страницы (0..1), поэтому шаблоны работают
// и для A4, и для Letter, и для квадрата.

const REF_WIDTH = 2480;
let templateIdCounter = 0;

function makeLayerId(prefix) {
  templateIdCounter += 1;
  return `${prefix}-tpl-${Date.now().toString(36)}-${templateIdCounter}`;
}

const px = (value, scale) => Math.round((value || 0) * scale);
const pos = (value, size) => Math.round(value * size);

export const FONT_STACKS = {
  didone: '"Playfair Display", Georgia, "Times New Roman", serif',
  elegant: '"Cormorant Garamond", Georgia, serif',
  condensed: '"Bebas Neue", "Arial Narrow", Impact, sans-serif',
  grotesk: 'Montserrat, "Segoe UI", Arial, sans-serif',
  accent: '"Abril Fatface", Georgia, serif',
};

export const TEXT_STYLES = {
  masthead: {
    label: 'МАСТОХЕД',
    fontFamily: FONT_STACKS.didone,
    fontWeight: 700,
    size: 540,
    lineHeight: 0.82,
    tracking: -6,
    uppercase: true,
    align: 'center',
    color: '#171310',
    strokeWidth: 0,
    strokeColor: '#000000',
    backgroundEnabled: false,
    backgroundColor: '#ffffff',
    backgroundPadding: 0,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 0,
  },
  headline: {
    label: 'ГЛАВНЫЙ ЗАГОЛОВОК',
    fontFamily: FONT_STACKS.condensed,
    fontWeight: 400,
    size: 330,
    lineHeight: 0.86,
    tracking: 2,
    uppercase: true,
    align: 'left',
    color: '#ffffff',
    strokeWidth: 0,
    strokeColor: '#000000',
    backgroundEnabled: false,
    backgroundColor: '#ffffff',
    backgroundPadding: 0,
    shadowEnabled: true,
    shadowColor: '#000000',
    shadowBlur: 26,
  },
  coverline: {
    label: 'КОВЕРЛАЙН',
    fontFamily: FONT_STACKS.grotesk,
    fontWeight: 800,
    size: 96,
    lineHeight: 1.06,
    tracking: -1,
    uppercase: true,
    align: 'left',
    color: '#ffffff',
    strokeWidth: 0,
    strokeColor: '#000000',
    backgroundEnabled: false,
    backgroundColor: '#ffffff',
    backgroundPadding: 0,
    shadowEnabled: true,
    shadowColor: '#000000',
    shadowBlur: 14,
  },
  kicker: {
    label: 'НАДЗАГОЛОВОК',
    fontFamily: FONT_STACKS.grotesk,
    fontWeight: 800,
    size: 48,
    lineHeight: 1.1,
    tracking: 9,
    uppercase: true,
    align: 'left',
    color: '#e8432f',
    strokeWidth: 0,
    strokeColor: '#000000',
    backgroundEnabled: false,
    backgroundColor: '#ffffff',
    backgroundPadding: 0,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 0,
  },
  issue: {
    label: 'НОМЕР И ДАТА',
    fontFamily: FONT_STACKS.grotesk,
    fontWeight: 600,
    size: 52,
    lineHeight: 1.1,
    tracking: 3,
    uppercase: true,
    align: 'right',
    color: '#171310',
    strokeWidth: 0,
    strokeColor: '#000000',
    backgroundEnabled: false,
    backgroundColor: '#ffffff',
    backgroundPadding: 0,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 0,
  },
  caption: {
    label: 'ПОДПИСЬ',
    fontFamily: FONT_STACKS.elegant,
    fontWeight: 600,
    size: 74,
    lineHeight: 1.05,
    tracking: 0,
    uppercase: false,
    align: 'left',
    color: '#171310',
    strokeWidth: 0,
    strokeColor: '#000000',
    backgroundEnabled: false,
    backgroundColor: '#ffffff',
    backgroundPadding: 0,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 0,
  },
  badge: {
    label: 'ТЕКСТ НАКЛЕЙКИ',
    fontFamily: FONT_STACKS.grotesk,
    fontWeight: 900,
    size: 62,
    lineHeight: 1,
    tracking: 1,
    uppercase: true,
    align: 'center',
    color: '#ffffff',
    strokeWidth: 0,
    strokeColor: '#000000',
    backgroundEnabled: false,
    backgroundColor: '#e8432f',
    backgroundPadding: 0,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 0,
  },
  quote: {
    label: 'ЦИТАТА / АКЦЕНТ',
    fontFamily: FONT_STACKS.accent,
    fontWeight: 400,
    size: 132,
    lineHeight: 1.02,
    tracking: -1,
    uppercase: false,
    align: 'left',
    color: '#e8432f',
    strokeWidth: 0,
    strokeColor: '#000000',
    backgroundEnabled: false,
    backgroundColor: '#ffffff',
    backgroundPadding: 0,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 0,
  },
};

function buildTextLayer(spec, doc, scale) {
  const style = TEXT_STYLES[spec.style] || TEXT_STYLES.coverline;
  const value = { ...style, ...(spec.overrides || {}) };
  return {
    id: makeLayerId('text'),
    type: 'text',
    name: spec.name || style.label,
    role: spec.role || '',
    styleId: spec.style || '',
    text: spec.text || '',
    x: pos(spec.x, doc.width),
    y: pos(spec.y, doc.height),
    width: pos(spec.width, doc.width),
    height: px(value.size, scale),
    rotation: spec.rotation || 0,
    opacity: spec.opacity ?? 1,
    visible: true,
    fontFamily: value.fontFamily,
    fontSize: px(value.size, scale),
    fontWeight: value.fontWeight,
    italic: Boolean(value.italic),
    uppercase: value.uppercase,
    align: value.align,
    lineHeight: value.lineHeight,
    letterSpacing: px(value.tracking, scale),
    color: value.color,
    strokeColor: value.strokeColor,
    strokeWidth: px(value.strokeWidth, scale),
    backgroundEnabled: value.backgroundEnabled,
    backgroundColor: value.backgroundColor,
    backgroundPadding: px(value.backgroundPadding, scale),
    shadowEnabled: value.shadowEnabled,
    shadowColor: value.shadowColor,
    shadowBlur: px(value.shadowBlur, scale),
    shadowOffsetX: px(value.shadowOffsetX || 0, scale),
    plateRadius: value.plateRadius ?? null,
    plateStrokeColor: value.plateStrokeColor || null,
    plateStrokeWidth: px(value.plateStrokeWidth || 0, scale),
  };
}

function buildShapeLayer(spec, doc, scale) {
  const labelStyle = TEXT_STYLES[spec.labelStyle] || TEXT_STYLES.badge;
  return {
    id: makeLayerId('shape'),
    type: 'shape',
    name: spec.name || 'Фигура',
    role: spec.role || '',
    shape: spec.shape || 'rect',
    x: pos(spec.x, doc.width),
    y: pos(spec.y, doc.height),
    width: pos(spec.width, doc.width),
    height: pos(spec.height, doc.height),
    rotation: spec.rotation || 0,
    opacity: spec.opacity ?? 1,
    visible: true,
    flipX: false,
    overlay: Boolean(spec.overlay),
    fill: spec.fill ?? null,
    gradient: spec.gradient || null,
    stroke: spec.stroke ?? null,
    strokeWidth: px(spec.strokeWidth || 0, scale),
    radius: px(spec.radius || 0, scale),
    label: spec.label || '',
    fontFamily: labelStyle.fontFamily,
    fontWeight: labelStyle.fontWeight,
    fontSize: px(spec.labelSize || labelStyle.size, scale),
    letterSpacing: px(spec.labelTracking ?? labelStyle.tracking, scale),
    uppercase: labelStyle.uppercase,
    labelColor: spec.labelColor || labelStyle.color,
  };
}

export const TEMPLATES = [
  {
    id: 'fashion',
    title: 'Fashion',
    description: 'Классический глянец: крупный мастохед, фото на всю ширину, коверлайны снизу.',
    background: '#f6f1e8',
    palette: { accent: '#e8432f', text: '#171310', secondary: '#c8a24a', plate: '#ffffff' },
    grid: { columns: 3, rows: 4, marginX: 0.06, marginY: 0.04 },
    photoSlot: { x: 0.06, y: 0.27, width: 0.88, height: 0.46 },
    layers: [
      { type: 'shape', shape: 'rect', name: 'Верхняя линия', x: 0.06, y: 0.035, width: 0.88, height: 0.0035, fill: '#e8432f' },
      { type: 'text', style: 'kicker', role: 'kicker', name: 'Рубрика', text: 'СЕЗОН · СТИЛЬ · ЛЮДИ', x: 0.06, y: 0.045, width: 0.6, overrides: { color: '#e8432f', size: 42 } },
      { type: 'text', style: 'issue', name: 'Номер', text: '№ 04 / 2026', x: 0.6, y: 0.045, width: 0.34, overrides: { size: 42 } },
      { type: 'text', style: 'masthead', role: 'masthead', name: 'Мастохед', text: 'МОДА', x: 0.05, y: 0.082, width: 0.9, overrides: { size: 560, tracking: -8, color: '#171310' } },
      { type: 'shape', shape: 'rect', name: 'Линия под мастохедом', x: 0.06, y: 0.252, width: 0.88, height: 0.0025, fill: '#171310' },
      { type: 'shape', shape: 'rect', name: 'Затемнение фото', overlay: true, x: 0, y: 0.5, width: 1, height: 0.24, gradient: { from: 'rgba(0,0,0,0)', to: 'rgba(0,0,0,0.48)', angle: 90 } },
      { type: 'shape', shape: 'rect', name: 'Плашка бейджа', x: 0.06, y: 0.29, width: 0.2, height: 0.055, fill: '#e8432f', radius: 6, label: 'ТОП-10', labelSize: 54 },
      { type: 'text', style: 'headline', role: 'headline', name: 'Главный заголовок', text: 'НОВАЯ\nКЛАССИКА', x: 0.075, y: 0.60, width: 0.72, overrides: { size: 250, color: '#ffffff' } },
      { type: 'text', style: 'coverline', role: 'coverline', name: 'Коверлайн 1', text: '20 ВЕЩЕЙ, КОТОРЫЕ СТОИТ ИМЕТЬ', x: 0.06, y: 0.755, width: 0.72, overrides: { size: 68, color: '#171310', shadowEnabled: false } },
      { type: 'text', style: 'coverline', role: 'coverline', name: 'Коверлайн 2', text: 'КАК СОЗДАТЬ СВОЙ СТИЛЬ', x: 0.06, y: 0.835, width: 0.55, overrides: { size: 66, color: '#e8432f', shadowEnabled: false } },
      { type: 'shape', shape: 'rect', name: 'Нижняя линия', x: 0.06, y: 0.925, width: 0.88, height: 0.0025, fill: '#171310' },
      { type: 'text', style: 'issue', name: 'Дата', text: 'ОКТЯБРЬ 2026', x: 0.06, y: 0.94, width: 0.5, overrides: { align: 'left', size: 44 } },
      { type: 'text', style: 'issue', name: 'Цена', text: 'WWW.JOURNAL.RU', x: 0.55, y: 0.94, width: 0.39, overrides: { size: 40 } },
    ],
  },
  {
    id: 'beauty',
    title: 'Beauty',
    description: 'Мягкий люкс: антиква, пудровые тона, золотистые детали и круглый бейдж.',
    background: '#f7e9e4',
    palette: { accent: '#b8834f', text: '#3b2b2b', secondary: '#d8a0a8', plate: '#fffaf6' },
    grid: { columns: 3, rows: 4, marginX: 0.07, marginY: 0.05 },
    photoSlot: { x: 0.0, y: 0.16, width: 1.0, height: 0.58 },
    layers: [
      { type: 'shape', shape: 'ellipse', name: 'Круглый бейдж', x: 0.72, y: 0.075, width: 0.17, height: 0.135, fill: '#b8834f', label: '№1\nВЫБОР', labelSize: 44 },
      { type: 'text', style: 'issue', name: 'Номер', text: '№ 07 · 2026', x: 0.07, y: 0.06, width: 0.4, overrides: { align: 'left', color: '#b8834f', size: 46 } },
      { type: 'text', style: 'masthead', role: 'masthead', name: 'Мастохед', text: 'BEAUTY', x: 0.04, y: 0.055, width: 0.62, overrides: { fontFamily: FONT_STACKS.elegant, size: 366, tracking: -4, color: '#3b2b2b', align: 'left' } },
      { type: 'text', style: 'kicker', role: 'kicker', name: 'Надзаголовок', text: 'СЕКРЕТЫ СИЯНИЯ', x: 0.07, y: 0.175, width: 0.6, overrides: { color: '#b8834f', align: 'left', size: 46 } },
      { type: 'text', style: 'quote', role: 'headline', name: 'Главный заголовок', text: 'Красота\nв деталях', x: 0.07, y: 0.63, width: 0.78, overrides: { size: 190, color: '#3b2b2b' } },
      { type: 'shape', shape: 'rect', name: 'Плашка', x: 0.07, y: 0.79, width: 0.42, height: 0.052, fill: '#b8834f', radius: 4, label: 'ГИД ПО УХОДУ', labelSize: 46 },
      { type: 'text', style: 'caption', role: 'coverline', name: 'Коверлайн', text: '12 средств, которые изменят вашу рутину', x: 0.07, y: 0.86, width: 0.62, overrides: { size: 78, color: '#3b2b2b' } },
      { type: 'text', style: 'issue', name: 'Дата', text: 'СЕНТЯБРЬ 2026', x: 0.07, y: 0.945, width: 0.5, overrides: { align: 'left', color: '#b8834f', size: 42 } },
      { type: 'text', style: 'issue', name: 'Сайт', text: 'BEAUTY.JOURNAL.RU', x: 0.55, y: 0.945, width: 0.38, overrides: { color: '#b8834f', size: 38 } },
    ],
  },
  {
    id: 'business',
    title: 'Business',
    description: 'Строгая сетка, много воздуха, тонкие линии и холодный акцент.',
    background: '#fbfbfc',
    palette: { accent: '#2f5fd0', text: '#111827', secondary: '#9aa3b2', plate: '#eef2fb' },
    grid: { columns: 4, rows: 5, marginX: 0.07, marginY: 0.05 },
    photoSlot: { x: 0.07, y: 0.29, width: 0.86, height: 0.42 },
    layers: [
      { type: 'shape', shape: 'rect', name: 'Акцентная полоса', x: 0.07, y: 0.05, width: 0.1, height: 0.006, fill: '#2f5fd0' },
      { type: 'text', style: 'kicker', role: 'kicker', name: 'Рубрика', text: 'ЕЖЕМЕСЯЧНЫЙ ДЕЛОВОЙ ЖУРНАЛ', x: 0.19, y: 0.045, width: 0.6, overrides: { color: '#2f5fd0', size: 38, tracking: 7 } },
      { type: 'text', style: 'masthead', role: 'masthead', name: 'Мастохед', text: 'БИЗНЕС', x: 0.06, y: 0.085, width: 0.88, overrides: { fontFamily: FONT_STACKS.grotesk, fontWeight: 800, size: 300, tracking: -10, color: '#111827' } },
      { type: 'shape', shape: 'rect', name: 'Линия', x: 0.07, y: 0.255, width: 0.86, height: 0.002, fill: '#111827' },
      { type: 'text', style: 'headline', role: 'headline', name: 'Главный заголовок', text: 'НОВАЯ\nЭКОНОМИКА', x: 0.07, y: 0.62, width: 0.74, overrides: { fontFamily: FONT_STACKS.grotesk, fontWeight: 800, size: 196, color: '#111827', shadowEnabled: false, lineHeight: 0.98 } },
      { type: 'text', style: 'coverline', role: 'coverline', name: 'Коверлайн 1', text: 'КУДА ИНВЕСТИРОВАТЬ В 2026', x: 0.07, y: 0.755, width: 0.58, overrides: { color: '#2f5fd0', shadowEnabled: false, size: 72 } },
      { type: 'shape', shape: 'rect', name: 'Разделитель', x: 0.07, y: 0.83, width: 0.86, height: 0.0015, fill: '#d7dce5' },
      { type: 'text', style: 'coverline', role: 'coverline', name: 'Коверлайн 2', text: 'ЛИДЕРЫ РЫНКА: ИСТОРИИ УСПЕХА', x: 0.07, y: 0.86, width: 0.7, overrides: { color: '#111827', shadowEnabled: false, size: 58 } },
      { type: 'text', style: 'issue', name: 'Номер', text: '№ 09 / 2026', x: 0.07, y: 0.945, width: 0.4, overrides: { align: 'left', color: '#9aa3b2', size: 42 } },
      { type: 'text', style: 'issue', name: 'Сайт', text: 'BUSINESS.JOURNAL.RU', x: 0.55, y: 0.945, width: 0.38, overrides: { color: '#9aa3b2', size: 36 } },
    ],
  },
  {
    id: 'tech',
    title: 'Tech',
    description: 'Тёмная обложка, конденсированный шрифт, неоновый акцент и геометрия.',
    background: '#101216',
    palette: { accent: '#9bff5a', text: '#f2f6f0', secondary: '#5c6b78', plate: '#191d23' },
    grid: { columns: 3, rows: 4, marginX: 0.06, marginY: 0.04 },
    photoSlot: { x: 0.0, y: 0.2, width: 1.0, height: 0.52 },
    layers: [
      { type: 'shape', shape: 'rect', name: 'Верхняя полоса', x: 0.0, y: 0.0, width: 1.0, height: 0.012, fill: '#9bff5a' },
      { type: 'text', style: 'kicker', name: 'Рубрика', text: 'ГАДЖЕТЫ · ИИ · БУДУЩЕЕ', x: 0.06, y: 0.04, width: 0.6, overrides: { color: '#9bff5a', size: 42 } },
      { type: 'text', style: 'issue', name: 'Номер', text: '№ 12 / 2026', x: 0.62, y: 0.04, width: 0.32, overrides: { color: '#f2f6f0', size: 42 } },
      { type: 'text', style: 'masthead', role: 'masthead', name: 'Мастохед', text: 'ТЕХНО', x: 0.05, y: 0.072, width: 0.9, overrides: { fontFamily: FONT_STACKS.condensed, fontWeight: 400, size: 560, tracking: 4, color: '#f2f6f0' } },
      { type: 'shape', shape: 'rect', name: 'Затемнение фото', overlay: true, x: 0, y: 0.46, width: 1, height: 0.28, gradient: { from: 'rgba(0,0,0,0)', to: 'rgba(0,0,0,0.62)', angle: 90 } },
      { type: 'shape', shape: 'ellipse', name: 'Акцентный круг', x: 0.78, y: 0.61, width: 0.16, height: 0.13, fill: '#9bff5a', label: 'AI', labelSize: 90, labelColor: '#101216' },
      { type: 'text', style: 'headline', role: 'headline', name: 'Главный заголовок', text: 'БУДУЩЕЕ\nУЖЕ ЗДЕСЬ', x: 0.06, y: 0.63, width: 0.68, overrides: { size: 200, color: '#9bff5a', shadowEnabled: false } },
      { type: 'text', style: 'coverline', role: 'coverline', name: 'Коверлайн', text: 'КАК ИИ МЕНЯЕТ ВСЁ ВОКРУГ', x: 0.06, y: 0.795, width: 0.66, overrides: { size: 66, color: '#f2f6f0', shadowEnabled: false } },
      { type: 'shape', shape: 'rect', name: 'Линия', x: 0.06, y: 0.87, width: 0.88, height: 0.002, fill: '#3a444e' },
      { type: 'text', style: 'issue', name: 'Дата', text: 'ДЕКАБРЬ 2026', x: 0.06, y: 0.9, width: 0.4, overrides: { align: 'left', color: '#8b98a6', size: 40 } },
      { type: 'text', style: 'issue', name: 'Сайт', text: 'TECH.JOURNAL.RU', x: 0.55, y: 0.9, width: 0.39, overrides: { color: '#8b98a6', size: 36 } },
    ],
  },
  {
    id: 'travel',
    title: 'Travel',
    description: 'Яркий акцидентный шрифт, тёплый оранжевый и наклейка «NEW».',
    background: '#fdf6e9',
    palette: { accent: '#ff6b35', text: '#1d2b36', secondary: '#2f8f9d', plate: '#ffffff' },
    grid: { columns: 3, rows: 4, marginX: 0.06, marginY: 0.04 },
    photoSlot: { x: 0.0, y: 0.21, width: 1.0, height: 0.55 },
    layers: [
      { type: 'text', style: 'kicker', name: 'Рубрика', text: 'ПУТЕШЕСТВИЯ · ОТКРЫТИЯ', x: 0.06, y: 0.04, width: 0.62, overrides: { color: '#ff6b35', size: 44 } },
      { type: 'text', style: 'issue', name: 'Номер', text: '№ 03 / 2026', x: 0.62, y: 0.04, width: 0.32, overrides: { size: 42 } },
      { type: 'text', style: 'masthead', role: 'masthead', name: 'Мастохед', text: 'ПУТЬ', x: 0.05, y: 0.068, width: 0.9, overrides: { fontFamily: FONT_STACKS.accent, fontWeight: 400, size: 520, tracking: -2, color: '#1d2b36' } },
      { type: 'shape', shape: 'rect', name: 'Затемнение фото', overlay: true, x: 0, y: 0.52, width: 1, height: 0.26, gradient: { from: 'rgba(0,0,0,0)', to: 'rgba(0,0,0,0.5)', angle: 90 } },
      { type: 'shape', shape: 'rect', name: 'Наклейка NEW', x: 0.74, y: 0.60, width: 0.17, height: 0.06, fill: '#ff6b35', rotation: -8, radius: 8, label: 'NEW!', labelSize: 62 },
      { type: 'text', style: 'headline', role: 'headline', name: 'Главный заголовок', text: 'ТУДА,\nГДЕ ЛЕТО', x: 0.06, y: 0.65, width: 0.62, overrides: { fontFamily: FONT_STACKS.accent, fontWeight: 400, size: 200, color: '#ffffff' } },
      { type: 'text', style: 'coverline', role: 'coverline', name: 'Коверлайн', text: '10 МЕСТ, КОТОРЫЕ СТОИТ УВИДЕТЬ', x: 0.06, y: 0.80, width: 0.7, overrides: { color: '#1d2b36', shadowEnabled: false, size: 64 } },
      { type: 'shape', shape: 'rect', name: 'Линия', x: 0.06, y: 0.88, width: 0.88, height: 0.002, fill: '#1d2b36' },
      { type: 'text', style: 'issue', name: 'Дата', text: 'ИЮЛЬ 2026', x: 0.06, y: 0.905, width: 0.4, overrides: { align: 'left', size: 42 } },
      { type: 'text', style: 'issue', name: 'Сайт', text: 'TRAVEL.JOURNAL.RU', x: 0.55, y: 0.905, width: 0.39, overrides: { size: 36 } },
    ],
  },
  {
    id: 'food',
    title: 'Food',
    description: 'Уютная кулинарная обложка: антиква, терракота, круглый бейдж и подписи.',
    background: '#fbf2e4',
    palette: { accent: '#c65b3c', text: '#2b211a', secondary: '#7a9b62', plate: '#fff9ee' },
    grid: { columns: 3, rows: 4, marginX: 0.07, marginY: 0.04 },
    photoSlot: { x: 0.07, y: 0.26, width: 0.86, height: 0.48 },
    layers: [
      { type: 'text', style: 'kicker', name: 'Рубрика', text: 'РЕЦЕПТЫ · ВКУСЫ · ИДЕИ', x: 0.07, y: 0.045, width: 0.6, overrides: { color: '#c65b3c', size: 42, tracking: 6 } },
      { type: 'text', style: 'issue', name: 'Номер', text: '№ 05 / 2026', x: 0.62, y: 0.045, width: 0.31, overrides: { size: 40 } },
      { type: 'text', style: 'masthead', role: 'masthead', name: 'Мастохед', text: 'ВКУСНО', x: 0.05, y: 0.075, width: 0.9, overrides: { fontFamily: FONT_STACKS.elegant, fontWeight: 700, size: 430, tracking: -2, color: '#2b211a' } },
      { type: 'shape', shape: 'ellipse', name: 'Круглый бейдж', x: 0.72, y: 0.62, width: 0.18, height: 0.14, fill: '#c65b3c', label: 'РЕЦЕПТ\nНЕДЕЛИ', labelSize: 42 },
      { type: 'text', style: 'quote', role: 'headline', name: 'Главный заголовок', text: 'Еда, которая\nрадует', x: 0.07, y: 0.635, width: 0.62, overrides: { size: 160, color: '#c65b3c' } },
      { type: 'text', style: 'coverline', role: 'coverline', name: 'Коверлайн 1', text: 'ГЛАВНЫЕ РЕЦЕПТЫ ОСЕНИ', x: 0.07, y: 0.79, width: 0.6, overrides: { color: '#2b211a', shadowEnabled: false, size: 66, fontFamily: FONT_STACKS.grotesk } },
      { type: 'text', style: 'caption', role: 'coverline', name: 'Коверлайн 2', text: 'Сезонные продукты и простые идеи для каждого дня', x: 0.07, y: 0.865, width: 0.7, overrides: { size: 62, color: '#7a9b62' } },
      { type: 'shape', shape: 'rect', name: 'Линия', x: 0.07, y: 0.93, width: 0.86, height: 0.002, fill: '#2b211a' },
      { type: 'text', style: 'issue', name: 'Дата', text: 'ОКТЯБРЬ 2026', x: 0.07, y: 0.945, width: 0.4, overrides: { align: 'left', size: 38 } },
      { type: 'text', style: 'issue', name: 'Сайт', text: 'FOOD.JOURNAL.RU', x: 0.55, y: 0.945, width: 0.38, overrides: { size: 34 } },
    ],
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((template) => template.id === id) || TEMPLATES[0];
}

// Превращает описание шаблона в готовый массив слоёв для CoverEditor.
export function instantiateTemplate(template, doc) {
  const scale = doc.width / REF_WIDTH;
  const layers = [];
  for (const spec of template.layers) {
    if (spec.type === 'shape') layers.push(buildShapeLayer(spec, doc, scale));
    else if (spec.type === 'text') layers.push(buildTextLayer(spec, doc, scale));
  }
  return layers;
}

// Случайная вариация: перекрашивает акцентные слои и плашки в другой цвет палитры.
export function accentPalette(template, index) {
  const keys = ['accent', 'secondary', 'text'];
  const active = keys[index % keys.length];
  const source = template.palette[active] || template.palette.accent;
  return source;
}
