# Newsprint Design System - Complete

A comprehensive design system built with shadcn/ui primitives and lucide-react icons, implementing a bold newspaper-inspired aesthetic.

## What's Included

### Design Tokens (`src/app/globals.css`)
- **Colors**: Newsprint palette (off-white background, ink black foreground, editorial red accent)
- **Typography**: Playfair Display (serif), Lora (body), Inter (sans), JetBrains Mono (mono)
- **Borders**: Sharp corners (0px radius), high-contrast borders
- **Custom Utilities**: 
  - `.newsprint-texture` - Subtle grid overlay
  - `.hard-shadow-hover` - Hard offset shadow on hover
  - `.drop-cap` - First letter drop cap styling
  - `.grid-border-r` - Responsive grid borders

### Layout Components (`src/components/layout/`)
- **Container** - Max-width container with responsive padding
- **Grid** - 12-column grid system with collapsed border support
- **Section** - Section wrapper with inverted/texture variants

### Typography Components (`src/components/typography/`)
- **Headline** - Display headings with hero/section/card/subheading sizes
- **Label** - Uppercase tracking labels for navigation and metadata
- **Body** - Body text with optional drop cap and justified alignment
- **Metadata** - Small uppercase metadata text
- **Ornament** - Decorative section dividers

### UI Components (`src/components/ui/`)
- **Button** - 5 variants (default, secondary, ghost, accent, link) with 4 sizes
- **Card** - Card with header, title, description, content, footer
- **Input** - Text input with bottom border styling
- **Badge** - Status badges with 4 variants
- **Separator** - Horizontal/vertical dividers with 3 weights

### Icon System (`src/components/icons/`)
- **Icon** - Wrapper component for lucide-react icons
  - 3 sizes (sm, md, lg)
  - Optional bordered container
  - Interactive hover states
  - Pre-imported common icons (40+ icons)

### Utility Library (`src/lib/utils.ts`)
- **cn()** - Tailwind class merging utility (clsx + tailwind-merge)

### Barrel Exports
All components are exported from `src/components/index.ts` for easy imports:
```tsx
import { Button, Card, Headline, Icon, Newspaper } from "@/components";
```

## Design Principles

1. **Sharp Geometry** - Zero border radius everywhere
2. **High Contrast** - Bold black/white with minimal red accents
3. **Editorial Typography** - Large serif headlines, clean body text
4. **Visible Structure** - Borders define the grid, not hidden
5. **Information Density** - Tight spacing, efficient layouts
6. **Bold Interactions** - Hard shadows, color inversions, no soft effects

## Color System

All colors are defined as CSS custom properties in `src/app/globals.css` and registered with Tailwind via `@theme inline`. Every token has both light and dark mode variants.

### Base Palette

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--background` | `oklch(0.98 0 0)` | `oklch(0.18 0 0)` | Page background |
| `--foreground` | `oklch(0.20 0 0)` | `oklch(0.92 0 0)` | Primary text |
| `--card` | `oklch(0.99 0 0)` | `oklch(0.22 0 0)` | Card surfaces |
| `--popover` | `oklch(0.99 0 0)` | `oklch(0.22 0 0)` | Popover surfaces |
| `--primary` | `oklch(0.20 0 0)` | `oklch(0.92 0 0)` | Primary actions |
| `--secondary` | `oklch(0.96 0 0)` | `oklch(0.26 0 0)` | Secondary elements |
| `--muted` | `oklch(0.96 0 0)` | `oklch(0.26 0 0)` | Muted backgrounds |
| `--accent` | `oklch(0.92 0.06 25)` | `oklch(0.26 0 0)` | Accent elements, Gossip Girl agent badges |
| `--accent-foreground` | `oklch(0.28 0 0)` | `oklch(0.92 0 0)` | Text on accent backgrounds |
| `--border` | `oklch(0.90 0 0)` | `oklch(1 0 0 / 10%)` | Borders |
| `--input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` | Input borders |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | Focus rings |

### Semantic Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Errors, destructive actions |
| `--success` | `oklch(0.577 0.174 146.5)` | `oklch(0.704 0.191 146.5)` | Success states, positive sentiment |
| `--warning` | `oklch(0.795 0.184 86.047)` | `oklch(0.795 0.184 86.047)` | Warnings, caution states |
| `--info` | `oklch(0.623 0.214 259.822)` | `oklch(0.704 0.191 259.822)` | Informational messages, "Likely" confidence |

### Brand Tokens

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--brand` | `oklch(0.623 0.214 259.822)` | `oklch(0.704 0.191 259.822)` | Primary brand color (blue) |
| `--brand-foreground` | `oklch(0.98 0 0)` | `oklch(0.20 0 0)` | Text on brand backgrounds |
| `--brand-muted` | `oklch(0.87 0.05 259.822)` | `oklch(0.26 0.08 259.822)` | Subtle brand highlights |

