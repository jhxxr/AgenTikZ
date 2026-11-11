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
    add("get_diagram_design_skill", "Read the built-in user-provided tikz-diagram-reproduction skill. Choose design for composition/shape/color rules, reproduction for fidelity guidance, or swsa/gnn/mae/riemannian for paged original macro templates. Use macroIndex to jump to needed definitions. Learn visual patterns; do not copy unrelated architectures or full document preambles.", json!({
        "topic": {"type": "string", "enum": ["design", "reproduction", "swsa", "gnn", "mae", "riemannian"]},
        "startLine": {"type": "integer", "minimum": 1},
        "lineCount": {"type": "integer", "minimum": 1, "maximum": 160}
    }), vec![]);
    add("render_canvas_preview", "Compile the current canvas or pending proposal with real TeX and return a PNG image plus layout diagnostics. Does not apply edits. Inspect the image before refining the pending proposal. At most 3 distinct renders per request; identical previews are cached. Compilation is not visual verification. Requires local TeX and a vision-capable model.", json!({
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
        "Read AgenTikZ component descriptions and editable example snippets.",
        json!({
            "category": {"type": "string", "enum": ["all", "dl", "chart"]}
        }),
        vec![],
    );
    add(
        "get_theme_palette",
        "Read the semantic palette of the active or specified journal theme.",
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
    add("propose_tikz_patch", "Create or update a pending full-source canvas proposal (returns proposalId and layout report). Must be one complete \\begin{tikzpicture}...\\end{tikzpicture}. Supply revision/hash from the latest read.", complete,
        vec!["baseRevision", "baseSourceHash", "summary", "newTikzCode"]);
    let mut surgical = base.clone();
    surgical["patches"] = json!({
        "type": "array", "minItems": 1, "maxItems": 100,
        "items": {"type":"object", "properties":{"search":{"type":"string","minLength":1}, "replace":{"type":"string"}},
                  "required":["search","replace"], "additionalProperties":false}
    });
    add("propose_surgical_diff", "Create a pending exact SEARCH/REPLACE proposal against the live canvas (returns proposalId and layout report). Every search must match exactly once.", surgical,
        vec!["baseRevision", "baseSourceHash", "summary", "patches"]);
    let mut repair = base;
    repair["proposalId"] = json!({"type":"string", "minLength": 1});
    repair["themeId"] = json!({"type":"string", "enum":["neurips","cvpr","nature","ieee"]});
    add("propose_layout_repair", "Create a pending layout-repair proposal. Pass proposalId to repair your pending proposal; omitting proposalId repairs the original live canvas and replaces any pending proposal.", repair,
        vec!["baseRevision", "baseSourceHash", "summary"]);
    add("get_project_context", "Read the current project file index, active manuscript, canvas identity, dirty state and paper revision. Works across paper/figure views of the same project.", json!({}), vec![]);
    add("read_project_file", "Read an indexed project text file without changing the editor tab. Returns current editor source (including unsaved edits), paperRevision and sourceHash. Read every affected file before proposing manuscript changes.", json!({
        "relativePath": {"type":"string", "minLength":1, "maxLength":1024}
    }), vec!["relativePath"]);
    add("propose_project_patch", "Submit one reviewable change set for existing .tex/.bib/.sty/.cls files. Does not write files or apply edits. Use the paperRevision and hashes from read_project_file; .tikz edits must use canvas proposals.", json!({
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

impl ToolSpec {
    pub fn into_tool(self) -> Tool {
        Tool::new(
            self.name,
            self.description,
            self.input_schema.as_object().unwrap().clone(),
        )
    }
}
