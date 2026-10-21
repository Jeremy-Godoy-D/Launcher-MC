---
name: landing-page-design
description: "Complete system for building high converting landing pages: intake questions, page structure, layout selection, conversion copywriting, SEO, plus strict visual rules for typography, spacing, corner radius, backgrounds, hero layout, icons, and motion. Sourced from https://github.com/elayadesign/ai-design-skills."
---

# Landing Page Design

A landing page is not a homepage. A homepage serves multiple intents. A landing page wins one intent:

**one offer → one audience → one primary action.**

This skill has two halves. **Part A** decides what the page says and how it is structured. **Part B** is the non negotiable visual system. Work through A before touching B.

## Scope

Apply to all web UI work: landing pages, marketing sites, components, dashboards, prototypes, and design reviews. When a rule here conflicts with a framework default, this file wins. When the user's explicit prompt conflicts with a rule, the user wins.

---

# PART A — Strategy and structure

## A1. Intake

Gather these before designing or writing:
- **Primary action**: Clear single goal (e.g. Explorar catálogo / Realizar pedido).
- **Offer**: Natural handcrafted frozen fruit bolos delivered fresh.
- **Proof**: Rating, local handcrafted quality, fast frozen delivery.

## A2. Page structure

**Above the fold (required)**
1. Headline, outcome plus audience
2. Subheadline, clarifies how and adds specificity
3. Primary CTA, clear verb plus what they get
4. One proof signal, logo strip, stat, or short testimonial
5. Hero visual, product photography with glassmorphic cards and floating badges

**Mid page (the argument)**
6. Tagline reveal section (B11)
7. Featured flavors / products
8. How it works, three to four steps
9. Benefits & story
10. FAQ
11. Final CTA

## A3. Layout selection
Classic hero plus sections with full-bleed screen experience.

## A4. Conversion rules
- One primary CTA.
- Write benefit first.
- Be specific with numbers.
- Reduce risk (guarantee of frozen arrival, fresh natural ingredients).

---

# PART B — Visual system

## B1. Typography
- No hyphens in body copy or headings.
- No orphaned words (`text-wrap: balance` for headings, `text-wrap: pretty` for body).
- Scale: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl`, `text-5xl`, `text-6xl`, `text-7xl`.
- Main buttons: `text-base`, semibold/bold.

## B2. Spacing & Radius
- Nested radius formula: `inner radius = outer radius − gap`.

## B3. Glassmorphic Specular System
- Specular highlights: `border border-white/70 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),0_20px_50px_rgba(0,0,0,0.06)]`.
- Multi-layer backdrop blur: `backdrop-blur-2xl bg-white/70`.
- Vibrantly colored gradient orbs behind the glass to power refraction.

## B4. Hero Section
- Heading and subheading max width 680px with meaningful line breaks.
- Left-to-right text gradient on hero heading.
- Full viewport coverage (`min-h-[90vh]` or `min-h-screen`, `w-full`).

## B5. Motion Choreography
- Fluid dynamics easing curve: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Scroll reveals with IntersectionObserver or CSS staggered entry.

## B6. Tagline Reveal Section (B11)
- Benefit statement with staggered word reveal on scroll.