### AI Surface Tokens

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--ai-surface` | `oklch(0.97 0.01 259.822)` | `oklch(0.22 0.02 259.822)` | AI feature backgrounds |
| `--ai-confidence-high` | `oklch(0.577 0.174 146.5)` | `oklch(0.704 0.191 146.5)` | High confidence indicators |
| `--ai-confidence-medium` | `oklch(0.623 0.214 259.822)` | `oklch(0.704 0.191 259.822)` | Medium confidence indicators |
| `--ai-confidence-low` | `oklch(0.795 0.184 86.047)` | `oklch(0.795 0.184 86.047)` | Low confidence indicators |

### Badge Tokens

High-contrast badge backgrounds for category labels and tell-type indicators. All badge tokens use dark text on tinted backgrounds for WCAG AA compliance.

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--badge-tell` | `oklch(0.92 0.05 70)` | `oklch(0.35 0.06 70)` | Tell-type labels (Hidden Agenda, Behavioral Tell, Narrative Shift) |
| `--badge-tell-foreground` | `oklch(0.28 0 0)` | `oklch(0.92 0 0)` | Text on tell-type badges |
| `--badge-theme` | `oklch(0.92 0.04 250)` | `oklch(0.35 0.05 250)` | Strategic theme labels (Competitive Power Play, Organizational Vertigo) |
| `--badge-theme-foreground` | `oklch(0.28 0 0)` | `oklch(0.92 0 0)` | Text on theme badges |

**Badge variant mapping:**

| Badge Variant | Background | Text | Use For |
|--------------|------------|------|---------|
| `default` | `bg-foreground` | `text-background` | Primary emphasis (dark bg, light text) |
| `secondary` | `border border-foreground` | `text-foreground` | Outlined emphasis |
| `accent` | `bg-accent` | `text-accent-foreground` | Gossip Girl agent, secondary emphasis |
| `tell` | `bg-badge-tell` | `text-badge-tell-foreground` | Tell-type labels from Gossip Girl analysis |
| `theme` | `bg-badge-theme` | `text-badge-theme-foreground` | Strategic theme labels |
| `analyst` | `bg-agent-analyst` | `text-agent-analyst-foreground` | The Analyst agent badge |
| `gossip` | `bg-agent-gossip` | `text-agent-gossip-foreground` | Gossip Girl agent badge |

**Contrast requirements:**
- All badge variants must achieve WCAG AA contrast ratio (4.5:1 minimum)
- Never use `text-background` on light backgrounds — always use the corresponding `*-foreground` token
- Badge backgrounds must be distinguishable from `--background` (page) and `--card` (card surfaces)

### Momentum Indicators

Momentum indicators show the acceleration state of strategic themes. Use these tokens consistently across all inference and theme displays.

| Status | Color Token | Icon | Usage |
|--------|-------------|------|-------|
| EMERGING | `text-muted-foreground` | `TrendingUp` (gray) | New theme detected, low signal count |
| ACCELERATING | `text-success` | `TrendingUp` (green) | Theme gaining momentum, multiple signals |
| PEAKED | `text-warning` | `Minus` (amber) | Theme at maximum intensity, plateau |
| FADING | `text-destructive` | `TrendingDown` (red) | Theme losing relevance, declining signals |

**Usage pattern:**
```tsx
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const momentumConfig = {
  EMERGING: { color: "text-muted-foreground", icon: TrendingUp },
  ACCELERATING: { color: "text-success", icon: TrendingUp },
  PEAKED: { color: "text-warning", icon: Minus },
  FADING: { color: "text-destructive", icon: TrendingDown },
};

function MomentumBadge({ status }: { status: string }) {
  const config = momentumConfig[status as keyof typeof momentumConfig];
  const Icon = config.icon;
  return (
    <span className={cn("flex items-center gap-1 text-sm", config.color)}>
      <Icon className="h-4 w-4" />
      {status}
    </span>
  );
}
```

### Inference Status Badges

Inference badges show the resolution state of cross-signal strategic conclusions.

| Status | Color Token | Usage |
|--------|-------------|-------|
| ACTIVE | `bg-info text-info-foreground` | Inference still being evaluated, new signals may arrive |
| CONFIRMED | `bg-success text-success-foreground` | Subsequent signals validated the inference |
| REFUTED | `bg-destructive text-destructive-foreground` | Evidence contradicted the inference |
| RESOLVED | `bg-secondary text-secondary-foreground` | Inference no longer relevant (company pivoted, etc.) |

