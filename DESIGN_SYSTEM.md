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
