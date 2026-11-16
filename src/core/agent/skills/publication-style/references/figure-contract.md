# Figure contract comments

When requireFigureContract is enabled for a new/full redesigned or multi-panel figure, add structured comments inside tikzpicture, before figure elements. Preserve existing comments during local edits. Values must reflect the user's actual scientific question and evidence, not a template's invented result.

```tikz
% @figure-contract {"claim":"Scientific question or supported claim","archetype":"schematic_led_composite","columnMode":"double","heroIds":["actual_contribution_id"]}
% @panel {"id":"a","label":"a","role":"mechanism","title":"Actual panel title"}
```

- claim: one concise question or evidence-supported claim; ask for missing essential facts instead of inventing a finding.
- archetype: quantitative_grid, schematic_led_composite, image_plate_plus_quant or asymmetric_mixed_modality.
- columnMode: single or double, using get_theme_palette.columnWidthMm for actual dimensions.
- heroIds: actual node IDs of at most 1–2 genuine contributions; empty if none are established.
- uncertaintyNote (optional): actual error/uncertainty definition, never invented sample sizes or error bars.
- panel role: mechanism, representative_case, primary_quant, baseline_control, ablation, stratification, orthogonal_val, stress_test, failure_boundary or mechanistic_probe. Add panels only if the task actually needs them.

Use consistent label format from the active theme. The comments are standard LaTeX and do not change compilation. A parser accepting the metadata does not verify scientific evidence.
