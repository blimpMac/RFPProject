# RFPProject agent instructions

## UI/UX Pro Max
For any task that designs, reviews, refactors, or implements user interface or user experience, use the project skill at `.agents/skills/ui-ux-pro-max/SKILL.md` before making substantial UI decisions.

Use its local search tooling to ground design decisions when helpful, for example:
- `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "financial operations dashboard" --design-system`
- `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "forms accessibility validation" --domain ux`
- `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "React Tailwind data table" --stack react`

## Product design constraints
- This is an internal Request for Payment monitoring and approval system. Prioritize clarity, speed, auditability, accessibility, and dense-but-readable operational data over decorative effects.
- Preserve the established Greenlight/Gemcor brand identity. Use the existing website assets in `public/brands/`, especially `greenlight-power.png` and `gemcor.png`; do not invent replacement company logos.
- Keep the visual direction professional and finance-oriented: light surfaces, strong hierarchy, dark navy section headers where already established, restrained green accents, readable tables, clear status badges, and minimal motion.
- Preserve the existing workflow and authorization model when doing visual work. Do not change approval states, role permissions, notification behavior, or business rules unless the task explicitly asks for those functional changes.
- Requestor, Department Head, Finance Member, and Super Administrator/Finance Head experiences should remain visibly distinct and permission-appropriate.
- The Digital RFP Receipt is a business document: keep it A4-printable, compact, high-contrast, logo-correct by company, and free from dashboard-only controls in print output.
- Reuse existing components, spacing conventions, CSS tokens, Lucide icons, and interaction patterns before introducing new primitives.
- Avoid generic AI-dashboard styling, neon gradients, excessive glassmorphism, oversized cards, unnecessary animation, and low-density layouts that reduce operational scanning speed.

## Accessibility and responsive requirements
- Maintain visible keyboard focus and native/semantic controls.
- Maintain adequate text/background contrast and do not rely on color alone for status meaning.
- Ensure forms, tables, filters, modals, chips, and long identifiers reflow without clipping.
- Check representative widths around 375px, 768px, 1024px, and 1440px for meaningful UI changes.
- Respect reduced-motion preferences for any new animation.

## Validation
After code changes, run `npm run check` and fix formatting, typecheck, lint, tests, and production build failures before considering the task complete.