**Usage pattern:**
```tsx
import { Badge } from "@/components/ui/badge";

function InferenceStatusBadge({ status }: { status: string }) {
  const variant = {
    ACTIVE: "info",
    CONFIRMED: "success",
    REFUTED: "destructive",
    RESOLVED: "secondary",
  }[status] || "default";
  
  return <Badge variant={variant}>{status}</Badge>;
}
```

### Cross-Signal Debate Layout

The cross-signal debate pattern shows dual-agent analysis of accumulated evidence. Use a two-column layout with agent voices side-by-side.

**Layout pattern:**
```tsx
<div className="grid grid-cols-2 gap-4">
  <Card className="border-l-4 border-l-agent-analyst">
    <CardHeader>
      <div className="flex items-center gap-2">
        <Icon name="BarChart3" className="text-agent-analyst" />
        <CardTitle>The Analyst</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      {/* Analyst's evidence and reasoning */}
    </CardContent>
  </Card>
  
  <Card className="border-l-4 border-l-agent-gossip">
    <CardHeader>
      <div className="flex items-center gap-2">
        <Icon name="MessageCircle" className="text-agent-gossip" />
        <CardTitle>Gossip Girl</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      {/* Gossip Girl's evidence and reasoning */}
    </CardContent>
  </Card>
</div>

{/* Consensus section */}
<Card className="mt-4">
  <CardHeader>
    <CardTitle>Consensus</CardTitle>
  </CardHeader>
  <CardContent>
    <ConsensusBadge level="strong" />
    {/* Shared conclusion or divergence explanation */}
  </CardContent>
</Card>
```

**Responsive behavior:** On mobile (`md:` breakpoint), stack the columns vertically. Keep the consensus section full-width below.


### Agent Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--agent-analyst` | `oklch(0.45 0.1 250)` | `oklch(0.65 0.12 250)` | "The Analyst" persona |
| `--agent-gossip` | `oklch(0.55 0.2 25)` | `oklch(0.70 0.18 25)` | "Gossip Girl" persona |

### Neutral Scale

The neutral scale provides grayscale values that adapt to dark mode. Use these for subtle backgrounds, borders, and text that shouldn't use semantic tokens.

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--neutral-100` | `#F5F5F5` | `oklch(0.25 0 0)` | Lightest neutral |
| `--neutral-200` | `#E5E5E5` | `oklch(0.30 0 0)` | Subtle backgrounds |
| `--neutral-300` | `#D4D4D4` | `oklch(0.40 0 0)` | Borders, dividers |
| `--neutral-400` | `#A3A3A3` | `oklch(0.50 0 0)` | Secondary text |
| `--neutral-500` | `#737373` | `oklch(0.60 0 0)` | Muted text, neutral chart elements |
| `--neutral-600` | `#525252` | `oklch(0.70 0 0)` | Body text |
| `--neutral-700` | `#404040` | `oklch(0.80 0 0)` | Darkest neutral |

### Chart Colors

The chart palette provides 10 distinct colors for data visualization, plus 4 semantic chart colors for sentiment/confidence charts.

**Extended Palette (chart-1 through chart-10):**
- `--chart-1` through `--chart-5`: Achromatic grays (newsprint aesthetic)
- `--chart-6` through `--chart-10`: Subtle hue variations for complex visualizations

**Semantic Chart Colors:**
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--chart-success` | `oklch(0.577 0.174 146.5)` | `oklch(0.704 0.191 146.5)` | Positive sentiment lines/bars |
| `--chart-destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Negative sentiment lines/bars |
| `--chart-warning` | `oklch(0.795 0.184 86.047)` | `oklch(0.795 0.184 86.047)` | Warning indicators in charts |
| `--chart-info` | `oklch(0.623 0.214 259.822)` | `oklch(0.704 0.191 259.822)` | Informational chart elements |

### Color Usage Guidelines

1. **Always use semantic tokens** - Never hardcode hex/rgb/hsl values in components
2. **Use CSS variables in Recharts** - Use `var(--token-name)` for stroke/fill values
3. **Prefer semantic over neutral** - Use `text-muted-foreground` instead of `text-neutral-600`
4. **Dark mode is automatic** - All tokens adapt via `.dark` class on root element
5. **Chart colors are flexible** - Use `--chart-1` through `--chart-10` for categorical data, semantic chart colors for sentiment/confidence
6. **Contrast is mandatory** - All text-on-background combinations must achieve WCAG AA (4.5:1). Never use `text-background` on light backgrounds. Always pair `bg-*` with its corresponding `text-*-foreground` token

## Motion Principles

Motion is purposeful, not decorative. Every animation must explain a state change, confirm an action, or guide attention. The newsprint aesthetic demands snappy, editorial motion -- never bouncy or playful.

### Core Rules

