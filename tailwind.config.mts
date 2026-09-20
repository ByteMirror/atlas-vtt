import type { Config } from "tailwindcss"

/**
 * Tailwind CSS Configuration for Obsidian Plugins
 *
 * This config maps Obsidian's CSS variables to Tailwind utilities,
 * allowing seamless theme integration. Preflight is disabled to
 * avoid conflicts with Obsidian's base styles.
 *
 * Based on: https://github.com/zeroliu/obsidian-tailwindcss
 */
const config = {
  content: [
    './UI/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  // Scope every utility under the plugin root so nothing leaks into Obsidian's UI
  important: '.atlas-vtt-plugin',
  corePlugins: {
    preflight: false, // Disable to avoid conflicts with Obsidian styles
  },
  theme: {
    // ==========================================================================
    // Obsidian Color System
    // ==========================================================================
    colors: {
      // Transparent and current
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',

      // Base grayscale palette (00 = lightest in light mode, darkest in dark mode)
      base: {
        "00": "var(--color-base-00)",
        "05": "var(--color-base-05)",
        "10": "var(--color-base-10)",
        "20": "var(--color-base-20)",
        "25": "var(--color-base-25)",
        "30": "var(--color-base-30)",
        "35": "var(--color-base-35)",
        "40": "var(--color-base-40)",
        "50": "var(--color-base-50)",
        "60": "var(--color-base-60)",
        "70": "var(--color-base-70)",
        "100": "var(--color-base-100)",
      },

      // Semantic colors with RGB variants for opacity support
      red: "var(--color-red)",
      "red-rgb": "rgba(var(--color-red-rgb),<alpha-value>)",
      orange: "var(--color-orange)",
      "orange-rgb": "rgba(var(--color-orange-rgb),<alpha-value>)",
      yellow: "var(--color-yellow)",
      "yellow-rgb": "rgba(var(--color-yellow-rgb),<alpha-value>)",
      green: "var(--color-green)",
      "green-rgb": "rgba(var(--color-green-rgb),<alpha-value>)",
      cyan: "var(--color-cyan)",
      "cyan-rgb": "rgba(var(--color-cyan-rgb),<alpha-value>)",
      blue: "var(--color-blue)",
      "blue-rgb": "rgba(var(--color-blue-rgb),<alpha-value>)",
      purple: "var(--color-purple)",
      "purple-rgb": "rgba(var(--color-purple-rgb),<alpha-value>)",
      pink: "var(--color-pink)",
      "pink-rgb": "rgba(var(--color-pink-rgb),<alpha-value>)",
      gray: "var(--color-gray)",

      // Monochrome RGB for opacity
      "mono-rgb": {
        "0": "rgba(var(--mono-rgb-0),<alpha-value>)",
        "100": "rgba(var(--mono-rgb-100),<alpha-value>)",
      },

      // Background colors
      background: {
        primary: "var(--background-primary)",
        "primary-alt": "var(--background-primary-alt)",
        secondary: "var(--background-secondary)",
        "secondary-alt": "var(--background-secondary-alt)",
        modifier: {
          hover: "var(--background-modifier-hover)",
          "active-hover": "var(--background-modifier-active-hover)",
          border: "var(--background-modifier-border)",
          "border-hover": "var(--background-modifier-border-hover)",
          "border-focus": "var(--background-modifier-border-focus)",
          error: "var(--background-modifier-error)",
          "error-rgb": "rgba(var(--background-modifier-error-rgb),<alpha-value>)",
          "error-hover": "var(--background-modifier-error-hover)",
          success: "var(--background-modifier-success)",
          "success-rgb": "rgba(var(--background-modifier-success-rgb),<alpha-value>)",
          message: "var(--background-modifier-message)",
          "form-field": "var(--background-form-field)",
        },
      },

      // Interactive states (buttons, links, etc.)
      interactive: {
        normal: "var(--interactive-normal)",
        hover: "var(--interactive-hover)",
        accent: "var(--interactive-accent)",
        "accent-hsl": "hsl(var(--interactive-accent-hsl),<alpha-value>)",
        "accent-hover": "var(--interactive-accent-hover)",
      },

      // Text colors
      text: {
        normal: "var(--text-normal)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        "on-accent": "var(--text-on-accent)",
        "on-accent-inverted": "var(--text-on-accent-inverted)",
        success: "var(--text-success)",
        warning: "var(--text-warning)",
        error: "var(--text-error)",
        accent: "var(--text-accent)",
        "accent-hover": "var(--text-accent-hover)",
        selection: "var(--text-selection)",
        "highlight-bg": "var(--text-highlight-bg)",
        bold: "var(--bold-color)",
        italic: "var(--italic-color)",
      },

      // Caret and icon colors
      caret: "var(--caret-color)",
      icon: {
        DEFAULT: "var(--icon-color)",
        hover: "var(--icon-color-hover)",
        active: "var(--icon-color-active)",
        focused: "var(--icon-color-focused)",
      },

      // shadcn semantic colors
      primary: {
        DEFAULT: "var(--primary)",
        foreground: "var(--primary-foreground)",
      },
      secondary: {
        DEFAULT: "var(--secondary)",
        foreground: "var(--secondary-foreground)",
      },
      destructive: {
        DEFAULT: "var(--destructive)",
        foreground: "var(--destructive-foreground)",
      },
      accent: {
        DEFAULT: "var(--accent)",
        foreground: "var(--accent-foreground)",
      },
      muted: {
        DEFAULT: "var(--muted)",
        foreground: "var(--muted-foreground)",
      },
      card: {
        DEFAULT: "var(--card)",
        foreground: "var(--card-foreground)",
      },
      popover: {
        DEFAULT: "var(--popover)",
        foreground: "var(--popover-foreground)",
      },
      border: "var(--border)",
      input: "var(--input)",
      ring: "var(--ring)",
      foreground: "var(--foreground)",
    },

    // ==========================================================================
    // Border Styles
    // ==========================================================================
    borderWidth: {
      DEFAULT: "var(--border-width)",
      "0": "0",
      "1": "1px",
      "2": "2px",
      "4": "4px",
    },

    borderRadius: {
      none: "0",
      "clickable-icon": "var(--clickable-icon-radius)",
      s: "var(--radius-s)",
      m: "var(--radius-m)",
      l: "var(--radius-l)",
      xl: "var(--radius-xl)",
      full: "9999px",
    },

    // ==========================================================================
    // Z-Index Layers (Obsidian's layer system)
    // ==========================================================================
    zIndex: {
      auto: "auto",
      "0": "0",
      "10": "10",
      "20": "20",
      "30": "30",
      "40": "40",
      "50": "50",
      tooltip: "var(--layer-tooltip)",
      menu: "var(--layer-menu)",
      notice: "var(--layer-notice)",
      modal: "var(--layer-modal)",
      slides: "var(--layer-slides)",
      popover: "var(--layer-popover)",
      "status-bar": "var(--layer-status-bar)",
      sidedock: "var(--layer-sidedock)",
      cover: "var(--layer-cover)",
      "dragged-item": "var(--layer-dragged-item)",
    },

    // ==========================================================================
    // Typography
    // ==========================================================================
    fontSize: {
      // Obsidian font sizes
      text: "var(--font-text-size)",
      smallest: "var(--font-smallest)",
      smaller: "var(--font-smaller)",
      small: "var(--font-small)",
      "ui-smaller": "var(--font-ui-smaller)",
      "ui-small": "var(--font-ui-small)",
      "ui-medium": "var(--font-ui-medium)",
      "ui-larger": "var(--font-ui-larger)",
      // Standard sizes as fallback
      xs: ["0.75rem", { lineHeight: "1rem" }],
      sm: ["0.875rem", { lineHeight: "1.25rem" }],
      base: ["1rem", { lineHeight: "1.5rem" }],
      lg: ["1.125rem", { lineHeight: "1.75rem" }],
      xl: ["1.25rem", { lineHeight: "1.75rem" }],
      "2xl": ["1.5rem", { lineHeight: "2rem" }],
    },

    fontWeight: {
      thin: "var(--font-thin)",
      extralight: "var(--font-extralight)",
      light: "var(--font-light)",
      normal: "var(--font-normal)",
      medium: "var(--font-medium)",
      semibold: "var(--font-semibold)",
      bold: "var(--font-bold)",
      extrabold: "var(--font-extrabold)",
      black: "var(--font-black)",
    },

    lineHeight: {
      none: "1",
      tight: "var(--line-height-tight)",
      normal: "var(--line-height-normal)",
      relaxed: "1.625",
      loose: "2",
    },

    // ==========================================================================
    // Icons
    // ==========================================================================
    strokeWidth: {
      "0": "0",
      "1": "1",
      "2": "2",
      icon: "var(--icon-stroke)",
      "icon-xs": "var(--icon-xs-stroke-width)",
      "icon-s": "var(--icon-s-stroke-width)",
      "icon-m": "var(--icon-m-stroke-width)",
      "icon-l": "var(--icon-l-stroke-width)",
      "icon-xl": "var(--icon-xl-stroke-width)",
    },

    // ==========================================================================
    // Extended Utilities
    // ==========================================================================
    extend: {
      cursor: {
        DEFAULT: "var(--cursor)",
        link: "var(--cursor-link)",
      },

      size: {
        icon: "var(--icon-size)",
        "icon-xs": "var(--icon-xs)",
        "icon-s": "var(--icon-s)",
        "icon-m": "var(--icon-m)",
        "icon-l": "var(--icon-l)",
        "icon-xl": "var(--icon-xl)",
        checkbox: "var(--checkbox-size)",
      },

      opacity: {
        icon: "var(--icon-opacity)",
        "icon-hover": "var(--icon-opacity-hover)",
        "icon-active": "var(--icon-opacity-active)",
      },

      spacing: {
        "0.5": "0.125rem",
        "1.5": "0.375rem",
        "2.5": "0.625rem",
        "3.5": "0.875rem",
      },

      // Animation keyframes (from shadcn)
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-in-from-bottom": {
          from: { transform: "translateY(4px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "fade-out": "fade-out 0.15s ease-out",
        "slide-in": "slide-in-from-bottom 0.15s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
