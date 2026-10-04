# Design System — Daily Planning Assistant (Phase 1)

Locked from `design.html` (`:root` lines 8–24, components lines 45–103).
`design.html` stays the frozen visual reference; this file is the written rulebook.
No new colours, fonts, or components may be introduced without a Task 2–style review.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | #F6F4EE | Page background |
| `--surface` | #FFFFFF | Cards, hero, panels |
| `--ink` | #1E2430 | Body text, primary-button hover, active segments, flow chips |
| `--muted` | #6B7280 | Subtitles, labels, hints |
| `--primary` | #2F3E9E | Brand accent, links, time labels, focus outlines |
| `--primary-dark` | #232E78 | Primary button default background |
| `--accent` | #E8A33D | Accent button, reality-check warning border |
| `--success` | #2E7D5B | Healthy-state banners |
| `--warning` | #B45309 | Reserved for warnings |
| `--rest` | #5B7FA6 | Reserved for rest/low-attention elements |
| `--border` | #E5E1D8 | Card, input, and divider borders |
| `--high` | #C0392B | High-priority pill text (on #FADBD8) |
| `--medium` | #B7791F | Medium-priority pill text (on #FCF0D3) |
| `--low` | #5B7FA6 | Can-wait pill text (on #DCE9F5) |

Field fill: #FFFDF8. Radius: cards 14–16px, inputs 10–12px, buttons 10–12px, pills/chips full round.

## Typography

- Display: Georgia, "Times New Roman", serif. H1 32px (28px in app), letter-spacing −0.02em; card H2 19px.
- Body/UI: "Segoe UI", system-ui, −apple-system, Arial. Body 16px, line-height 1.5.
- Labels: 13px, 700 weight, uppercase, 0.06em tracking, muted colour.
- Buttons: inherit UI font at 700 weight. Timer numerals: tabular-nums, 800 weight.

## Components

- **Primary button** (prominence rule, per PRD §16): default `var(--primary-dark)` background, white text, `0 4px 14px rgba(35,46,120,.35)` shadow. Hover: `var(--ink)` background, `0 6px 18px rgba(30,36,48,.4)` shadow, `translateY(-1px)`. Reserved for the single main action per screen ("Get my suggested plan").
- **Ghost button:** transparent with 1.5px border; secondary actions ("Save draft", "Adjust plan").
- **Accent button:** `var(--accent)` background, #2A1E05 text; focus/break actions ("Start focus · 25:00").
- **Inputs:** textarea / text / select share the 1.5px-border style above; focus ring is a 2px `var(--primary)` outline.
- **Cards:** surface background, 1px border, 14–16px radius, 20–22px padding; every card has an H2 + muted `.sub` line.
- **Priority pills:** 12px uppercase pills per the token table; never invent new priority colours.
- **Plan rows:** time label (700 weight, primary colour, tabular numerals) + activity + reason in muted text; breaks get a ☕ row.
- **Session toggle:** pill segmented control; active segment is ink background, white text.
- **Flow chips:** ink chips naming the current stage (Brain Dump → … → Review).
- **Timer:** 38–40px tabular numerals, 800 weight.
- **Banners:** warning = #FDF0D3 fill + accent border; healthy = #E7F2EC fill + success border.

## Rules

1. One primary button per screen; everything else is ghost or accent.
2. Palette, fonts, and radii come only from the token table — no ad-hoc hex values.
3. Every screen keeps the H2 + muted-subtitle card pattern so users always see what they planned, what to focus on, and what remains.
4. AI suggestions always read as recommendations with reasons; the user visibly stays the decision-maker.

## Phase 1 Check

Open `design.html` next to any new screen: every token and component above must match with no visual mismatch. Mismatches are fixed in the new screen, never by editing `design.html`.
