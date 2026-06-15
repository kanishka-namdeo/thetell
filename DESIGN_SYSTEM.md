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

## Next Steps

The design system is ready to use. You can now:
1. Build pages using the components
2. Extend with additional shadcn components as needed
3. Customize colors/typography in `globals.css`
4. Add more icons from lucide-react as needed
