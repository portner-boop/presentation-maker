import {
  ActionIcon,
  Button,
  type CSSVariablesResolver,
  createTheme,
  Input,
  type MantineColorsTuple,
  Notification,
  SegmentedControl,
  Select,
  Tooltip,
} from '@mantine/core';

/** Лайм брендбука в центре шкалы (индекс 5) — primary action, running, selected. */
const lime: MantineColorsTuple = [
  '#e6fdf0',
  '#c7f9db',
  '#95f3bb',
  '#5eec98',
  '#2ce87b',
  '#00e564',
  '#00c957',
  '#00a347',
  '#0a7a38',
  '#084d2a',
];

/** Зелёные брендбука: 0 — accent soft, 5 — accent ink, 7 — deep green, 9 — dark green. */
const brand: MantineColorsTuple = [
  '#e0f7e9',
  '#c3ebd3',
  '#93d8ae',
  '#5cbf84',
  '#2ea35f',
  '#0a7a38',
  '#086b32',
  '#084d2a',
  '#053a24',
  '#00281f',
];

/** Нейтрали с лёгким уклоном в зелёный бренда: 2 — линии, 6 — вторичный текст (5.6:1 на белом). */
const gray: MantineColorsTuple = [
  '#f6f8f7',
  '#eef2f0',
  '#e5eae7',
  '#cdd6d1',
  '#a9b6b0',
  '#7a8c84',
  '#5b6b64',
  '#3e4c46',
  '#22302a',
  '#0f1c17',
];

const fontFamily =
  "'Plus Jakarta Sans Variable', 'Manrope Variable', ui-sans-serif, system-ui, sans-serif";

export const theme = createTheme({
  fontFamily,
  headings: {
    fontFamily,
    fontWeight: '700',
    textWrap: 'balance',
    sizes: {
      h1: { fontSize: '30px', lineHeight: '1.15', fontWeight: '700' },
      h2: { fontSize: '20px', lineHeight: '1.25', fontWeight: '600' },
      h3: { fontSize: '16px', lineHeight: '1.35', fontWeight: '600' },
      h4: { fontSize: '14px', lineHeight: '1.4', fontWeight: '600' },
    },
  },
  colors: { lime, brand, gray },
  primaryColor: 'lime',
  primaryShade: 5,
  black: '#00281f',
  white: '#ffffff',
  autoContrast: true,
  luminanceThreshold: 0.45,
  defaultRadius: 'md',
  radius: { xs: '6px', sm: '8px', md: '10px', lg: '16px', xl: '20px' },
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  fontSizes: { xs: '12px', sm: '13px', md: '14px', lg: '16px', xl: '20px' },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.55', lg: '1.6', xl: '1.6' },
  cursorType: 'pointer',
  focusRing: 'auto',
  // тени только у всплывающих элементов, карточки живут на границах
  shadows: {
    xs: 'none',
    sm: '0 1px 2px rgb(0 40 31 / 0.06)',
    md: '0 12px 32px -8px rgb(0 40 31 / 0.14), 0 2px 6px rgb(0 40 31 / 0.06)',
    lg: '0 20px 48px -12px rgb(0 40 31 / 0.18)',
    xl: '0 24px 64px -16px rgb(0 40 31 / 0.2)',
  },
  components: {
    Button: Button.extend({
      defaultProps: { size: 'md' },
      vars: (_theme, props) => ({
        root: {
          '--button-fz': props.size === 'xs' || props.size === 'compact-sm' ? '12px' : '14px',
          '--button-height':
            props.size === 'sm' ? '36px' : props.size === 'md' ? '40px' : undefined,
        },
      }),
      styles: { root: { fontWeight: 600 } },
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: { variant: 'subtle', color: 'brand.9', size: 'lg' },
    }),
    Input: Input.extend({
      vars: (_theme, props) => ({
        wrapper: { '--input-height': props.size === 'sm' ? '36px' : '42px', '--input-fz': '14px' },
      }),
    }),
    Select: Select.extend({ defaultProps: { size: 'md', allowDeselect: false } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { radius: 'md' } }),
    Tooltip: Tooltip.extend({
      defaultProps: { color: 'brand.9', openDelay: 300, withArrow: true },
    }),
    Notification: Notification.extend({ defaultProps: { radius: 'lg' } }),
  },
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#ffffff',
    '--mantine-color-text': '#00281f',
    '--mantine-color-dimmed': '#5b6b64',
    '--mantine-color-placeholder': '#5b6b64',
    '--mantine-color-default-border': '#e5eae7',
    '--mantine-color-default-hover': '#f6f8f7',
    '--mantine-color-anchor': '#0a7a38',
  },
  dark: {},
});
