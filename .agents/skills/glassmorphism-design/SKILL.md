---
name: glassmorphism-design
description: Comprehensive design system specifications, Tailwind CSS 4 utility recipes, frosted glass tokens, specular highlights, and fluid micro-animations for high-end, clean glassmorphic web applications.
---

# Glassmorphism & Fluid Micro-Animations Design System

## 1. Core Principles

1. **Hierarchy Through Depth & Translucency:**
   - Use translucent layers with background blurs to express hierarchy rather than heavy flat solids or harsh drop shadows.
   - Base surface: Soft mesh / subtle organic pastel gradients (`from-rose-50/50 via-amber-50/30 to-sky-50/40`).
   - Glass surfaces: Semi-transparent backgrounds (`bg-white/60` to `bg-white/80`) paired with `backdrop-blur-xl` or `backdrop-blur-md`.
   - Subtle border rim: `border border-white/40` or `border border-white/60` simulating refraction/specular rim light.
   - Soft diffuse shadow: `shadow-[0_8px_32px_0_rgba(0,0,0,0.06)]`.

2. **Radical Minimalism & High Signal-to-Noise Ratio:**
   - Eliminate text bloat, excessive disclaimers, and redundant warnings.
   - Replace wordy paragraphs with punchy value statements, clean metrics, and visual chips.
   - Generous whitespace (`p-6`, `p-8`, `gap-6`), soft rounded corners (`rounded-2xl`, `rounded-3xl`).

3. **Motion Language & Micro-Interactions:**
   - **Fast UI response:** `transition-all duration-200 ease-out` for buttons, chips, and small controls.
   - **Surface Lift:** `hover:-translate-y-1 hover:shadow-[0_16px_36px_0_rgba(0,0,0,0.08)] hover:bg-white/85 transition-all duration-300 ease-out`.
   - **Glow & Status Accents:** Subtle ping/pulse indicators on active stages and statuses.
   - **Active Click:** `active:scale-[0.98] transition-transform duration-100`.

---

## 2. Tailwind CSS Utility Recipes

### A. Frosted Glass Containers (Cards & Panels)
```html
<!-- Primary Frosted Glass Card -->
<div class="bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 transition-all duration-300 hover:shadow-[0_16px_40px_rgb(0,0,0,0.08)] hover:border-white/90">
  ...
</div>

<!-- Floating Navigation Bar -->
<nav class="sticky top-4 z-50 mx-auto max-w-6xl px-4 sm:px-6 py-3 bg-white/75 backdrop-blur-2xl border border-white/50 rounded-2xl shadow-lg shadow-slate-900/5">
  ...
</nav>

<!-- Elevated Glass Modal / Drawer -->
<div class="bg-white/90 backdrop-blur-2xl border border-white/80 shadow-2xl rounded-3xl">
  ...
</div>
```

### B. Dark Mode / Admin Frosted Glass
```html
<!-- Dark Glass Card for Admin / Contrast -->
<div class="bg-slate-900/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl p-6 text-white">
  ...
</div>

<!-- Ultra-light Glass Admin Card -->
<div class="bg-white/80 backdrop-blur-lg border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all">
  ...
</div>
```

### C. Glassmorphic Buttons & Chips
```html
<!-- Primary Glass Gradient CTA -->
<button class="relative group overflow-hidden px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-500/90 to-amber-500/90 text-white font-bold shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200">
  <span class="relative z-10">Explorar Sabores</span>
  <div class="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
</button>

<!-- Secondary Frosted Glass Button -->
<button class="px-5 py-2.5 rounded-2xl bg-white/60 hover:bg-white/90 backdrop-blur-md border border-white/80 text-slate-800 font-semibold shadow-sm hover:shadow hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200">
  ...
</button>
```

---

## 3. Rules for Content De-saturation (Clean & Direct)

- **Headlines:** Max 5–8 words. Direct benefit.
- **Subtitles:** Exactly 1 concise sentence (no marketing fillers).
- **Cards:** Image + Name + Flavor + Price + Direct Action. Strip excessive badges.
- **Admin Tables:** Clear status pills, essential columns (ID, Cliente, Total, Estado, Acciones). Clean modal for details.
