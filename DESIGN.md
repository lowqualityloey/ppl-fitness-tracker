---
version: alpha
name: TailAdmin
description: >-
  A modern, data-centric eCommerce dashboard built with Tailwind CSS, emphasizing clarity, accessibility, and rapid
  decision-making through clean typography and purposeful color hierarchy.
logo:
  src: https://demo.tailadmin.com/favicon.ico
colors:
  surface: '#f9fafb'
  surface-dim: '#f2f4f7'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f9fafb'
  surface-container: '#f2f4f7'
  surface-container-high: '#e4e7ec'
  surface-container-highest: '#d0d5dd'
  on-surface: '#101828'
  on-surface-variant: '#475467'
  inverse-surface: '#1d2939'
  inverse-on-surface: '#f9fafb'
  outline: '#d0d5dd'
  outline-variant: '#98a2b3'
  surface-tint: '#465fff'
  primary: '#465fff'
  on-primary: '#ffffff'
  primary-container: '#ecf3ff'
  on-primary-container: '#3641f5'
  inverse-primary: '#9cb9ff'
  secondary: '#fb6514'
  on-secondary: '#ffffff'
  secondary-container: '#fff6ed'
  on-secondary-container: '#fd853a'
  tertiary: '#667085'
  on-tertiary: '#ffffff'
  tertiary-container: '#e4e7ec'
  on-tertiary-container: '#344054'
  error: '#d42c0e'
  on-error: '#ffffff'
  error-container: '#fdeae6'
  on-error-container: '#d42c0e'
  primary-fixed: '#ecf3ff'
  primary-fixed-dim: '#dde9ff'
  on-primary-fixed: '#3641f5'
  on-primary-fixed-variant: '#465fff'
  secondary-fixed: '#fff6ed'
  secondary-fixed-dim: '#ffe4cc'
  on-secondary-fixed: '#fb6514'
  on-secondary-fixed-variant: '#fd853a'
  tertiary-fixed: '#e4e7ec'
  tertiary-fixed-dim: '#d0d5dd'
  on-tertiary-fixed: '#344054'
  on-tertiary-fixed-variant: '#475467'
  background: '#f9fafb'
  on-background: '#101828'
  surface-variant: '#e4e7ec'
typography:
  display:
    fontFamily: Outfit
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: '-0.02em'
  headline-lg:
    fontFamily: Outfit
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: '-0.01em'
  headline-md:
    fontFamily: Outfit
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: 0em
  title-lg:
    fontFamily: Outfit
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  body-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: Outfit
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  label-md:
    fontFamily: Outfit
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  container-max: 1280px
elevation:
  sm: 0 1px 2px rgba(0, 0, 0, 0.05)
  md: 0 4px 12px rgba(0, 0, 0, 0.08)
  lg: 0 16px 40px rgba(0, 0, 0, 0.12)
layout:
  containerMaxWidth: 1280px
  gridColumns: 12
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: 12px 24px
    height: 48px
    border: none
  button-primary-hover:
    backgroundColor: '#3641f5'
    textColor: '{colors.on-primary}'
    transition: background-color 150ms ease-in-out
  button-secondary:
    backgroundColor: '{colors.primary-container}'
    textColor: '{colors.primary}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: 12px 24px
    height: 48px
    border: 1px solid {colors.outline}
  button-secondary-hover:
    backgroundColor: '#dde9ff'
    textColor: '{colors.primary}'
    transition: background-color 150ms ease-in-out
  card:
    backgroundColor: '{colors.surface-bright}'
    rounded: '{rounded.lg}'
    padding: '{spacing.md}'
    boxShadow: '{elevation.sm}'
    border: 1px solid {colors.outline}
  card-hover:
    backgroundColor: '{colors.surface-bright}'
    boxShadow: '{elevation.md}'
    transition: box-shadow 150ms ease-in-out
  input-field:
    backgroundColor: '{colors.surface-bright}'
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    rounded: '{rounded.md}'
    padding: 10px 16px
    border: 1px solid {colors.outline}
    height: 40px
  input-field-focus:
    borderColor: '{colors.primary}'
    boxShadow: 0 0 0 3px {colors.primary-container}
    transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out
  badge-primary:
    backgroundColor: '{colors.primary-container}'
    textColor: '{colors.primary}'
    typography: '{typography.label-sm}'
    rounded: '{rounded.full}'
    padding: 4px 12px
  badge-secondary:
    backgroundColor: '{colors.secondary-container}'
    textColor: '{colors.secondary}'
    typography: '{typography.label-sm}'
    rounded: '{rounded.full}'
    padding: 4px 12px
  list-item:
    backgroundColor: transparent
    rounded: '{rounded.md}'
    padding: '{spacing.sm}'
    textColor: '{colors.on-surface}'
  list-item-hover:
    backgroundColor: '{colors.surface-container}'
    textColor: '{colors.primary}'
    transition: background-color 150ms ease-in-out
  chart-bar:
    fill: '{colors.primary}'
    opacity: '1'
  chart-area:
    fill: '{colors.primary}'
    opacity: '0.15'
