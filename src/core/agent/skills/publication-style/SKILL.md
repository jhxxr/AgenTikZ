---
name: publication-style
description: Apply enabled journal defaults and figure contracts without overriding evidence.
---
# Publication style and figure contracts

1. Check the current task flags: themeId, enforcePublicationStyleGuide and requireFigureContract. A disabled style flag does not disable general drawing/editing skills. Reference evidence, deliberate source styling and explicit user requirements take precedence over journal defaults.
2. If style guidance is enabled for an original/revised design, call get_theme_palette for the active theme. Its styleRules, columnWidthMm, minFontSizeLatex, colorRoles, lineSemantics, chartSpec and doNotUse are the authoritative journal data. Do not copy a palette from another component or maintain a second hard-coded set.
3. Use neutral context, coherent signal colors and at most 1–2 genuine contributions with strong salience. A functional palette is valid unless the user requests strict journal/monochrome output. Keep one meaning per line style; preserve reference grammar during reproduction.
4. When figure contracts are required for new/full redesigned or multi-panel figures, read `reference=figure-contract` and add `% @figure-contract` / `% @panel` comments. Do not rewrite metadata for a trivial label edit or invent a scientific claim from a template.
5. For quantitative plots read `reference=charts`. Draw only actual supplied data, or clearly labeled illustrative data explicitly requested by the user. Apply the theme's chart spine/grid/marker settings rather than blindly copying a primitive.
6. For hybrid vector/image figures read `reference=illustrations` only when needed. An @agent-image directive describes a requested asset, not an already generated image or permission to invoke unavailable tools.
7. Verify the exact proposed figure using the existing render/review workflow. A figure preview does not validate manuscript compilation or citations.
