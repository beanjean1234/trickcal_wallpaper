# Trickcal Wallpaper UI System

> This file is the source of truth for direct object manipulation and the optional placement editor UI.

## Product and stack

- Product: directly manipulable desktop wallpaper with an optional placement editor
- Stack: semantic HTML, CSS, and vanilla JavaScript
- Tone: restrained, utilitarian, compact, monochrome
- Priority: controls must be legible and predictable before they are decorative

## Color

The application UI uses neutral colors only. Artwork, glass objects, and the wallpaper background are content and are exempt from this UI palette.

| Role | Value |
|---|---|
| Main surface | `#0a0a0a` |
| Raised surface | `#171717` |
| Primary text | `#f5f5f5` |
| Secondary text | `#aaaaaa` |
| Border | `#363636` |
| Strong border | `#666666` |
| Primary action | `#ffffff` with `#000000` text |
| Focus | white ring with black outer separation |
| Selected image check | `#68c9ee` with a white checkmark |

Do not use colored accents outside the selected-image checkbox. Do not use decorative gradients, glow, bloom, iridescence, or colored status dots in application UI.

## Spacing and geometry

- Use a 4px base rhythm: `4, 8, 12, 16, 20, 24`.
- Panel padding: 20px.
- Section padding: 16px 20px 20px.
- Control row gap: 20px.
- Adjacent action gap: 8px.
- Standard control height: 40px; icon-only controls: at least 44px.
- Radius: 6px for small marks, 8px for controls, 12px for panels.

## Typography

- Use the local system UI font stack; do not load a decorative web font.
- Panel title: 18px / 650.
- Section heading: 11px / 700.
- Control label: 13px / 550.
- Helper and status text: 11–12px.
- Numeric values use the local monospace stack and align right.

## Components

### Wallpaper controls

- Do not place a settings button or settings panel over the wallpaper.
- Visual parameters are controlled through Lively's native property panel.
- Wallpaper objects expose a grab cursor and support direct pointer dragging.
- Keyboard movement remains available as an alternative to dragging.
- Save direct placement quietly when the local controller is available; dragging must still work offline.

### Buttons

- Primary: white background, black text.
- Secondary: dark neutral surface with a visible gray border.
- Quiet: transparent until hover.
- Hover and pressed states must not move layout bounds.
- Transition only color, background, and border for 160ms.

### Panels and status

- Use opaque near-black surfaces with a single border and restrained black shadow.
- Status is communicated with explicit text, not colored or glowing dots.
- The optional placement toolbar uses the same monochrome surfaces and button hierarchy.

### Image library controls

- Keep folder open, pack import, and refresh actions together above search and category filters.
- Text actions use 44px-high neutral buttons; refresh is a 44px icon-only button with an accessible name.
- Show explicit folder and image counts after catalog loading.
- Disable repeated import or refresh actions while a request is running and expose `aria-busy`.
- Category folders are discovered dynamically; never encode a fixed category list in the UI.

## Accessibility and motion

- Maintain at least 4.5:1 text contrast.
- Keep labels associated with every input.
- Give icon-only buttons an accessible name.
- Keep visible `:focus-visible` treatment for keyboard input and in the placement editor.
- Suppress pointer-generated focus chrome only on live wallpaper objects so clicking to drag does not leave a desktop outline.
- Respect `prefers-reduced-motion`.
- Animations are limited to a 160ms opacity/4px panel entrance.

## Forbidden patterns

- Decorative gradients in application UI
- Glowing dots, orbs, bloom, colored shadows, and glassmorphism panels
- Random spacing values outside the 4px rhythm
- Pill-shaped containers used without a semantic reason
- Layout-shifting hover transforms
- Emoji or mixed icon styles
- Slider tracks assembled from visually disconnected layers
