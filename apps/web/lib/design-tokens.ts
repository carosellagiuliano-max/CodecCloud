export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px'
} as const;

export const typography = {
  fontFamily: '"Inter Variable", system-ui, -apple-system, BlinkMacSystemFont',
  headings: {
    h1: { size: '2.5rem', lineHeight: 1.1, weight: 700 },
    h2: { size: '2rem', lineHeight: 1.2, weight: 600 },
    h3: { size: '1.5rem', lineHeight: 1.3, weight: 600 }
  },
  body: { size: '1rem', lineHeight: 1.5, weight: 400 }
} as const;

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  xl: '20px',
  '2xl': '28px'
} as const;

export const shadows = {
  soft: '0 16px 30px rgba(23, 37, 84, 0.16)',
  focus: '0 0 0 3px rgba(59, 111, 255, 0.3)'
} as const;

export type DesignTokens = {
  spacing: typeof spacing;
  typography: typeof typography;
  radii: typeof radii;
  shadows: typeof shadows;
};

export const designTokens: DesignTokens = {
  spacing,
  typography,
  radii,
  shadows
};