---

## Overview

TailAdmin is a modern, data-centric eCommerce dashboard template built with Tailwind CSS, designed to transform complex business metrics into actionable insights. The brand embodies "Functional Clarity"—a design philosophy that prioritizes information hierarchy, rapid decision-making, and visual accessibility over decorative flourishes. The interface serves business users (merchants, analysts, operations teams) who need to monitor KPIs, track sales trends, and manage inventory at a glance. The aesthetic is clean, professional, and deliberately minimalist: a light neutral canvas (rgb(249, 250, 251)) with strategic use of a vibrant blue accent (#465fff) for interactive elements, complemented by warm orange (#fb6514) for secondary actions and status indicators. The emotional response is one of confidence and control—users feel empowered to navigate complex data without cognitive overload.

The brand voice is direct, precise, and action-oriented. Vocabulary favors concrete metrics over abstract language: "3,782 Customers" rather than "customer base," "75.55% Monthly Target" rather than "progress." Tone is professional yet approachable—never breathless or hyperbolic. Example sentence in brand voice: "Your revenue is $3,287 today, up 10% from last month—keep this momentum going."

## Colors

The color system is built on a neutral-dominant foundation with strategic accent deployment. The primary color, #465fff (a saturated, medium-blue), is reserved exclusively for interactive elements: primary CTAs, active states, focus indicators, and data visualization highlights. This blue is never used for body text or backgrounds, ensuring it commands attention when it appears. Secondary color, #fb6514 (warm orange), supports secondary actions, success indicators, and alternative CTAs—it provides visual contrast without competing with primary. Tertiary color, #667085 (muted gray-blue), is used for disabled states, secondary labels, and supporting text. The surface stack uses a light, cool-neutral palette: surface-bright (#ffffff) for card backgrounds, surface (#f9fafb) for page background

## Typography

The type system uses Outfit (a geometric sans-serif from Google Fonts) across all scales, creating visual consistency and a contemporary, friendly tone. Display (56px, 700 weight) is reserved for hero headlines and major page titles; Headline-lg (36px, 600 weight) anchors section headers; Headline-md (28px, 600 weight) is used for card titles and subsections; Title-lg (22px, 600 weight) for component headings; Body-lg (18px, 400 weight) for introductory paragraphs; Body-md (16px, 400 weight) for primary body text and form labels; Label-md (14px, 500 weight) for button text, badges, and secondary labels; Label-sm (12px, 500 weight) for helper text, timestamps, and data table annotations. Letter-spacing is minimal (0 to -0.02em) to maintain density and professionalism. Line-height is set gen

## Layout

The page layout uses a 12-column grid with a max-width of 1280px, centered on the viewport. The left sidebar (navigation) is fixed at 290px width, leaving 990px for the main content area. Main content uses a gutter of 24px between grid columns and 24px padding on the left/right edges. Section separation is achieved through lg spacing (40px) vertical margin between major sections, with md spacing (24px) between subsections. Cards and containers use md padding (24px) internally, with sm spacing (12px) between nested elements. The page background is surface (#f9fafb), while card backgrounds are surface-bright (#ffffff) with a 1px border in outline color (#d0d5dd). Container max-width is 1280px; on screens below 1024px, the sidebar collapses to an icon-only state and content expands to fill th

## Elevation & Depth

Depth is conveyed through a subtle shadow system and border hierarchy, not through color darkening or glassmorphism. Level 1 (Base): Surface-bright (#ffffff) with a 1px border in outline (#d0d5dd) and no shadow—used for flat cards and input fields. Level 2 (Elevated): Same surface-bright background with a 1px border plus box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08)—used for hovered cards, modals, and dropdowns. Level 3 (Modal/Overlay): Same styling as Level 2 but with box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12)—used for full-screen modals and floating panels. Shadows are always soft (blur 12–40p

## Shapes

The shape philosophy is "Soft-Technical"—rounded corners are used consistently but conservatively to balance approachability with professional authority. Buttons use lg radius (1rem / 16px), creating a friendly, clickable appearance without appearing playful. Cards and containers use lg radius (16px) for consistency with buttons. Input fields use md radius (0.75rem / 12px), slightly less rounded than buttons to signal their passive role. Badges and pills use full radius (9999px) to emphasize their compact, self-contained nature. Modals and dropdowns use lg radius (16px). The rationale: lg radi

## Components

### Action Elements
Buttons are the primary interactive element. Primary buttons use backgroundColor: {colors.primary} (#465fff), textColor: {colors.on-primary} (#ffffff), padding: 12px 24px, height: 48px, rounded: lg (16px), typography: label-md (14px, 500 weight). On hover, backgroundColor transitions to #3641f5 (a darker blue) over 150ms. On focus, a 3px outline in primary-container (#ecf3ff) is applied. On active/pressed, backgroundColor becomes #252dae (primary-800) and the shadow is removed. Secondary buttons use backgroundColor: {colors.primary-container} (#ecf3ff), textColor: {colors.primary} (#465fff), with a 1px border in outline (#d0d5dd). On hover, backgroundColor becomes #dde9ff (primary-200). Disabled buttons use backgroundColor: {colors.surface-container-high} (#e4e7ec), tex

## Do's and Don'ts

**Do**
- Do use primary blue (#465fff) exclusively for interactive elements—CTAs, focus states, active tabs, and chart highlights—never for backgrounds or body text.
- Do apply md spacing (24px) between major sections and sm spacing (12px) between nested elements to create visual rhythm and reduce cognitive load.
- Do use Outfit at 16px body-md weight 400 for primary body text; ensure line-height is at least 1.5x (24px) for readability on screens.
- Do transition all interactive state changes (hover, focus, active) over 150ms using ease-in-out timing to provide tactile feedback.
- Do use the full shadow stack (sm, md, lg) to create clear depth hierarchy: cards at rest use sm shadow, hovered cards use md shadow, modals use lg shadow.
- Do apply lg radius (16px) to buttons and cards consistently; use md radius (12px) for inputs to differentiate passive from active elements.
- Do use the surface-container stack (#f2f4f7, #e4e7ec, #d0d5dd) for subtle visual separation; never use pure black or pure white for dividers.
- Do include a 3px outline in primary-container (#ecf3ff) on all focused interactive elements to ensure keyboard accessibility.

**Don't**
- Don't use primary blue (#465fff) for body text, backgrounds, or decorative elements—reserve it exclusively for interactive states and CTAs.
- Don't apply rounded corners to text, inline elements, or data table cells; use sharp corners (0px) for tables to maintain grid clarity.
- Don't use shadows larger than lg (0 16px 40px) or blur values exceeding 40px; keep shadows subtle and soft to avoid visual heaviness.
- Don't mix font families; use Outfit exclusively across all scales—no system fonts, no serif fallbacks, no decorative typefaces.
- Don't apply letter-spacing greater than 0.02em or less than -0.02em; maintain tight, professional spacing that reflects data-centric purpose.
- Don't use opacity or transparency for primary interactive elements; keep buttons and CTAs fully opaque to signal clickability.
- Don't apply animations longer than 300ms or use easing functions other than ease-in-out; avoid attention-grabbing motion that distracts from data.
- Don't use the secondary orange (#fb6514) for primary CTAs; reserve it for secondary actions, success states, and alternative highlights only.
