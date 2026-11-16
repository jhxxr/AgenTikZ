use rmcp::model::Tool;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

pub fn builtin_tools() -> Vec<ToolSpec> {
    let mut tools = Vec::new();
    let mut add = |name: &str, description: &str, properties: Value, required: Vec<&str>| {
        tools.push(ToolSpec {
            name: name.into(),
            description: description.into(),
            input_schema: json!({
                "type": "object", "properties": properties, "required": required,
                "additionalProperties": false
            }),
        });
    };
    add("get_canvas_source", "Read the target canvas source, identity, revision, sourceHash and active theme. Read this before proposing changes.", json!({}), vec![]);
    add("get_diagram_design_skill", "Discover on-demand drawing skills with action=list (metadata only), then action=read with skillId and optional reference. List ignores body/page fields; skillId takes precedence over legacy topic. Omit reference or pass workflow/. for the workflow; the first reference read also returns it once. Repeated complete pages return no new body. action=reload refetches one page after genuine context loss. Use only catalog-listed references. Legacy topics/macros are reference examples.", json!({
        "action": {"type": "string", "enum": ["list", "read", "reload"]},
        "skillId": {"type": "string", "enum": ["scientific-diagram-design", "reference-reproduction", "canvas-editing", "publication-style"]},
        "reference": {"type": "string", "minLength": 1},
        "topic": {"type": "string", "enum": ["design", "reproduction", "swsa", "gnn", "mae", "riemannian"]},
        "startLine": {"type": "integer", "minimum": 1},
        "lineCount": {"type": "integer", "minimum": 1, "maximum": 160}
    }), vec![]);
    add("render_canvas_preview", "Compile the current canvas, pending proposal or automatically applied proposal with real TeX and return a PNG image plus layout diagnostics. Rendering does not apply edits. Inspect the image before refining; read the latest canvas version after an automatically applied edit. At most 3 distinct renders per request; identical previews are cached. Compilation is not visual verification. Requires local TeX and a vision-capable model.", json!({
        "proposalId": {"type": "string", "minLength": 1}
    }), vec![]);
    add("get_canvas_ast", "Parse the target canvas and return nodes, edges, charts and source spans with revision and sourceHash.", json!({}), vec![]);
    add(
        "get_selected_elements",
        "Read currently selected elements and their exact source on the target canvas.",
        json!({}),
        vec![],
    );
    add("inspect_layout_diagnostics", "Inspect live canvas layout, or pass proposalId to inspect an existing pending proposal. Returns issues and a health score.", json!({
        "proposalId": {"type": "string"},
        "themeId": {"type": "string", "enum": ["neurips", "cvpr", "nature", "ieee"]}
    }), vec![]);
    add(
        "get_component_library",
        "Read one component example by library id or the TikZ style used in its snippet (for example prim_mha or mha_block), or by category. Unknown ids return the available ids instead of failing. Example data and colors are not measurements or task requirements.",
        json!({
            "category": {"type": "string", "enum": ["all", "dl", "chart"]},
            "componentId": {"type": "string", "minLength": 1}
        }),
        vec![],
    );
    add(
        "get_theme_palette",
        "Read the active/specified journal palette, styleRules, column sizes and chart defaults when relevant.",
        json!({
            "themeId": {"type": "string", "enum": ["neurips", "cvpr", "nature", "ieee"]}
        }),
        vec![],
    );
    let base = json!({
        "baseRevision": {"type": "integer", "minimum": 0},
        "baseSourceHash": {"type": "string", "minLength": 1},
        "summary": {"type": "string", "minLength": 1},
        "rationale": {"type": "string"}
    });
    let mut complete = base.clone();
    complete["newTikzCode"] = json!({"type":"string", "minLength": 1});
    add("propose_tikz_patch", "Submit a full-source canvas edit (returns proposalId, status/applied, latest revision/sourceHash and layout report). Manual mode keeps it pending; automatic mode applies valid edits immediately. Must be one complete \\begin{tikzpicture}...\\end{tikzpicture}. Supply revision/hash from the latest read.", complete,
        vec!["baseRevision", "baseSourceHash", "summary", "newTikzCode"]);
    let mut surgical = base.clone();
    surgical["patches"] = json!({
        "type": "array", "minItems": 1, "maxItems": 100,
        "items": {"type":"object", "properties":{"search":{"type":"string","minLength":1}, "replace":{"type":"string"}},
                  "required":["search","replace"], "additionalProperties":false}
    });
    add("propose_surgical_diff", "Submit exact SEARCH/REPLACE edits against the current live canvas (returns proposalId, status/applied, latest revision/sourceHash and layout report). Manual mode keeps them pending; automatic mode applies valid edits immediately. Read the latest source/version before each edit. Every search must match exactly once.", surgical,
        vec!["baseRevision", "baseSourceHash", "summary", "patches"]);
    let mut repair = base;
    repair["proposalId"] = json!({"type":"string", "minLength": 1});
    repair["themeId"] = json!({"type":"string", "enum":["neurips","cvpr","nature","ieee"]});
    add("propose_layout_repair", "Submit a layout-repair edit. Pass proposalId to repair a pending or automatically applied proposal; omitting it repairs the current live canvas. Manual mode keeps edits pending; automatic mode applies valid edits immediately. Supply the latest canvas revision/hash.", repair,
        vec!["baseRevision", "baseSourceHash", "summary"]);
    add("get_project_context", "Read the current project file index, active manuscript, canvas identity, dirty state and paper revision. Works across paper/figure views of the same project.", json!({}), vec![]);
    add("read_project_file", "Read an indexed project text file without changing the editor tab. Returns current editor source (including unsaved edits), paperRevision and sourceHash. Read every affected file before proposing manuscript changes.", json!({
        "relativePath": {"type":"string", "minLength":1, "maxLength":1024}
    }), vec!["relativePath"]);
    add("propose_project_patch", "Submit one change set for existing .tex/.bib/.sty/.cls files. Manual mode keeps it pending; automatic mode immediately applies valid edits to editor buffers. Trust returned status/applied. Read every affected file again before further edits and use its latest paperRevision/sourceHash; .tikz edits must use canvas proposals.", json!({
        "baseRevision": {"type":"integer","minimum":0},
        "summary": {"type":"string","minLength":1,"maxLength":2000},
        "rationale": {"type":"string","maxLength":8000},
        "files": {"type":"array","minItems":1,"maxItems":20,"items":{
            "type":"object","additionalProperties":false,
            "properties":{
                "relativePath":{"type":"string","minLength":1,"maxLength":1024},
                "baseSourceHash":{"type":"string","minLength":1},
                "newContent":{"type":"string","maxLength":262144}
            },
            "required":["relativePath","baseSourceHash","newContent"]
        }}
    }), vec!["baseRevision","summary","files"]);
    add("get_paper_diagnostics", "Read the latest user-triggered paper compilation status, actual logs, errors and stale-revision flag. Does not run a compiler. Pending proposals are not compiled; successful compilation is not a visual review.", json!({}), vec![]);
    tools
}

