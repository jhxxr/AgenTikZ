# 内置论文模板来源

`<id>/files/` 中的会议作者包为各会议公开发布的官方文件，原样存放，应用不修改它们，
也不向其中写入标题或作者。只有 `blank` 的 `main.tex` 由 AgenTikZ 编写。
IEEE 使用 CTAN 发布的 IEEEtran 1.8b 原始类文件、期刊 / 会议示例和参考文献样式。

| 模板 | 官方来源 | 主文件 | 说明 |
|---|---|---|---|
| IEEEtran 1.8b | https://mirrors.ctan.org/macros/latex/contrib/IEEEtran.zip | `bare_jrnl.tex` | 另含 `bare_conf.tex`；保留原始 README 和许可说明 |
| NeurIPS 2026 | https://media.neurips.cc/Conferences/NeurIPS2026/Formatting_Instructions_For_NeurIPS_2026.zip | `neurips_2026.tex` | 含 checklist |
| ICML 2026 | https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip | `example_paper.tex` | |
| ICLR 2027 | https://github.com/ICLR/Master-Template | `iclr2027_conference.tex` | |
| CVPR / ICCV | https://github.com/cvpr-org/author-kit | `main.tex` | 投 ICCV 时修改 `\confName` |
| ACL / EMNLP | https://github.com/acl-org/acl-style-files | `acl_latex.tex` | `acl_lualatex.tex` 需要 LuaLaTeX |

这五套文件取自 [poco-ai/Agentero](https://github.com/poco-ai/Agentero)（MIT）仓库
`src/lib/writing/templates/vendor/` 中原样收录的官方包，各文件的版权与许可以其文件头
和上游发布页为准。

## 引擎说明

官方包按 pdfLaTeX 编写。AgenTikZ 内置引擎为 XeLaTeX（Tectonic），以上五套均已用内置引擎
实测编译通过；版式细节可能与 pdfLaTeX 略有差异，正式投稿前请以会议要求的工具链复核。
ECCV 2026 官方包依赖的 `axessibility.sty` 需要 pdfLaTeX，内置引擎无法编译，因此未内置。
