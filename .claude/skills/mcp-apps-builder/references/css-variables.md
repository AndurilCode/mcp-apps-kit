# MCP Apps Standardized CSS Variables

Complete list of standardized CSS variables for MCP Apps theming. Apps should define fallback values for all variables they use.

## Usage

```css
:root {
  /* Define fallbacks for graceful degradation */
  --color-background-primary: light-dark(#ffffff, #171717);
  --color-text-primary: light-dark(#171717, #fafafa);
  --font-sans: system-ui, -apple-system, sans-serif;
}

.container {
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}
```

## Background Colors

```css
--color-background-primary     /* Primary background */
--color-background-secondary   /* Secondary background */
--color-background-tertiary    /* Tertiary background */
--color-background-inverse     /* Inverse background */
--color-background-ghost       /* Ghost/transparent background */
--color-background-info        /* Info state background */
--color-background-danger      /* Danger/error state background */
--color-background-success     /* Success state background */
--color-background-warning     /* Warning state background */
--color-background-disabled    /* Disabled state background */
```

## Text Colors

```css
--color-text-primary           /* Primary text */
--color-text-secondary         /* Secondary text */
--color-text-tertiary          /* Tertiary text */
--color-text-inverse           /* Inverse text */
--color-text-info              /* Info state text */
--color-text-danger            /* Danger/error state text */
--color-text-success           /* Success state text */
--color-text-warning           /* Warning state text */
--color-text-disabled          /* Disabled state text */
--color-text-ghost             /* Ghost/transparent text */
```

## Border Colors

```css
--color-border-primary         /* Primary border */
--color-border-secondary       /* Secondary border */
--color-border-tertiary        /* Tertiary border */
--color-border-inverse         /* Inverse border */
--color-border-ghost           /* Ghost/transparent border */
--color-border-info            /* Info state border */
--color-border-danger          /* Danger/error state border */
--color-border-success         /* Success state border */
--color-border-warning         /* Warning state border */
--color-border-disabled        /* Disabled state border */
```

## Ring Colors (Focus States)

```css
--color-ring-primary           /* Primary focus ring */
--color-ring-secondary         /* Secondary focus ring */
--color-ring-inverse           /* Inverse focus ring */
--color-ring-info              /* Info state focus ring */
--color-ring-danger            /* Danger/error state focus ring */
--color-ring-success           /* Success state focus ring */
--color-ring-warning           /* Warning state focus ring */
```

## Typography - Font Family

```css
--font-sans                    /* Sans-serif font stack */
--font-mono                    /* Monospace font stack */
```

## Typography - Font Weight

```css
--font-weight-normal           /* Normal weight (typically 400) */
--font-weight-medium           /* Medium weight (typically 500) */
--font-weight-semibold         /* Semibold weight (typically 600) */
--font-weight-bold             /* Bold weight (typically 700) */
```

## Typography - Text Size

```css
--font-text-xs-size            /* Extra small text size */
--font-text-sm-size            /* Small text size */
--font-text-md-size            /* Medium text size */
--font-text-lg-size            /* Large text size */
```

## Typography - Text Line Height

```css
--font-text-xs-line-height     /* Extra small text line height */
--font-text-sm-line-height     /* Small text line height */
--font-text-md-line-height     /* Medium text line height */
--font-text-lg-line-height     /* Large text line height */
```

## Typography - Heading Size

```css
--font-heading-xs-size         /* Extra small heading size */
--font-heading-sm-size         /* Small heading size */
--font-heading-md-size         /* Medium heading size */
--font-heading-lg-size         /* Large heading size */
--font-heading-xl-size         /* Extra large heading size */
--font-heading-2xl-size        /* 2X large heading size */
--font-heading-3xl-size        /* 3X large heading size */
```

## Typography - Heading Line Height

```css
--font-heading-xs-line-height  /* Extra small heading line height */
--font-heading-sm-line-height  /* Small heading line height */
--font-heading-md-line-height  /* Medium heading line height */
--font-heading-lg-line-height  /* Large heading line height */
--font-heading-xl-line-height  /* Extra large heading line height */
--font-heading-2xl-line-height /* 2X large heading line height */
--font-heading-3xl-line-height /* 3X large heading line height */
```

## Border Radius

```css
--border-radius-xs             /* Extra small radius */
--border-radius-sm             /* Small radius */
--border-radius-md             /* Medium radius */
--border-radius-lg             /* Large radius */
--border-radius-xl             /* Extra large radius */
--border-radius-full           /* Full/circle radius */
```

## Border Width

```css
--border-width-regular         /* Regular border width */
```

## Shadows

```css
--shadow-hairline              /* Hairline/minimal shadow */
--shadow-sm                    /* Small shadow */
--shadow-md                    /* Medium shadow */
--shadow-lg                    /* Large shadow */
```

## Light/Dark Mode Support

Use CSS `light-dark()` function for automatic light/dark mode support:

```css
:root {
  /* Single value works in both modes */
  --color-background-primary: light-dark(#ffffff, #171717);
  --color-text-primary: light-dark(#171717, #fafafa);
}
```

## Example Fallbacks

Recommended fallback values for common variables:

```css
:root {
  /* Backgrounds */
  --color-background-primary: light-dark(#ffffff, #171717);
  --color-background-secondary: light-dark(#f5f5f5, #262626);
  --color-background-tertiary: light-dark(#e5e5e5, #404040);
  
  /* Text */
  --color-text-primary: light-dark(#171717, #fafafa);
  --color-text-secondary: light-dark(#525252, #a3a3a3);
  --color-text-tertiary: light-dark(#737373, #737373);
  
  /* Borders */
  --color-border-primary: light-dark(#e5e5e5, #404040);
  --color-border-secondary: light-dark(#d4d4d4, #525252);
  
  /* Typography */
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace;
  
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  --font-text-sm-size: 0.875rem;
  --font-text-md-size: 1rem;
  --font-text-lg-size: 1.125rem;
  
  --font-text-sm-line-height: 1.25rem;
  --font-text-md-line-height: 1.5rem;
  --font-text-lg-line-height: 1.75rem;
  
  --font-heading-md-size: 1.125rem;
  --font-heading-lg-size: 1.5rem;
  --font-heading-xl-size: 1.875rem;
  
  /* Border radius */
  --border-radius-sm: 0.25rem;
  --border-radius-md: 0.5rem;
  --border-radius-lg: 0.75rem;
  --border-radius-full: 9999px;
  
  /* Border width */
  --border-width-regular: 1px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

## Applying Host-Provided Variables

### Vanilla JS/TypeScript

```typescript
import { applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";

app.onhostcontextchange = (context) => {
  if (context.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
};
```

### React

```typescript
import { useHostStyleVariables } from "@modelcontextprotocol/ext-apps/react";

function MyApp() {
  useHostStyleVariables(); // Automatically applies variables
  
  return <div>Themed content</div>;
}
```

## Custom Fonts

Hosts may provide custom fonts via `styles.css.fonts`:

```typescript
// Host provides
{
  styles: {
    css: {
      fonts: "@import url('https://fonts.googleapis.com/css2?family=Custom&display=swap');"
    }
  }
}

// App applies
import { applyHostFonts } from "@modelcontextprotocol/ext-apps";

if (context.styles?.css?.fonts) {
  applyHostFonts(context.styles.css.fonts);
}
```

## Notes

- **Graceful degradation**: Always define fallbacks; hosts may not provide all variables
- **Consistency**: Hosts should use `light-dark()` for theme-aware values
- **Spacing omitted**: Layout spacing intentionally excluded - vary from design to design
- **No component library**: Variables are framework-agnostic and work across any UI framework