/// The standalone drawing connection deliberately excludes manuscript access.
pub fn canvas_tools() -> Vec<ToolSpec> {
    builtin_tools()
        .into_iter()
        .filter(|tool| !matches!(tool.name.as_str(),
            "get_project_context" | "read_project_file" | "propose_project_patch" | "get_paper_diagnostics"))
        .map(|mut tool| {
            if tool.name == "get_canvas_source" {
                tool.description.push_str(" For external clients, also returns access (read/review/direct) and latestProposal status so you can observe user approval or rejection.");
            } else if tool.name == "render_canvas_preview" {
                tool.description = tool.description.replace(
                    "At most 3 distinct renders per request",
                    "At most 3 distinct renders per external draft; a new source proposal resets the budget",
                );
            }
            tool
        })
        .collect()
}

impl ToolSpec {
    pub fn into_tool(self) -> Tool {
        Tool::new(
            self.name,
            self.description,
            self.input_schema.as_object().unwrap().clone(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progressive_skill_schema_preserves_names_scope_and_legacy_topics() {
        let tools = builtin_tools();
        assert_eq!(tools.len(), 15);
        assert_eq!(canvas_tools().len(), 11);
        let skill = tools.iter().find(|tool| tool.name == "get_diagram_design_skill").unwrap();
        let properties = &skill.input_schema["properties"];
        assert_eq!(properties["action"]["enum"], json!(["list", "read", "reload"]));
        assert_eq!(properties["skillId"]["enum"], json!([
            "scientific-diagram-design", "reference-reproduction", "canvas-editing", "publication-style",
        ]));
        assert_eq!(properties["topic"]["enum"], json!([
            "design", "reproduction", "swsa", "gnn", "mae", "riemannian",
        ]));
        assert_eq!(properties["lineCount"]["maximum"], 160);
        assert_eq!(skill.input_schema["required"], json!([]));
        assert_eq!(skill.input_schema["additionalProperties"], false);
        let components = tools.iter().find(|tool| tool.name == "get_component_library").unwrap();
        assert_eq!(components.input_schema["properties"]["componentId"]["type"], "string");
        assert_eq!(components.input_schema["properties"]["category"]["enum"], json!(["all", "dl", "chart"]));
    }
}
