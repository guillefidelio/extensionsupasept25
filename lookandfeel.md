# Extension UI Design Guide

## Brand Identity

**Name:** Bolt Reply AI 

**Logos:**
- Main Icon: `public/assets/icons/logo/boltreplyaiicon.png`
- Wordmark Icon: `public/assets/icons/logo/boltreplyainameicon.png`

## Design System: Glass-Morphism

**Core Card Style (CRITICAL):**
All cards should use a glass-morphism effect with backdrop blur.
- **Class Pattern:** `bg-background/50 backdrop-blur-[24px] border-border p-6`
- **Inner Sections:** `bg-background/30 backdrop-blur-[12px] border border-border rounded-lg p-6`

## Color Palette

Colors are defined using HSL variables.

### Primary Colors
- **Primary:** `hsl(217 91% 60%)` (Bright Blue)
- **Primary Foreground:** `hsl(0 0% 100%)` (White)

### UI Colors
- **Background:** `hsl(0 0% 100%)` (White)
- **Foreground:** `hsl(0 0% 20%)` (Dark Gray)
- **Card Background:** `hsl(0 0% 100%)` (White) - *Apply opacity for glass effect*
- **Muted Background:** `hsl(210 20% 98%)` (Very Light Gray)
- **Border:** `hsl(220 13% 91%)` (Light Gray)

### Semantic Colors
- **Destructive:** `hsl(0 84% 60%)` (Red)
- **Success:** `hsl(142 76% 36%)` (Green)
- **Warning:** `hsl(38 92% 50%)` (Yellow/Orange)
- **Accent:** `hsl(199 89% 94%)` (Light Blue)

### Gradients
- **Primary Gradient:** `hsl(217 91% 68%)` -> `hsl(217 91% 60%)` -> `hsl(224 76% 48%)`
- **Destructive Gradient:** `hsl(0 84% 60%)` -> `hsl(0 72% 40%)` -> `hsl(20 80% 30%)`

## Typography

- **Sans:** Inter, sans-serif (`--font-sans`)
- **Serif:** Source Serif 4, serif (`--font-serif`)
- **Mono:** JetBrains Mono, monospace (`--font-mono`)

**Font Sizes:**
- `xs`: 0.625rem (10px)
- `sm`: 0.75rem (12px)
- `base`: 0.875rem (14px)
- `lg`: 1rem (16px)
- `xl`: 1.125rem (18px)
- `2xl`: 1.375rem (22px)

## Components

### Cards
- **Style:** Glass-morphism (see above)
- **Radius:** `rounded-lg` (`--radius`: 0.375rem / 6px)
- **Padding:** Standard `p-6` (24px)
- **Spacing:** `space-y-6` between sections, `gap-6` in grids.
- **Responsiveness:** Cards should fit the container width (flexible).

### Buttons (`Button`)
**Base Style:**
- Font Medium
- Rounded `md`

**Variants:**
- **Default:** `bg-primary` text `white` (Hover: `bg-primary/90`)
- **Outline:** `border border-input` bg `background` (Hover: `bg-accent`)
- **Secondary:** `bg-secondary/20` text `secondary-foreground`
- **Ghost:** Transparent (Hover: `bg-accent`)
- **Destructive:** `bg-destructive` text `white`

**Sizes:**
- **Default:** `h-11 px-5 py-[10px]`
- **Small (sm):** `h-9 px-3 py-2` (Text `text-sm`)
- **Large (lg):** `h-11 px-8`
- **Icon:** `h-10 w-10`

## Layout & Dimensions

- **Base Radius:** `0.375rem` (6px)
- **Container Padding:** `2rem`
- **Small Container Widths:**
  - `16rem` (256px)
  - `8rem` (128px)
  - `4rem` (64px)

## Icons
- **Standard:** `h-5 w-5`
- **Small:** `h-4 w-4`
- **Spacing:** `space-x-3` (Icon + Text)