1. **Purposeful, not decorative** -- every animation explains a state change or confirms an action
2. **Sharp and editorial** -- snappy easings, no bouncy springs, fits the newsprint aesthetic
3. **Fast** -- nothing takes longer than 700ms. Analysts value efficiency.
4. **Consistent** -- same tokens across all components. Predictable motion builds trust.
5. **Accessible** -- `prefers-reduced-motion` is respected. No animation is essential for understanding.

### Motion Tokens (`src/app/globals.css`)

**Durations:**
- `--motion-duration-instant: 100ms` -- micro feedback (button press, toggle)
- `--motion-duration-fast: 200ms` -- hover states, tooltip appear
- `--motion-duration-normal: 300ms` -- card transitions, filter changes
- `--motion-duration-slow: 500ms` -- page transitions, staggered reveals
- `--motion-duration-deliberate: 700ms` -- hero section entrance, chart draw

**Easings:**
- `--motion-ease-standard: cubic-bezier(0.4, 0.0, 0.2, 1)` -- default for most transitions
- `--motion-ease-enter: cubic-bezier(0.0, 0.0, 0.2, 1)` -- elements entering screen
- `--motion-ease-exit: cubic-bezier(0.4, 0.0, 1, 1)` -- elements leaving screen
- `--motion-ease-sharp: cubic-bezier(0.4, 0.0, 0.6, 1)` -- editorial, snappy (fits newsprint)

### Animation Library

Use `motion` (framer-motion v11+) for:
- Layout animations (filter changes, card reordering)
- Exit animations (`AnimatePresence`)
- Scroll-triggered reveals (`whileInView`)
- Staggered children animations

**Reduced motion support:** Use `useReducedMotion()` hook from `motion/react` and provide static fallbacks.

**Page transitions:** Use CSS-only fade animations for route changes. Avoid component-level wrappers that force remounts and break server component streaming.

### What to Animate

- **Data-driven indicators** -- confidence bands, sentiment indicators, stat counts (communicates "live intelligence")
- **Filter/sort transitions** -- cards animate to new positions, filtered items fade out
- **Feed card reveals** -- staggered entrance on initial load (50ms delay between cards)
- **Loading states** -- choreographed skeleton reveals (typesetting animation for newsprint theme)
- **Button press** -- `scale(0.97)` on active state (tactile feedback)
- **Page transitions** -- CSS-only fade on route changes (no component wrappers)

### What NOT to Animate

- Newsprint texture overlay -- must remain static
- Typography (headlines, body text) -- editorial content should not bounce or slide
- Border/grid structure -- the visible structure is the design's backbone
- Ornament dividers -- decorative, should not move
- Sharp corner aesthetic -- no rounded morphing or border-radius transitions

### Accessibility

All motion must respect `prefers-reduced-motion: reduce`. The CSS includes:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

In React components:
```tsx
import { useReducedMotion } from 'motion/react';

function MyComponent() {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.3 }}
    >
      Content
    </motion.div>
  );
}
```

Every animation must have a static fallback that communicates the same information.

## Usage Example

```tsx
import {
  Container,
  Section,
  Headline,
  Body,
  Button,
  Card,
  Icon,
  Newspaper,
} from "@/components";

export default function Page() {
  return (
    <Section>
      <Container>
        <Headline level={1} size="hero">
          Breaking News
        </Headline>
        <Body dropCap>
          Your content here...
        </Body>
        <Button>Read More</Button>
      </Container>
    </Section>
  );
}
```

## Development

The design system is running at: http://localhost:3001

To start development:
```bash
npm run dev
```

## File Structure

```
src/
├── app/
│   ├── globals.css          # Design tokens & custom utilities
│   ├── layout.tsx           # Root layout with fonts
│   └── page.tsx             # Demo page
├── components/
│   ├── index.ts             # Barrel exports
│   ├── ui/                  # shadcn-style primitives
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   └── separator.tsx
│   ├── layout/              # Layout components
│   │   ├── container.tsx
│   │   ├── grid.tsx
│   │   └── section.tsx
│   ├── typography/          # Typography components
│   │   ├── headline.tsx
│   │   ├── label.tsx
│   │   ├── body.tsx
│   │   ├── metadata.tsx
│   │   └── ornament.tsx
│   └── icons/               # Icon system
│       └── icon.tsx
└── lib/
    └── utils.ts             # Utility functions
```

## Dependencies

- **@radix-ui/react-slot** - Polymorphic component support
- **class-variance-authority** - Component variants
- **clsx** - Conditional class names
- **tailwind-merge** - Tailwind class merging
- **lucide-react** - Icon library
- **motion** - Animation library (framer-motion v11+) for layout animations, exit animations, scroll-triggered reveals

## Next Steps

The design system is ready to use. You can now:
1. Build pages using the components
2. Extend with additional shadcn components as needed
3. Customize colors/typography in `globals.css`
4. Add more icons from lucide-react as needed
