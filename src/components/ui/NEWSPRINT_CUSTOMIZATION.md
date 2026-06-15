# Newsprint Design System - Shadcn Component Customization Guide

This guide documents how to customize shadcn/ui components to match The Tell's newsprint design system.

## Design Principles

1. **Sharp Geometry** - Zero border radius everywhere (no rounded corners)
2. **High Contrast** - Bold black/white with minimal red accents
3. **Editorial Typography** - Large serif headlines, clean body text
4. **Visible Structure** - Borders define the grid, not hidden
5. **Information Density** - Tight spacing, efficient layouts
6. **Bold Interactions** - Hard shadows, color inversions, no soft effects

## Customization Rules

### 1. Remove All Rounded Corners

**Never use:** `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`, `rounded-md`, `rounded-sm`

**Always use:** No rounded classes (defaults to sharp corners)

**Exception:** The global CSS in `globals.css` enforces `border-radius: 0` on all elements, but components should not include rounded classes in the first place.

### 2. Use Newsprint Color Tokens

**Primary colors:**
- `bg-foreground` / `text-foreground` - Ink black (#111111)
- `bg-background` / `text-background` - Off-white (#F9F9F7)
- `bg-accent` / `text-accent` - Editorial red (#CC0000)
- `bg-muted` / `text-muted` - Light gray (#E5E5E0)

**Border colors:**
- `border-foreground` - High contrast black borders
- `border-border` - Standard borders

**Text hierarchy:**
- `text-foreground` - Primary text
- `text-neutral-600` - Secondary text
- `text-neutral-500` - Tertiary/muted text

### 3. Typography Patterns

**Headlines:** Use `font-serif` (Playfair Display)
```tsx
className="font-serif text-2xl font-bold leading-tight"
```

**Body text:** Use `font-body` (Lora)
```tsx
className="font-body text-base leading-relaxed"
```

**Labels/Metadata:** Use uppercase tracking
```tsx
className="text-xs uppercase tracking-widest font-sans"
```

**Mono/Code:** Use `font-mono` (JetBrains Mono)
```tsx
className="font-mono text-sm"
```

### 4. Border Patterns

**High contrast borders:**
```tsx
className="border border-foreground"
```

**Heavy borders (4px):**
```tsx
className="border-b-4 border-foreground"
```

**Bottom border only:**
```tsx
className="border-b-2 border-foreground"
```

### 5. Interaction Patterns

**Hard shadow hover:**
```tsx
className="hard-shadow-hover"
```

**Color inversion on hover:**
```tsx
// Default state
className="bg-foreground text-background"
// Hover state
className="hover:bg-background hover:text-foreground hover:border-foreground"
```

### 6. Spacing Patterns

**Tight spacing:**
- Use `gap-2`, `gap-3`, `gap-4` for tight layouts
- Use `p-4`, `p-6` for compact padding
- Use `px-2`, `px-3` for tight horizontal padding

**Information density:**
- Prefer smaller text sizes (`text-xs`, `text-sm`)
- Use uppercase tracking for labels
- Minimize whitespace

### 7. Component-Specific Patterns

#### Buttons
- Uppercase tracking: `text-xs uppercase tracking-widest`
- Minimum touch target: `min-h-[44px] min-w-[44px]`
- Variants: default (black), secondary (outlined), accent (red), ghost, link
- Sizes: default, sm, lg, icon

#### Cards
- Border: `border border-foreground`
- No shadow (use hard-shadow-hover utility if needed)
- Tight padding: `p-6`
- Header with serif title: `font-serif text-2xl font-bold`

#### Badges
- Uppercase mono: `text-[10px] uppercase tracking-widest font-mono`
- Variants: default (black), accent (red), outline, muted
- Tight padding: `px-2 py-0.5`

#### Inputs
- Bottom border only: `border-b-2 border-foreground`
- Mono font: `font-mono text-sm`
- No rounded corners
- Focus: `focus-visible:bg-neutral-100`

#### Separators
- Use border colors: `border-foreground`
- Weight variants: thin (1px), medium (2px), heavy (4px)
- Horizontal or vertical orientation

## Adding New Components

When adding a new shadcn component:

1. **Install:** `pnpm dlx shadcn@latest add <component-name>`
2. **Remove rounded classes:** Search for `rounded-*` and remove them
3. **Apply newsprint colors:** Replace default colors with newsprint tokens
4. **Apply typography:** Use appropriate font families
5. **Apply borders:** Use `border-foreground` for high contrast
6. **Test:** Ensure the component looks correct in the design system

## Examples

### Dialog (Modal)
```tsx
// Remove: rounded-lg
// Add: border border-foreground
// Use: font-serif for title
<Dialog>
  <DialogContent className="border border-foreground">
    <DialogTitle className="font-serif text-2xl font-bold">
      Title
    </DialogTitle>
  </DialogContent>
</Dialog>
```

### Dropdown Menu
```tsx
// Remove: rounded-md
// Add: border border-foreground
// Use: uppercase tracking for items
<DropdownMenuContent className="border border-foreground">
  <DropdownMenuItem className="text-xs uppercase tracking-widest">
    Item
  </DropdownMenuItem>
</DropdownMenuContent>
```

### Tabs
```tsx
// Remove: rounded-lg
// Add: border-b-2 border-foreground for active tab
// Use: uppercase tracking for tab labels
<TabsList className="border-b-2 border-foreground">
  <TabsTrigger className="text-xs uppercase tracking-widest">
    Tab
  </TabsTrigger>
</TabsList>
```

## Checklist

Before committing a new component:

- [ ] No `rounded-*` classes
- [ ] Using newsprint color tokens
- [ ] Using appropriate typography
- [ ] Using `border-foreground` for borders
- [ ] Tight spacing (no excessive padding/gaps)
- [ ] Uppercase tracking for labels/metadata
- [ ] Tested in the design system
- [ ] Build passes
