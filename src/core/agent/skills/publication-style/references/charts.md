# Quantitative charts

Use only supplied data, verified source data read through authorized tools, or explicitly labeled illustrative data requested by the user. Do not turn component/demo values, Ours/Baseline labels, a sample n or synthetic error bars into reported experimental results.

Read get_theme_palette for authoritative chartSpec, minFontSizeLatex, columnWidthMm, chartColors and styleRules. Examples are not theme overrides. In particular, open_left_bottom means no top/right frame; defaultShowGrid=false means no grid. IEEE/monochrome output needs distinct markers/line styles, not colors alone.

- State physical quantity and units on axes. Use one scale per axis and comparable scale for intended comparisons.
- Identify multiple series with legible legends/direct labels and distinct marks or line styles as required by the theme.
- PGFPlots panels need explicit width/height and scope shift={(x,y)}. Reuse only needed componentId/category examples.
- Error intervals, seeds and sample counts must have their real definition and values. Ask for them if they are essential and missing.
- Preserve readability at the final column width; do not use tiny labels to fit a crowded plot.

Submit/preview the same proposed source, inspect its actual pixels if supported, and report failures/approximations honestly. A plotted curve is not evidence that an experiment ran.
