import type { Config } from 'tailwindcss';

/**
 * Bleachers "Liquid Glass" design system.
 *
 * Every value here is a token. Screens consume tokens only — no one-off colors,
 * radii, blurs, or shadows in component files. Raw color/opacity values live as
 * CSS custom properties in globals.css; this file maps them to Tailwind utilities.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- New Liquid Glass tokens (used by the rebuilt UI) ---
        canvas: 'var(--bg-base)',
        glass: {
          DEFAULT: 'var(--glass-fill)',
          strong: 'var(--glass-fill-strong)',
          faint: 'var(--glass-fill-faint)',
        },
        hairline: 'var(--glass-border)',
        ink: {
          1: 'var(--text-1)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
        },
        brand: {
          DEFAULT: 'var(--accent)',
          2: 'var(--accent-2)',
          ink: 'var(--accent-ink)',
        },
        live: 'var(--live)',
        negative: 'var(--negative)',
        warning: 'var(--warning)',

        // --- Legacy semantic tokens (kept so not-yet-rebuilt screens still render
        //     on the new dark palette during the incremental rollout) ---
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent-legacy))',
          foreground: 'hsl(var(--accent-legacy-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
      fontSize: {
        // Semantic scale — deliberately few sizes.
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.16em', fontWeight: '600' }],
        stat: ['1.625rem', { lineHeight: '1', letterSpacing: '-0.01em', fontWeight: '700' }],
        'score-sm': ['2.25rem', { lineHeight: '0.9', letterSpacing: '-0.015em', fontWeight: '800' }],
        score: ['clamp(3.25rem, 13vw, 5rem)', { lineHeight: '0.85', letterSpacing: '-0.02em', fontWeight: '800' }],
      },
      borderRadius: {
        none: '0',
        sm: '12px',
        DEFAULT: '16px',
        md: '16px',
        lg: '20px',
        xl: '24px',
        '2xl': '28px',
        '3xl': '32px',
        full: '9999px',
        pill: '9999px',
      },
      backdropBlur: {
        xs: '8px',
        sm: '12px',
        md: '20px',
        lg: '32px',
        xl: '48px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 var(--glass-highlight)',
        raised: '0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 var(--glass-highlight)',
        // Flat, tactile lift for accent buttons — a real drop shadow + top light, no glow.
        button: '0 6px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.22)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        rise: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        breathe: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.82)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        rise: 'rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        breathe: 'breathe 2s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
