# TikZ Macro Block Templates

## 1. Spiking Wavelet Self-Attention (SWSA) Template

```latex
\documentclass[10pt]{article}
\usepackage[T1]{fontenc}
\usepackage[paperwidth=260mm, paperheight=176mm, margin=2mm]{geometry}
\usepackage{tikz}
\usepackage{xcolor}
\usepackage{amsmath,amssymb}
\usepackage[scaled=0.95]{helvet}
\renewcommand{\familydefault}{\sfdefault}
\pagestyle{empty}

\usetikzlibrary{arrows.meta, calc, positioning, fit, backgrounds, shadings, shapes.geometric}

% =========================================================================
% 1. Color Palette (Sampled from Original Figure)
% =========================================================================
\definecolor{bgcontainer}{HTML}{F8F8F8}
\definecolor{convgreen}{HTML}{E2F0D9}
\definecolor{bnyellow}{HTML}{FFE699}
\definecolor{mppurple}{HTML}{C882C2}
\definecolor{swsablue}{HTML}{80B2F7}
\definecolor{linearpeach}{HTML}{FBE5D7}
\definecolor{classpurple}{HTML}{B9C1EF}
\definecolor{dwtblue}{HTML}{BDD7EF}
\definecolor{concatgrey}{HTML}{BABABA}
\definecolor{lifred}{HTML}{C9211E}

% Patch grid blues
\definecolor{patchNavy}{HTML}{07468D}
\definecolor{patchDeep}{HTML}{1D68A8}
\definecolor{patchMid}{HTML}{4F99C8}
\definecolor{patchSoft}{HTML}{8BBCD8}
\definecolor{patchLight}{HTML}{CFE4F3}
\definecolor{patchWhite}{HTML}{F4FCFE}

% =========================================================================
% 2. Dedicated Reusable Macro Blocks (专用模块宏定义)
% =========================================================================

% --- [Macro Block 1] Single Vertical Layer Block ---
% Usage: \LayerBlock[corner_radius]{node_name}{cx}{cy}{width}{height}{fill_color}{font_cmd}{label}
\newcommand{\LayerBlock}[9][4.5pt]{%
  \filldraw[fill=#7, draw=black, line width=1.05pt, rounded corners=#1]
    ({#3 - 0.5*#5}, {#4 - 0.5*#6}) rectangle ({#3 + 0.5*#5}, {#4 + 0.5*#6});
  \coordinate (#2) at ({#3}, {#4});
  \node[rotate=-90, align=center, font=#8, inner sep=0pt] at ({#3}, {#4}) {#9};
}

% --- [Macro Block 2] LIF Spiking Neuron Node ---
% Usage: \LIFNode{node_name}{cx}{cy}{radius}
\newcommand{\LIFNode}[4]{%
  \coordinate (#1) at ({#2}, {#3});
  \begin{scope}
    \fill[white] ({#2}, {#3}) circle (#4);
    \clip ({#2}, {#3}) circle (#4);
    \draw[lifred, line width=1.15pt, line join=round, line cap=round]
      ({#2 - 0.98*#4}, {#3 + 0.08*#4}) --
      ({#2 - 0.68*#4}, {#3 + 0.08*#4})
      .. controls ({#2 - 0.52*#4}, {#3 + 0.08*#4}) and ({#2 - 0.44*#4}, {#3 + 0.86*#4}) ..
      ({#2 - 0.33*#4}, {#3 + 0.86*#4})
      .. controls ({#2 - 0.22*#4}, {#3 + 0.86*#4}) and ({#2 - 0.08*#4}, {#3 - 0.88*#4}) ..
      ({#2 + 0.02*#4}, {#3 - 0.88*#4})
      .. controls ({#2 + 0.11*#4}, {#3 - 0.88*#4}) and ({#2 + 0.17*#4}, {#3 + 0.43*#4}) ..
      ({#2 + 0.27*#4}, {#3 + 0.43*#4})
      .. controls ({#2 + 0.35*#4}, {#3 + 0.43*#4}) and ({#2 + 0.42*#4}, {#3 + 0.13*#4}) ..
      ({#2 + 0.50*#4}, {#3 + 0.13*#4}) --
      ({#2 + 0.98*#4}, {#3 + 0.13*#4});
  \end{scope}
  \draw[black, line width=1.05pt] ({#2}, {#3}) circle (#4);
}

% --- [Macro Block 3] Element-wise Add Node (\oplus) ---
% Usage: \AddNode{node_name}{cx}{cy}{radius}
\newcommand{\AddNode}[4]{%
  \coordinate (#1) at ({#2}, {#3});
  \filldraw[fill=white, draw=black, line width=1.05pt] ({#2}, {#3}) circle (#4);
  \draw[black, line width=1.05pt] ({#2 - #4}, {#3}) -- ({#2 + #4}, {#3});
  \draw[black, line width=1.05pt] ({#2}, {#3 - #4}) -- ({#2}, {#3 + #4});
}

% --- [Macro Block 4] Matrix Dot-Product Node (\otimes) ---
% Usage: \MulNode{node_name}{cx}{cy}{radius}
\newcommand{\MulNode}[4]{%
  \coordinate (#1) at ({#2}, {#3});
  \filldraw[fill=white, draw=black, line width=1.05pt] ({#2}, {#3}) circle (#4);
  \draw[black, line width=1.05pt] ({#2 - 0.7071*#4}, {#3 - 0.7071*#4}) -- ({#2 + 0.7071*#4}, {#3 + 0.7071*#4});
  \draw[black, line width=1.05pt] ({#2 - 0.7071*#4}, {#3 + 0.7071*#4}) -- ({#2 + 0.7071*#4}, {#3 - 0.7071*#4});
}

% --- [Macro Block 5] Composite Block: LIF -> Linear -> BN (Used in MLP & Vanilla SSA) ---
% Usage: \LIFLinearBN{prefix}{lif_cx}{cy}{block_height}
\newcommand{\LIFLinearBN}[4]{%
  \LIFNode{#1-lif}{#2}{#3}{21.5}
  \LayerBlock{#1-lin}{#2 + 45.5}{#3}{36}{#4}{linearpeach}{\fontsize{15.5}{17}\selectfont}{Linear}
  \LayerBlock{#1-bn}{#2 + 89}{#3}{36}{#4}{bnyellow}{\fontsize{15.5}{17}\selectfont}{BN}
}

% --- [Macro Block 6] Composite Block: Linear -> BN -> LIF (Used 4x in SWSA) ---
% Usage: \LinearBNLIF{prefix}{lin_cx}{cy}{block_height}
\newcommand{\LinearBNLIF}[4]{%
  \LayerBlock{#1-lin}{#2}{#3}{36}{#4}{linearpeach}{\fontsize{15.5}{17}\selectfont}{Linear}
  \LayerBlock{#1-bn}{#2 + 43}{#3}{36}{#4}{bnyellow}{\fontsize{15.5}{17}\selectfont}{BN}
  \LIFNode{#1-lif}{#2 + 87.5}{#3}{21.5}
}

% --- [Macro Block 7] 3x3 Input Image Patch Grid ---
% Usage: \InputPatchGrid{x_left}{y_top}
\newcommand{\InputPatchGrid}[2]{%
  \begin{scope}[shift={(#1, #2)}]
    % Row 1
    \shade[shading=axis, top color=patchLight, bottom color=patchSoft, shading angle=135] (0, 0) rectangle (42, 40);
    \shade[shading=axis, top color=patchLight, bottom color=patchMid, shading angle=160] (46, 0) rectangle (87, 40);
    \shade[shading=axis, left color=patchMid, right color=patchLight, shading angle=75] (91, 0) rectangle (132, 40);
    % Row 2
    \shade[shading=axis, left color=patchMid, right color=patchSoft, shading angle=45] (0, 44) rectangle (42, 84);
    \shade[shading=axis, top color=patchMid, bottom color=patchNavy, shading angle=145] (46, 44) rectangle (87, 84);
    \shade[shading=axis, left color=patchNavy, right color=patchWhite, shading angle=85] (91, 44) rectangle (132, 84);
    % Row 3
    \shade[shading=axis, top color=patchSoft, bottom color=patchDeep, shading angle=135] (0, 87) rectangle (42, 127);
    \shade[shading=axis, top color=patchNavy, bottom color=patchMid, shading angle=35] (46, 87) rectangle (87, 127);
    \shade[shading=axis, top color=patchSoft, bottom color=patchNavy, shading angle=150] (91, 87) rectangle (132, 127);
  \end{scope}
}

\begin{document}
\noindent\centering
\begin{tikzpicture}[
  x=0.25mm, y=-0.25mm,
  >={Triangle[length=5.2pt, width=4.8pt]},
  lineline/.style={draw=black, line width=1.05pt},
  arrowline/.style={draw=black, line width=1.05pt, ->},
  dashedbox/.style={fill=bgcontainer, draw=black, line width=1.15pt, dash pattern=on 4.2pt off 2.8pt}
]

\useasboundingbox (0,0) rectangle (1023,688);

% =========================================================================
% 1. TOP LEFT: 3x3 Input Image Patch Grid
% =========================================================================
\InputPatchGrid{18}{86}
\draw[arrowline] (156, 155) -- (179, 155);

% =========================================================================
% 2. TOP LEFT-CENTER: SPS Block
% =========================================================================
\node[font=\bfseries\fontsize{16.5}{19}\selectfont] at (279.5, 49) {SPS};
\path[dashedbox, rounded corners=16pt] (179, 70) rectangle (380, 226);

\LayerBlock{sps-conv}{213}{153}{36}{113}{convgreen}{\fontsize{15.5}{17}\selectfont}{Conv 2D}
\LayerBlock{sps-bn}{256.5}{153}{37}{113}{bnyellow}{\fontsize{15.5}{17}\selectfont}{BN}
\LIFNode{sps-lif}{302}{153}{21.5}
\LayerBlock{sps-mp}{347}{153}{36}{113}{mppurple}{\fontsize{15.5}{17}\selectfont}{MP}

% =========================================================================
% 3. TOP RIGHT: Encoder Block x L & Classification Head
% =========================================================================
\node[font=\bfseries\fontsize{16.5}{19}\selectfont] at (665, 13) {Encoder Block $\boldsymbol{\times\ L}$};
\path[dashedbox, rounded corners=6pt] (393, 35) rectangle (931, 252);

% Arrow from SPS into SWSA & First Residual Branch
\draw[arrowline] (380, 153.5) -- (422, 153.5);
\draw[arrowline] (400, 153.5) -- (400, 50) -- (500, 50) -- (500, 134);

% SWSA & First Add Node
\LayerBlock{enc-swsa}{443}{153.5}{42}{113}{swsablue}{\fontsize{15.5}{17}\selectfont}{SWSA}
\draw[lineline] (464, 153.5) -- (480.5, 153.5);
\AddNode{enc-add1}{500}{153.5}{19.5}

% Arrow into MLP & Second Residual Branch
\draw[arrowline] (519.5, 153.5) -- (565.5, 153.5);
\draw[arrowline] (533, 153.5) -- (533, 49) -- (891, 49) -- (891, 135);

% MLP Sub-Container using 2x \LIFLinearBN Composite Macro Blocks
\path[dashedbox, rounded corners=14pt] (545, 86) rectangle (858, 218);
\node[font=\bfseries\fontsize{16.5}{19}\selectfont] at (737.5, 234) {MLP};

\LIFLinearBN{mlp1}{587}{153.5}{113}
\draw[arrowline] (694, 153.5) -- (716.5, 153.5);
\LIFLinearBN{mlp2}{738}{153.5}{113}

% Second Add Node & Classification Head
\draw[lineline] (845, 154.5) -- (871.5, 154.5);
\AddNode{enc-add2}{891}{154.5}{19.5}
\draw[arrowline] (910.5, 154.5) -- (955, 154.5);

\LayerBlock[7pt]{class-head}{986.5}{156}{63}{166}{classpurple}{\fontsize{15}{16}\selectfont}{Classification\\[-1pt]Head}

% =========================================================================
% 4. MIDDLE LEFT: Vanilla SSA
% =========================================================================
\node[font=\bfseries\fontsize{16.5}{19}\selectfont] at (186, 273.5) {Vanilla SSA};
\path[dashedbox, rounded corners=16pt] (15, 293) rectangle (352, 480);

\draw[lineline] (3, 391) -- (25.5, 391);
\LIFLinearBN{vssa}{47}{389}{114}

% Q, K, V Branches & Matrix Dot-Product Nodes
\draw[lineline] (154, 389) -- (168, 389);
\draw[lineline] (168, 332) -- (168, 443);

\draw[lineline] (168, 332) -- (187, 332);
\node[font=\fontsize{16}{18}\selectfont] at (202.5, 332) {$Q$};
\draw[lineline] (218, 332) -- (237.5, 332);

\draw[lineline] (168, 389) -- (186, 389);
\node[font=\fontsize{16}{18}\selectfont] at (202.5, 389) {$K$};
\draw[lineline] (217, 389) -- (252, 389) -- (252, 346.5);

\MulNode{vssa-mul1}{252}{332}{14.5}
\draw[lineline] (266.5, 332) -- (289, 332) -- (289, 428.5);

\draw[lineline] (168, 443) -- (187, 443);
\node[font=\fontsize{16}{18}\selectfont] at (202.5, 443) {$V$};
\draw[lineline] (214, 443) -- (274.5, 443);
\MulNode{vssa-mul2}{289}{443}{14.5}
\draw[arrowline] (303.5, 443) -- (369, 443);

% =========================================================================
% 5. BOTTOM LEFT: Legend Box
% =========================================================================
\filldraw[fill=white, draw=black, line width=1.05pt, rounded corners=18pt] (16, 489) rectangle (353, 682);

\AddNode{leg-add}{54}{528}{15.0}
\node[align=center, font=\fontsize{10.5}{12.5}\selectfont] at (125, 528) {Element-\\wise Add};

\MulNode{leg-mul}{202}{528}{14.5}
\node[align=center, font=\fontsize{10.5}{12.5}\selectfont] at (282, 528) {Matrix\\Dot-Product};

\LIFNode{leg-lif}{54}{578}{15.0}
\node[align=center, font=\fontsize{10.5}{12.5}\selectfont] at (127, 578) {LIF neuron};

\filldraw[fill=mppurple, draw=black, line width=1.05pt, rounded corners=3.5pt] (184, 564) rectangle (219, 591);
\node[font=\fontsize{11.5}{13}\selectfont] at (201.5, 577.5) {MP};
\node[align=center, font=\fontsize{10.5}{12.5}\selectfont] at (286.5, 578) {Max Pooling};

\filldraw[fill=dwtblue, draw=black, line width=1.05pt, rounded corners=3.5pt] (35, 620) rectangle (71, 647);
\node[font=\fontsize{8.5}{10}\selectfont] at (53, 633.5) {DWT};
\node[align=center, font=\fontsize{9.2}{11}\selectfont] at (127, 635) {Discrete Wavelet\\Transform};

\filldraw[fill=dwtblue, draw=black, line width=1.05pt, rounded corners=3.5pt] (184, 619) rectangle (219, 646);
\node[font=\fontsize{8.2}{10}\selectfont] at (201.5, 632.5) {IDWT};
\node[align=center, font=\fontsize{9.2}{11}\selectfont] at (286.5, 635) {Inverse Discrete\\Wavelet Transform};

% =========================================================================
% 6. BOTTOM RIGHT: Spiking Wavelet Self Attention (SWSA)
% =========================================================================
\draw[black, line width=1.1pt, dash pattern=on 3.2pt off 2.2pt] (442, 209) -- (399, 314);
\draw[black, line width=1.1pt, dash pattern=on 3.2pt off 2.2pt] (447, 209) -- (945, 291);

\path[dashedbox, rounded corners=26pt] (393, 291) rectangle (976, 683);
\node[font=\bfseries\fontsize{15.5}{18}\selectfont] at (604.5, 273) {Spiking Wavelet Self Attention (SWSA)};

% Input split
\draw[lineline] (378, 486) -- (458, 486);
\draw[lineline] (424, 486) -- (424, 366) -- (456, 366);

% 4x \LinearBNLIF Composite Macro Blocks for Q, Wavelet-branch, K, and V
\LinearBNLIF{swsa-q}{474.5}{366}{86}
\draw[lineline] (583.5, 366) -- (847, 366) -- (847, 407);
\node[font=\fontsize{16}{18}\selectfont] at (610, 349.5) {$Q$};

\LinearBNLIF{swsa-w}{476}{486}{86}
\draw[lineline] (563.5, 507.5) -- (563.5, 585);

% Wavelet Transform Blocks (DWT -> Conv -> IDWT)
\LayerBlock{swsa-dwt}{564}{628}{36}{86}{dwtblue}{\fontsize{15.5}{17}\selectfont}{DWT}
\LayerBlock{swsa-conv}{612}{628}{36}{86}{convgreen}{\fontsize{15.5}{17}\selectfont}{Conv}
\draw[lineline] (630, 629) -- (683, 629);
\draw[lineline] (657, 629) -- (657, 421.5) -- (682, 421.5);
\draw[lineline] (657, 527.5) -- (682, 527.5);
\LayerBlock{swsa-idwt}{701}{628}{36}{86}{dwtblue}{\fontsize{15.5}{17}\selectfont}{IDWT}
\draw[lineline] (719, 629) -- (933, 629) -- (933, 573);

% K and V Branches using \LinearBNLIF Macro Blocks
\LinearBNLIF{swsa-k}{700}{421.5}{86}
\draw[lineline] (809, 421.5) -- (832.5, 421.5);
\node[font=\fontsize{16}{18}\selectfont] at (824, 405) {$K$};
\MulNode{swsa-mul-k}{847}{421.5}{14.5}
\draw[lineline] (861.5, 421.5) -- (886, 421.5) -- (886, 514);

\LinearBNLIF{swsa-v}{700}{527.5}{86}
\draw[lineline] (809, 528.5) -- (871.5, 528.5);
\node[font=\fontsize{16}{18}\selectfont] at (846.5, 513) {$V$};
\MulNode{swsa-mul-v}{886}{528.5}{14.5}
\draw[lineline] (900.5, 528.5) -- (915, 528.5);

% Concat & Output
\LayerBlock{swsa-concat}{933}{530}{36}{86}{concatgrey}{\fontsize{15.5}{17}\selectfont}{Concat}
\draw[arrowline] (951, 529) -- (1003, 529);

\end{tikzpicture}
\end{document}

```

## 2. Multi-Panel BI-MCGNN Template (GNN + 3D Tensors + Signal Plots)

```latex
\documentclass[10pt]{article}
\usepackage[T1]{fontenc}
\usepackage[paperwidth=260mm, paperheight=153mm, margin=2mm]{geometry}
\usepackage{tikz}
\usepackage{xcolor}
\usepackage{amsmath,amssymb}
\usepackage{mathptmx}
\usepackage[scaled=0.92]{helvet}
\pagestyle{empty}

\usetikzlibrary{arrows.meta, calc, positioning, fit, backgrounds, shadings, shapes.geometric}

% =========================================================================
% 1. Color Palette (Sampled from Original BI-MCGNN Figure)
% =========================================================================
\definecolor{tempblue}{HTML}{2B6DA8}
\definecolor{specorange}{HTML}{E07A38}
\definecolor{posgrey}{HTML}{E6E6E6}
\definecolor{blockpeach}{HTML}{FCE4D6}
\definecolor{bnyellow}{HTML}{FFE699}
\definecolor{bafgrey}{HTML}{D0D0D0}
\definecolor{panelbg}{HTML}{EAEAEA}
\definecolor{panelborder}{HTML}{B8B8B8}
\definecolor{tilegrey}{HTML}{CFD2D2}
\definecolor{as1}{HTML}{DCEAF7}
\definecolor{as2}{HTML}{A6CAEA}
\definecolor{as3}{HTML}{205F9A}
\definecolor{as4}{HTML}{4F95D9}
\definecolor{as5}{HTML}{A5CBED}
\definecolor{cuboidLight}{HTML}{FCE4D6}
\definecolor{cuboidMid}{HTML}{F4B183}
\definecolor{cuboidDark}{HTML}{C55A11}

% Patch & Graph Node Colors
\definecolor{pBlue}{HTML}{4A86C5}
\definecolor{pBlueFill}{HTML}{DAE8F5}
\definecolor{pRed}{HTML}{C95B5B}
\definecolor{pRedFill}{HTML}{F5DADA}
\definecolor{pPurple}{HTML}{8E6BB0}
\definecolor{pPurpleFill}{HTML}{E6DDF0}
\definecolor{pOrange}{HTML}{E59B52}
\definecolor{pOrangeFill}{HTML}{FBE8D5}
\definecolor{pGreen}{HTML}{5CA866}
\definecolor{pGreenFill}{HTML}{DDF0DF}

% =========================================================================
% 2. Dedicated Reusable Macro Blocks (专用模块宏块定义)
% =========================================================================

% --- [Macro Block 1] Soft 3D Beveled Panel Container (Panels b & c) ---
% Usage: \BevelPanel{x1}{y1}{x2}{y2}{corner_radius}
\newcommand{\BevelPanel}[5]{%
  \fill[black!12, rounded corners=#5] ({#1-2}, {#2-2}) rectangle ({#3+3}, {#4+3});
  \fill[black!22, rounded corners=#5] ({#1-1}, {#2-1}) rectangle ({#3+1.5}, {#4+1.5});
  \filldraw[fill=panelbg, draw=black!38, line width=1.1pt, rounded corners=#5] ({#1}, {#2}) rectangle ({#3}, {#4});
  \draw[white!80, line width=0.8pt, rounded corners=#5] ({#1+1.5}, {#2+1.5}) rectangle ({#3-1.5}, {#4-1.5});
}

% --- [Macro Block 2] Vertical Rounded Layer Block (Rotated +90 deg) ---
% Usage: \VLayerBlock[draw_color]{name}{cx}{cy}{w}{h}{fill_color}{font_cmd}{label}
\newcommand{\VLayerBlock}[9][black]{%
  \coordinate (#2) at ({#3}, {#4});
  \filldraw[fill=#7, draw=#1, line width=1.05pt, rounded corners=4.5pt]
    ({#3 - 0.5*#5}, {#4 - 0.5*#6}) rectangle ({#3 + 0.5*#5}, {#4 + 0.5*#6});
  \node[rotate=90, align=center, font=#8, inner sep=0pt] at ({#3}, {#4}) {#9};
}

% --- [Macro Block 3] 5-Node Spatial Graph Icon Box (Used 6x across a & b) ---
% Usage: \GraphBox{name}{cx}{cy}{w}{h}
\newcommand{\GraphBox}[5]{%
  \coordinate (#1) at ({#2}, {#3});
  \filldraw[fill=white, draw=black, line width=1.0pt]
    ({#2 - 0.5*#4}, {#3 - 0.5*#5}) rectangle ({#2 + 0.5*#4}, {#3 + 0.5*#5});
  \begin{scope}[shift={({#2}, {#3})}]
    \coordinate (n1) at ({-0.24*#4}, {-0.23*#5});
    \coordinate (n2) at ({-0.31*#4}, {0.30*#5});
    \coordinate (n3) at ({-0.01*#4}, {0.06*#5});
    \coordinate (n4) at ({0.32*#4}, {-0.25*#5});
    \coordinate (n5) at ({0.22*#4}, {0.30*#5});
    \draw[black, line width=0.8pt] (n1) -- (n2) (n1) -- (n3) (n2) -- (n3) (n3) -- (n4) (n3) -- (n5) (n4) -- (n5);
    \draw[black, line width=0.8pt] (n1) .. controls ({0.04*#4}, {-0.34*#5}) .. (n4);
    \draw[black, line width=0.8pt] (n2) .. controls ({-0.04*#4}, {-0.26*#5}) and ({0.10*#4}, {-0.28*#5}) .. (n4);
    \draw[black, line width=0.8pt] (n1) .. controls ({0.05*#4}, {-0.14*#5}) and ({0.18*#4}, {0.02*#5}) .. (n5);
    \draw[black, line width=0.8pt] (n2) .. controls ({-0.02*#4}, {0.34*#5}) .. (n5);
    \filldraw[fill=pBlueFill, draw=black!75, line width=0.5pt] (n1) circle (2.6pt);
    \filldraw[fill=pGreenFill, draw=black!75, line width=0.5pt] (n2) circle (2.6pt);
    \filldraw[fill=pPurpleFill, draw=black!75, line width=0.5pt] (n3) circle (2.6pt);
    \filldraw[fill=pRedFill, draw=black!75, line width=0.5pt] (n4) circle (2.6pt);
    \filldraw[fill=as1, draw=black!75, line width=0.5pt] (n5) circle (2.6pt);
  \end{scope}
}

% --- [Macro Block 4] 3D Grey Feature Tile (Q^S, K^S, V^S in Panel b) ---
% Usage: \GreyTile{cx}{cy}{w}{h}{label}
\newcommand{\GreyTile}[5]{%
  \fill[black!22, rounded corners=2pt] ({#1 - 0.5*#3 + 1.5}, {#2 - 0.5*#4 + 1.5}) rectangle ({#1 + 0.5*#3 + 1.5}, {#2 + 0.5*#4 + 1.5});
  \filldraw[fill=tilegrey, draw=black!35, line width=0.6pt, rounded corners=2pt]
    ({#1 - 0.5*#3}, {#2 - 0.5*#4}) rectangle ({#1 + 0.5*#3}, {#2 + 0.5*#4});
  \node[font=\fontsize{8.5}{10}\selectfont] at ({#1}, {#2}) {#5};
}

% --- [Macro Block 5] Small Colored Patch Node (Used in Panel c) ---
% Usage: \PatchNode[opacity]{name}{cx}{cy}{w}{h}{draw_col}{fill_col}
\newcommand{\PatchNode}[8][1.0]{%
  \coordinate (#2) at ({#3}, {#4});
  \filldraw[fill=#8, draw=#7, line width=0.95pt, rounded corners=1.6pt, fill opacity=#1, draw opacity=#1]
    ({#3 - 0.5*#5}, {#4 - 0.5*#6}) rectangle ({#3 + 0.5*#5}, {#4 + 0.5*#6});
}

\begin{document}
\noindent\centering
\begin{tikzpicture}[
  x=0.25mm, y=-0.25mm,
  >={Latex[length=4.2pt, width=3.8pt]},
  bluearrow/.style={draw=tempblue, line width=1.05pt, ->},
  orangearrow/.style={draw=specorange, line width=1.05pt, ->},
  blackarrow/.style={draw=black, line width=1.05pt, ->},
  lblfont/.style={font=\bfseries\fontsize{9.5}{11}\selectfont},
  capfont/.style={font=\sffamily\fontsize{9.5}{11}\selectfont}
]

\useasboundingbox (0,0) rectangle (1024,596);

% =========================================================================
% PANEL (a): Overall structure of the BI-MCGNN
% =========================================================================

% --- Top Pathway Dashed Container (Temporal Feature) ---
\draw[draw=tempblue, line width=1.0pt, densely dashed] (3, 2) rectangle (605, 151);

% EEG Multi-Channel Signal Plot
\filldraw[fill=white, draw=black!55, line width=0.45pt] (33, 18) rectangle (198, 102);
\node[font=\sffamily\fontsize{3.8}{4.5}\selectfont] at (115, 14.5) {EEG Signal Visualization for 5 Channels};
\node[rotate=90, font=\sffamily\fontsize{3.5}{4}\selectfont] at (22, 60) {EEG Channels};
\node[font=\sffamily\fontsize{3.5}{4}\selectfont] at (115, 109) {Time (s)};
\fill[pGreenFill!70] (66, 19) rectangle (98, 101);
\fill[pPurpleFill!70] (98, 19) rectangle (129, 101);
\fill[bnyellow!35] (129, 19) rectangle (160, 101);
  \draw[black!85, line width=0.35pt] (38.0,34.8)--(41.0,28.1)--(44.1,25.4)--(47.1,34.8)--(50.2,31.7)--(53.2,24.8)--(56.2,31.5)--(59.3,32.8)--(62.3,28.0)--(65.4,29.7)--(68.4,30.0)--(71.4,30.5)--(74.5,31.6)--(77.5,27.4)--(80.5,29.3)--(83.6,33.8)--(86.6,28.5)--(89.7,27.2)--(92.7,32.4)--(95.7,31.4)--(98.8,28.4)--(101.8,28.5)--(104.9,31.3)--(107.9,32.8)--(110.9,26.9)--(114.0,27.5)--(117.0,35.4)--(120.1,29.6)--(123.1,24.5)--(126.1,33.6)--(129.2,32.7)--(132.2,25.8)--(135.3,30.3)--(138.3,32.0)--(141.3,29.4)--(144.4,30.0)--(147.4,28.6)--(150.5,30.5)--(153.5,32.7)--(156.5,27.3)--(159.6,28.4)--(162.6,33.7)--(165.6,29.7)--(168.7,27.3)--(171.7,30.7)--(174.8,31.8)--(177.8,30.2)--(180.8,27.3)--(183.9,29.9)--(186.9,34.5)--(190.0,27.6)--(193.0,25.8);
  \draw[black!85, line width=0.35pt] (38.0,44.2)--(41.0,39.8)--(44.1,45.8)--(47.1,47.8)--(50.2,39.9)--(53.2,42.8)--(56.2,47.9)--(59.3,42.7)--(62.3,42.6)--(65.4,44.9)--(68.4,43.5)--(71.4,45.6)--(74.5,43.4)--(77.5,41.0)--(80.5,47.5)--(83.6,45.6)--(86.6,39.0)--(89.7,45.4)--(92.7,47.9)--(95.7,41.2)--(98.8,42.0)--(101.8,46.2)--(104.9,45.5)--(107.9,42.2)--(110.9,41.7)--(114.0,47.1)--(117.0,45.9)--(120.1,39.2)--(123.1,44.6)--(126.1,48.5)--(129.2,40.9)--(132.2,42.2)--(135.3,46.9)--(138.3,43.5)--(141.3,43.6)--(144.4,43.9)--(147.4,42.8)--(150.5,46.7)--(153.5,43.9)--(156.5,39.9)--(159.6,47.0)--(162.6,46.7)--(165.6,39.5)--(168.7,43.8)--(171.7,47.7)--(174.8,43.1)--(177.8,41.6)--(180.8,44.3)--(183.9,46.8)--(186.9,43.6)--(190.0,40.0)--(193.0,46.4);
  \draw[black!85, line width=0.35pt] (38.0,55.9)--(41.0,57.6)--(44.1,61.3)--(47.1,57.0)--(50.2,54.7)--(53.2,60.7)--(56.2,59.3)--(59.3,55.5)--(62.3,58.3)--(65.4,58.5)--(68.4,58.6)--(71.4,58.6)--(74.5,55.0)--(77.5,59.3)--(80.5,61.9)--(83.6,53.4)--(86.6,56.4)--(89.7,63.9)--(92.7,56.2)--(95.7,53.8)--(98.8,61.4)--(101.8,59.7)--(104.9,55.5)--(107.9,57.1)--(110.9,59.5)--(114.0,59.8)--(117.0,55.8)--(120.1,56.2)--(123.1,61.7)--(126.1,58.0)--(129.2,54.5)--(132.2,59.8)--(135.3,59.4)--(138.3,56.7)--(141.3,58.0)--(144.4,57.1)--(147.4,59.3)--(150.5,59.8)--(153.5,53.9)--(156.5,58.4)--(159.6,63.2)--(162.6,54.2)--(165.6,55.0)--(168.7,63.3)--(171.7,57.9)--(174.8,54.0)--(177.8,59.4)--(180.8,60.2)--(183.9,57.4)--(186.9,55.8)--(190.0,58.3)--(193.0,61.2);
  \draw[black!85, line width=0.35pt] (38.0,71.7)--(41.0,73.1)--(44.1,73.4)--(47.1,69.3)--(50.2,71.6)--(53.2,75.4)--(56.2,70.7)--(59.3,69.8)--(62.3,73.5)--(65.4,73.0)--(68.4,71.7)--(71.4,70.1)--(74.5,72.0)--(77.5,75.9)--(80.5,69.8)--(83.6,68.0)--(86.6,77.3)--(89.7,73.1)--(92.7,66.0)--(95.7,74.4)--(98.8,75.6)--(101.8,68.5)--(104.9,71.2)--(107.9,73.9)--(110.9,72.3)--(114.0,71.7)--(117.0,70.2)--(120.1,72.9)--(123.1,74.5)--(126.1,69.4)--(129.2,70.7)--(132.2,75.1)--(135.3,71.7)--(138.3,70.2)--(141.3,72.0)--(144.4,73.0)--(147.4,73.5)--(150.5,69.4)--(153.5,70.4)--(156.5,77.1)--(159.6,70.9)--(162.6,66.6)--(165.6,76.5)--(168.7,74.6)--(171.7,66.6)--(174.8,72.8)--(177.8,75.4)--(180.8,70.3)--(183.9,70.8)--(186.9,72.3)--(190.0,73.2)--(193.0,72.7);
  \draw[black!85, line width=0.35pt] (38.0,85.7)--(41.0,87.4)--(44.1,85.7)--(47.1,83.1)--(50.2,88.8)--(53.2,87.8)--(56.2,81.8)--(59.3,86.4)--(62.3,89.3)--(65.4,84.7)--(68.4,83.9)--(71.4,86.7)--(74.5,88.5)--(77.5,85.3)--(80.5,82.2)--(83.6,88.8)--(86.6,89.4)--(89.7,80.8)--(92.7,85.5)--(95.7,91.2)--(98.8,83.5)--(101.8,83.5)--(104.9,88.8)--(107.9,86.0)--(110.9,85.4)--(114.0,85.8)--(117.0,84.8)--(120.1,88.5)--(123.1,86.2)--(126.1,82.2)--(129.2,88.2)--(132.2,88.7)--(135.3,82.7)--(138.3,85.2)--(141.3,88.6)--(144.4,86.5)--(147.4,84.0)--(150.5,84.6)--(153.5,89.2)--(156.5,87.0)--(159.6,80.9)--(162.6,87.6)--(165.6,90.8)--(168.7,81.5)--(171.7,84.2)--(174.8,90.7)--(177.8,84.8)--(180.8,83.8)--(183.9,87.3)--(186.9,86.0)--(190.0,86.8)--(193.0,85.4);
\node[anchor=north east, font=\sffamily\fontsize{2.8}{3.2}\selectfont, align=left, fill=white!80, inner sep=1pt] at (196, 20) {t-2\\t-1\\t\\t+1\\t+2};
\node[lblfont] at (114, 128) {Temporal feature};

% Top Pathway Blocks & Arrows
\draw[bluearrow] (199, 66) -- (222, 66);
\VLayerBlock{top-pos}{239}{66}{34}{118}{posgrey}{\bfseries\fontsize{8.5}{10}\selectfont}{Position encoding}
\draw[bluearrow] (256, 66) -- (275, 66);
\VLayerBlock{top-fc}{292.5}{69}{35}{92}{blockpeach}{\bfseries\fontsize{8.2}{9.5}\selectfont}{FC Graph\\Construction}
\draw[bluearrow] (310, 66) -- (339, 66);
\GraphBox{top-g1}{374}{65.5}{70}{41}
\node[lblfont, align=left] at (374, 111) {spatial-temporal\\graph\ \ $\boldsymbol{G^T}$};
\draw[bluearrow] (409, 66) -- (438, 66);
\VLayerBlock{top-ms}{455}{66}{34}{114}{blockpeach}{\bfseries\fontsize{8.2}{9.5}\selectfont}{Mul-scale Graph\\Convolution}
\draw[bluearrow] (472, 66) -- (508, 66);
\GraphBox{top-g2}{543}{66}{70}{40}
\node[lblfont] at (543, 105) {Updated graph};

% --- Bottom Pathway Dashed Container (Spectral Feature) ---
\draw[draw=specorange, line width=1.0pt, densely dashed] (3, 173) rectangle (607, 323);

% PSD Frequency Domain Plot
\filldraw[fill=white, draw=black!55, line width=0.45pt] (28, 193) rectangle (198, 272);
\node[font=\sffamily\fontsize{3.8}{4.5}\selectfont] at (113, 189.5) {Frequency Domain (PSD)};
\node[rotate=90, font=\sffamily\fontsize{3.5}{4}\selectfont] at (18, 232) {Power Spectral Density};
\node[font=\sffamily\fontsize{3.5}{4}\selectfont] at (113, 279) {Frequency (Hz)};
\fill[pPurpleFill!55] (36, 194) rectangle (48, 271);
\fill[pGreenFill!65] (48, 194) rectangle (61, 271);
\fill[pBlueFill!75] (61, 194) rectangle (77, 271);
\fill[bnyellow!35] (77, 194) rectangle (115, 271);
\fill[blockpeach!55] (115, 194) rectangle (178, 271);
  \draw[blue!75!black, line width=0.45pt] (36.0,248.9)--(38.8,240.2)--(41.5,243.0)--(44.3,250.5)--(47.0,237.8)--(49.8,240.7)--(52.5,232.5)--(55.3,238.5)--(58.0,245.2)--(60.8,235.1)--(63.5,244.9)--(66.3,211.1)--(69.1,211.0)--(71.8,245.4)--(74.6,242.9)--(77.3,250.8)--(80.1,245.5)--(82.8,240.4)--(85.6,253.0)--(88.3,245.5)--(91.1,244.0)--(93.8,238.9)--(96.6,238.7)--(99.4,252.1)--(102.1,241.4)--(104.9,245.4)--(107.6,251.7)--(110.4,244.9)--(113.1,248.8)--(115.9,242.5)--(118.6,249.4)--(121.4,251.7)--(124.1,239.9)--(126.9,249.4)--(129.6,247.9)--(132.4,247.5)--(135.2,247.6)--(137.9,241.2)--(140.7,253.6)--(143.4,246.9)--(146.2,242.2)--(148.9,250.0)--(151.7,245.6)--(154.4,250.8)--(157.2,243.4)--(159.9,244.1)--(162.7,254.4)--(165.5,243.1)--(168.2,246.3)--(171.0,247.2)--(173.7,247.2)--(176.5,251.4)--(179.2,239.8)--(182.0,249.1)--(184.7,251.3)--(187.5,243.0)--(190.2,248.3)--(193.0,244.1);
\node[anchor=north east, font=\sffamily\fontsize{3.0}{3.6}\selectfont, align=left, fill=white!85, inner sep=1pt] at (196, 195) {Delta (0.5-4 Hz)\\Theta (4-8 Hz)\\Alpha (8-13 Hz)\\Beta (13-25 Hz)\\Gamma (25-45 Hz)};
\node[lblfont] at (107, 298) {spectral feature};

% Bottom Pathway Blocks & Arrows
\draw[orangearrow] (199, 238) -- (224, 238);
\VLayerBlock{bot-pos}{241}{238}{34}{118}{posgrey}{\bfseries\fontsize{8.5}{10}\selectfont}{Position encoding}
\draw[orangearrow] (258, 238) -- (280, 238);
\VLayerBlock{bot-fc}{297}{236}{34}{93}{blockpeach}{\bfseries\fontsize{8.2}{9.5}\selectfont}{FC Graph\\Construction}
\draw[orangearrow] (314, 240) -- (338, 240);
\GraphBox{bot-g1}{373}{240}{70}{40}
\node[lblfont, align=left] at (373, 285) {spatial-spectral\\graph\ \ $\boldsymbol{G^B}$};
\draw[orangearrow] (408, 240) -- (440, 240);
\VLayerBlock{bot-ms}{457}{240}{34}{114}{blockpeach}{\bfseries\fontsize{8.2}{9.5}\selectfont}{Mul-scale Graph\\Convolution}
\draw[orangearrow] (474, 240) -- (506, 240);
\GraphBox{bot-g2}{541}{240}{70}{40}
\node[lblfont] at (541, 285) {Updated graph};

% --- BAF Block & Orthogonal Arrows from Top/Bottom Pathways ---
\fill[black!15, rounded corners=3pt] (635, 106) rectangle (702, 218);
\fill[bafgrey, rounded corners=3pt] (633, 104) rectangle (700, 216);
\node[font=\bfseries\fontsize{16}{18}\selectfont] at (666.5, 160) {BAF};

\draw[bluearrow] (578, 66) -- (666.5, 66) -- (666.5, 104);
\draw[orangearrow] (576, 240) -- (666.5, 240) -- (666.5, 216);

% Hollow 3D Arrow from BAF to Top-Right Feature Graph
\draw[black!75, line width=1.0pt] (705, 95) -- (726, 75) -- (723, 72) -- (735, 71) -- (734, 83) -- (731, 80) -- (710, 100) -- cycle;

% --- Top-Right Feature Graph, 3D Tensor F^{TB}, 3D Output Pyramid & Datasets ---
\foreach \x/\col/\fcol in {772/pGreen/pGreenFill, 802/pOrange/bnyellow!60, 832/pBlue/pBlueFill, 862/pPurple/pPurpleFill} {
  \filldraw[fill=\fcol, draw=\col, line width=0.6pt] (\x-4, 5) rectangle (\x+4, 29);
  \draw[\col, line width=0.5pt] (\x-4, 13) -- (\x+4, 13) (\x-4, 21) -- (\x+4, 21);
}
\fill[pGreenFill!60, rotate around={-15:(782,85)}] (782, 85) ellipse (16 and 7);
\fill[pBlueFill!65, rotate around={-28:(825,68)}] (825, 68) ellipse (36 and 11);
\coordinate (gn1) at (785, 42);
\coordinate (gn2) at (773, 82);
\coordinate (gn3) at (817, 65);
\coordinate (gn4) at (862, 43);
\coordinate (gn5) at (850, 84);
\draw[black!65, line width=0.9pt] (gn1)--(gn2) (gn1)--(gn3) (gn1)--(gn4) (gn2)--(gn3) (gn2)--(gn5) (gn3)--(gn4) (gn3)--(gn5) (gn4)--(gn5) (gn1)--(gn5);
\draw[pGreen, densely dashed, line width=0.8pt, ->] (772, 30) -- (gn2);
\draw[pOrange, densely dashed, line width=0.8pt, ->] (802, 30) -- (gn1);
\draw[pBlue, densely dashed, line width=0.8pt, ->] (832, 30) -- (gn3);
\draw[pPurple, densely dashed, line width=0.8pt, ->] (862, 30) -- (gn4);
\foreach \n in {gn1,gn2,gn3,gn4,gn5} {
  \filldraw[fill=black!28, draw=black!55, line width=0.5pt] (\n) circle (3.5pt);
}

\draw[blackarrow] (820, 95) -- (820, 111);

% 3D Isometric 6-Cell Tensor Bar F^{TB}
\filldraw[fill=cuboidLight, draw=specorange, line width=0.8pt]
  (762, 126) -- (772, 116) -- (874, 116) -- (864, 126) -- cycle;
\filldraw[fill=cuboidMid!60, draw=specorange, line width=0.8pt]
  (864, 126) -- (874, 116) -- (874, 132) -- (864, 142) -- cycle;
\filldraw[fill=white, draw=specorange, line width=0.8pt]
  (762, 126) rectangle (864, 142);
\foreach \i in {1,2,3,4,5} {
  \pgfmathsetmacro{\xx}{762 + \i*17}
  \draw[specorange, line width=0.7pt] (\xx, 126) -- (\xx, 142) (\xx, 126) -- ({\xx+10}, 116);
}
\draw[specorange!70, line width=0.6pt] (762, 134) -- (864, 134) (767, 121) -- (869, 121);
\node[lblfont] at (884, 136) {$\boldsymbol{F^{TB}}$};

\draw[blackarrow] (820, 152) -- (820, 170);

% 3D Wireframe Inverted Pyramid (Output Layer)
\draw[black!28, line width=0.9pt]
  (766, 184) -- (776, 176) -- (882, 176) -- (872, 184) -- cycle
  (788, 228) -- (795, 222) -- (855, 222) -- (848, 228) -- cycle
  (766, 184) -- (788, 228) (872, 184) -- (848, 228) (882, 176) -- (855, 222);
\draw[black!22, densely dashed, line width=0.7pt] (776, 176) -- (795, 222);
\filldraw[fill=white!70, draw=black!35, line width=0.65pt]
  (773, 193) -- (781, 187) -- (873, 187) -- (865, 193) -- cycle;
\filldraw[fill=white!70, draw=black!35, line width=0.65pt]
  (782, 210) -- (789, 204) -- (863, 204) -- (856, 210) -- cycle;
\node[font=\sffamily\fontsize{9.2}{11}\selectfont] at (821, 241) {Output layer};

% Split Arrow into AHEPA Dataset & CAUEEG Dataset
\draw[black, line width=1.1pt] (831, 251) -- (831, 266);
\draw[blackarrow] (831, 266) -- (752, 266) -- (752, 281);
\draw[blackarrow] (831, 266) -- (915, 266) -- (915, 281);

% AHEPA Dataset Box
\filldraw[fill=white, draw=black, line width=0.95pt, rounded corners=4pt] (682, 281) rectangle (827, 309);
\filldraw[fill=pBlueFill, draw=black, line width=0.85pt] (695, 295) circle (5.5pt);
\node[lblfont] at (715, 295) {NC};
\filldraw[fill=pPurpleFill, draw=black, line width=0.85pt] (739, 295) circle (5.5pt);
\node[lblfont] at (757, 295) {AD};
\filldraw[fill=blockpeach, draw=black, line width=0.85pt] (781, 295) circle (5.5pt);
\node[lblfont] at (803, 295) {FTD};
\node[lblfont] at (742, 321) {AHEPA Dataset};

% CAUEEG Dataset Box
\filldraw[fill=white, draw=black, line width=0.95pt, rounded corners=4pt] (840, 281) rectangle (990, 309);
\filldraw[fill=pBlueFill, draw=black, line width=0.85pt] (853, 295) circle (5.5pt);
\node[lblfont] at (873, 295) {NC};
\filldraw[fill=pPurpleFill, draw=black, line width=0.85pt] (897, 295) circle (5.5pt);
\node[lblfont] at (920, 295) {MCI};
\filldraw[fill=blockpeach, draw=black, line width=0.85pt] (944, 295) circle (5.5pt);
\node[lblfont] at (969, 295) {DEM};
\node[lblfont] at (915, 321) {CAUEEG Dataset};

% Subcaption (a)
\node[capfont] at (505, 333) {(a) Overall structure of the BI-MCGNN};


% =========================================================================
% PANEL (b): Bi-Path Attention Fusion (BAF)
% =========================================================================
\BevelPanel{7}{344}{388}{574}{26pt}
\node[capfont] at (204, 588) {(b) Bi-Path Attention Fusion (BAF)};

% Top input graph G^T & Linear Projection
\GraphBox{b-g1}{63.5}{398.5}{67}{39}
\node[lblfont, align=left] at (66, 436) {spatial-spectral\\graph\ \ $\boldsymbol{G^T}$};
\draw[bluearrow] (97, 398.5) -- (130, 398.5);
\VLayerBlock[tempblue]{b-lp1}{146}{398.5}{31}{74}{white}{\bfseries\fontsize{8.0}{9.0}\selectfont}{Linear\\Projection}
\node[lblfont] at (146, 444) {$\boldsymbol{F^B}$};

% Bottom input graph G^B & Linear Projection
\GraphBox{b-g2}{63.5}{492}{67}{40}
\node[lblfont, align=left] at (66, 533) {spatial-temporal\\graph\ \ $\boldsymbol{G^B}$};
\draw[orangearrow] (97, 492) -- (130, 492);
\VLayerBlock[specorange]{b-lp2}{146}{495}{31}{74}{white}{\bfseries\fontsize{8.0}{9.0}\selectfont}{Linear\\Projection}
\node[lblfont] at (146, 542) {$\boldsymbol{F^T}$};

% Q^S, K^S, V^S Tiles & Routing into Scale -> SoftMax -> A^S
\draw[bluearrow] (161.5, 398.5) -- (177, 398.5);
\GreyTile{189}{398.5}{23}{43}{$\boldsymbol{Q^S}$}
\draw[bluearrow] (200.5, 398.5) -- (216, 398.5);

\draw[orangearrow] (161.5, 472) -- (177, 472);
\GreyTile{189}{472}{23}{43}{$\boldsymbol{K^S}$}
\draw[orangearrow] (200.5, 472) -- (216, 472);

\VLayerBlock{b-scale}{226}{432}{20}{85}{posgrey}{\bfseries\fontsize{8.2}{9.5}\selectfont}{Scale}
\draw[blackarrow] (236, 432) -- (253, 432);
\VLayerBlock{b-softmax}{263}{432}{20}{85}{posgrey}{\bfseries\fontsize{8.2}{9.5}\selectfont}{SoftMax}
\draw[blackarrow] (273, 432) -- (293, 432);

% 5-Cell Attention Weight Matrix A^S
\filldraw[fill=as1, draw=black, line width=0.8pt] (293, 425) rectangle (307, 440);
\filldraw[fill=as2, draw=black, line width=0.8pt] (307, 425) rectangle (321, 440);
\filldraw[fill=as3, draw=black, line width=0.8pt] (321, 425) rectangle (335, 440);
\filldraw[fill=as4, draw=black, line width=0.8pt] (335, 425) rectangle (349, 440);
\filldraw[fill=as5, draw=black, line width=0.8pt] (349, 425) rectangle (363, 440);
\node[lblfont] at (334, 453) {$\boldsymbol{A^S}$};

% V^S Branch & Multiplication Node \otimes -> 3D Cuboid F^{TB}
\draw[orangearrow] (161.5, 513) -- (214, 513);
\GreyTile{226}{513}{23}{43}{$\boldsymbol{V^S}$}
\draw[orangearrow] (237.5, 513) -- (293, 513);

\filldraw[fill=white, draw=black, line width=1.0pt] (301, 513) circle (8pt);
\draw[black, line width=0.9pt] (295.4, 507.4) -- (306.6, 518.6) (295.4, 518.6) -- (306.6, 507.4);
\draw[blackarrow] (301, 440) -- (301, 505);
\draw[blackarrow] (309, 513) -- (333, 513);

% 3D Orange Cuboid (fusion feature F^{TB})
\filldraw[fill=cuboidMid, draw=black, line width=0.85pt]
  (333, 496) -- (340, 496) -- (340, 530) -- (333, 523) -- cycle;
\filldraw[fill=cuboidDark!75, draw=black, line width=0.85pt]
  (333, 496) -- (356, 496) -- (363, 503) -- (340, 503) -- cycle;
\shade[top color=cuboidLight, bottom color=cuboidMid, draw=black, line width=0.85pt]
  (340, 503) rectangle (363, 530);
\node[lblfont, align=center] at (346, 548) {fusion feature\\$\boldsymbol{F^{TB}}$};


% =========================================================================
% PANEL (c): Multi-Scale Graph Convolution
% =========================================================================
\BevelPanel{404}{342}{1015}{574}{26pt}
\node[capfont] at (717, 588) {(c) Multi-Scale Graph Convolution};

% --- Bottom-Left Sliding Window Module ---
\node[lblfont] at (462, 453) {Sliding window};
\filldraw[fill=white!55, draw=black!38, line width=1.0pt, rounded corners=6pt] (467, 463) rectangle (610, 508);

% Nested Sliding Window Frames: Red (s=3), Orange (s=2), Blue (s=1)
\draw[draw=pRed!90!red, line width=1.1pt, rounded corners=5pt] (476, 467) rectangle (584, 504);
\draw[draw=pOrange!95!red, line width=1.0pt, rounded corners=4pt] (480, 470) rectangle (559, 501);
\draw[draw=pBlue!85!cyan, line width=0.95pt, rounded corners=3pt] (484, 473) rectangle (512, 498);

% 5 Colored Patch Nodes inside Sliding Window
\PatchNode{p1}{497}{487}{16}{11}{pBlue}{pBlueFill}
\PatchNode{p2}{522}{487}{16}{11}{pRed}{pRedFill}
\PatchNode{p3}{547}{487}{16}{11}{pPurple}{pPurpleFill}
\PatchNode{p4}{571}{487}{16}{11}{pOrange}{pOrangeFill}
\PatchNode{p5}{596}{487}{16}{11}{pGreen}{pGreenFill}

% Upper & Lower Graph Edges between Patches 1..5
\draw[black, line width=0.75pt]
  (497, 481.5) .. controls (510, 468) and (534, 468) .. (547, 481.5)
  (497, 481.5) .. controls (518, 462) and (552, 462) .. (571, 481.5)
  (497, 481.5) .. controls (525, 456) and (568, 456) .. (596, 481.5)
  (522, 492.5) .. controls (535, 501) and (558, 501) .. (571, 492.5)
  (547, 492.5) .. controls (560, 502) and (583, 502) .. (596, 492.5);

\node[lblfont] at (448, 521) {Patch index};
\node[lblfont] at (497, 521) {1};
\node[lblfont] at (522, 521) {2};
\node[lblfont] at (547, 521) {3};
\node[lblfont] at (571, 521) {4};
\node[lblfont] at (596, 521) {5};

\draw[blackarrow] (610, 489) -- (631, 489);

% --- Top-Right 3 Stacked Scale Cascades (Scale 1, Scale 2, Scale 3) ---
\node[font=\sffamily\fontsize{8.0}{9.5}\selectfont] at (557, 369) {Scale 1 (s = 1)};
\node[font=\sffamily\fontsize{8.0}{9.5}\selectfont] at (658, 369) {Scale 2 (s = 2)};
\node[font=\sffamily\fontsize{8.0}{9.5}\selectfont] at (772, 369) {Scale 3 (s = 3)};

% Scale 1 Cascade (s = 1)
\foreach \idx/\dx/\dy/\dcol/\fcol/\op in {
  5/28/-36/pGreen/pGreenFill/0.45,
  4/21/-27/pOrange/pOrangeFill/0.55,
  3/14/-18/pPurple/pPurpleFill/0.68,
  2/7/-9/pRed/pRedFill/0.82,
  1/0/0/pBlue/pBlueFill/1.0
} {
  \begin{scope}[shift={({647+\dx}, {447+\dy})}, opacity=\op]
    \filldraw[fill=white!90, draw=pBlue!70, line width=0.8pt, rounded corners=3.5pt] (-13, -9) rectangle (13, 9);
    \PatchNode[\op]{s1-\idx}{0}{0}{15}{10}{\dcol}{\fcol}
  \end{scope}
}
\draw[black, line width=0.7pt] (647, 442) -- (654, 433) (654, 433) -- (661, 424) (661, 424) -- (668, 415) (668, 415) -- (675, 406);

% Scale 2 Cascade (s = 2)
\foreach \idx/\dx/\dy/\ca/\fa/\cb/\fb/\op in {
  3/24/-28/pPurple/pPurpleFill/pGreen/pGreenFill/0.48,
  2/12/-14/pRed/pRedFill/pOrange/pOrangeFill/0.72,
  1/0/0/pBlue/pBlueFill/pRed/pRedFill/1.0
} {
  \begin{scope}[shift={({740+\dx}, {444+\dy})}, opacity=\op]
    \filldraw[fill=white!90, draw=pOrange!85, line width=0.85pt, rounded corners=4pt] (-24, -11) rectangle (24, 11);
    \PatchNode[\op]{s2a-\idx}{-11}{1}{15}{10}{\ca}{\fa}
    \PatchNode[\op]{s2b-\idx}{11}{1}{15}{10}{\cb}{\fb}
    \draw[black, line width=0.65pt] (-11, -4) .. controls (0, -9) .. (11, -4);
  \end{scope}
}

% Scale 3 Cascade (s = 3)
\begin{scope}[shift={(878, 418)}, opacity=0.65]
  \filldraw[fill=white!90, draw=pRed!90!red, line width=0.95pt, rounded corners=5pt] (-45, -18) rectangle (45, 16);
  \PatchNode[0.65]{s3t1}{-30}{2}{16}{11}{pRed}{pRedFill}
  \PatchNode[0.65]{s3t2}{-6}{2}{16}{11}{pPurple}{pPurpleFill}
  \PatchNode[0.65]{s3t3}{18}{2}{16}{11}{pOrange}{pOrangeFill}
  \PatchNode[0.65]{s3t4}{34}{-3}{15}{10}{pGreen}{pGreenFill}
  \draw[black, line width=0.65pt] (-30, -3.5) .. controls (-18, -11) .. (-6, -3.5) (-30, -3.5) .. controls (-6, -14) .. (18, -3.5);
\end{scope}
\begin{scope}[shift={(862, 442)}]
  \filldraw[fill=white!92, draw=pRed!95!red, line width=1.05pt, rounded corners=5pt] (-45, -16) rectangle (45, 16);
  \PatchNode{s3b1}{-30}{1}{16}{11}{pBlue}{pBlueFill}
  \PatchNode{s3b2}{-6}{1}{16}{11}{pRed}{pRedFill}
  \PatchNode{s3b3}{18}{1}{16}{11}{pPurple}{pPurpleFill}
  \PatchNode{s3b4}{34}{1}{15}{10}{pOrange!60}{pOrangeFill!60}
  \draw[black, line width=0.7pt]
    (-30, -4.5) .. controls (-18, -12) .. (-6, -4.5)
    (-30, -4.5) .. controls (-6, -15) .. (18, -4.5)
    (-6, 6.5) .. controls (6, 13) .. (18, 6.5);
\end{scope}

% Curved Scale Arrows from Sliding Window to Scale 1, 2, 3 Cascades
\draw[draw=pBlue!70, line width=1.05pt, ->] (498, 473) .. controls (515, 390) and (595, 365) .. (662, 398);
\draw[draw=pOrange!80, line width=1.05pt, ->] (515, 470) .. controls (545, 378) and (680, 360) .. (768, 398);
\draw[draw=pRed!95!red, line width=1.15pt, ->] (530, 467) .. controls (575, 372) and (740, 368) .. (878, 397);

% Downward Arrows from Scale 1, 2, 3 into Mul-scale Graph Convolution Bar
\draw[blackarrow] (655, 458) -- (655, 478);
\draw[blackarrow] (750, 458) -- (750, 478);
\draw[blackarrow] (868, 458) -- (868, 478);

% Horizontal Mul-scale Graph Convolution Bar
\filldraw[fill=blockpeach, draw=black, line width=1.05pt, rounded corners=3pt] (631, 478) rectangle (924, 502);
\node[font=\bfseries\itshape\fontsize{9.5}{11}\selectfont] at (777.5, 490) {Mul-scale\ \ Graph Convolution};

% Output Arrow & Bottom Note
\draw[blackarrow] (924, 490) -- (947, 490);
\node[lblfont, align=left] at (975, 493) {Updated\\graph};
\node[lblfont, align=left] at (762, 532) {Dynamically adjust the contribution\\of features at different scales};

\end{tikzpicture}
\end{document}

```

## 3. Masked EEG Autoencoder & Momentum Alignment Template (Multi-Stripe Tokens + Masked Heatmaps)

```latex
\documentclass[10pt]{article}
\usepackage[T1]{fontenc}
\usepackage[paperwidth=240mm, paperheight=146mm, margin=2mm]{geometry}
\usepackage{tikz}
\usepackage{xcolor}
\usepackage{amsmath,amssymb}
\usepackage{mathptmx}
\usepackage[scaled=0.92]{helvet}
\pagestyle{empty}

\usetikzlibrary{arrows.meta, calc, positioning, fit, backgrounds, shapes.geometric}

% =========================================================================
% 1. Color Palette (Exact RGB Hex Codes Sampled from Original Figure)
% =========================================================================
\definecolor{transblue}{HTML}{9DC3E6}
\definecolor{recpeach}{HTML}{F8CBAD}
\definecolor{predyellow}{HTML}{FFE699}
\definecolor{encgreen}{HTML}{C5E0B4}
\definecolor{momgreen}{HTML}{A9D18E}
\definecolor{dashblue}{HTML}{2F5597}
\definecolor{arrowgrey}{HTML}{7F7F7F}

% 4x6 Patched EEG Heatmap Colors (Row 1: Orange-Brown, Row 2: Grey, Row 3: Gold, Row 4: Blue)
\definecolor{r1c1}{HTML}{FCE5D6} \definecolor{r1c2}{HTML}{F8CBAD} \definecolor{r1c3}{HTML}{F5B184}
\definecolor{r1c4}{HTML}{EE7D31} \definecolor{r1c5}{HTML}{C55B11} \definecolor{r1c6}{HTML}{843C0B}

\definecolor{r2c1}{HTML}{EEEEEE} \definecolor{r2c2}{HTML}{DBDADB} \definecolor{r2c3}{HTML}{C9C9C9}
\definecolor{r2c4}{HTML}{A5A5A5} \definecolor{r2c5}{HTML}{7B7B7B} \definecolor{r2c6}{HTML}{525252}

\definecolor{r3c1}{HTML}{FEF1CC} \definecolor{r3c2}{HTML}{FEE698} \definecolor{r3c3}{HTML}{FFD967}
\definecolor{r3c4}{HTML}{FEC000} \definecolor{r3c5}{HTML}{C09001} \definecolor{r3c6}{HTML}{7E6000}

\definecolor{r4c1}{HTML}{DEECF8} \definecolor{r4c2}{HTML}{BDD7EE} \definecolor{r4c3}{HTML}{9DC3E6}
\definecolor{r4c4}{HTML}{5B9AD5} \definecolor{r4c5}{HTML}{2F75B6} \definecolor{r4c6}{HTML}{1E4E79}

% =========================================================================
% 2. Dedicated Reusable Macro Blocks (专用模块宏块定义)
% =========================================================================

% --- [Macro Block 1] Horizontal Rounded Model Bar ---
% Usage: \ModelBar{name}{x1}{y1}{x2}{y2}{fill_col}{label}
\newcommand{\ModelBar}[7]{%
  \coordinate (#1) at ({0.5*(#2+#4)}, {0.5*(#3+#5)});
  \fill[fill=#6, rounded corners=4pt] ({#2}, {#3}) rectangle ({#4}, {#5});
  \node[font=\fontsize{8.5}{10}\selectfont] at ({0.5*(#2+#4)}, {0.5*(#3+#5)}) {#7};
}

% --- [Macro Block 2] Square Bordered Token / Query Box ---
% Usage: \TokenBox[border_style]{cx}{cy}{w}{h}{fill_col}{label}
\newcommand{\TokenBox}[7][solid]{%
  \filldraw[fill=#6, draw=black, line width=0.9pt, #1]
    ({#2 - 0.5*#4}, {#3 - 0.5*#5}) rectangle ({#2 + 0.5*#4}, {#3 + 0.5*#5});
  \node[font=\fontsize{8.2}{9.5}\selectfont, inner sep=0pt] at ({#2}, {#3}) {#7};
}

% --- [Macro Block 3] Multi-Stripe Column Token (enc_1..6 / pred_1..6) ---
% Usage: \StripeToken{x1}{y1}{w}{h}{col_idx}{border_style}
% Automatically renders the exact horizontal color stripes of column #5 (1..6)
\newcommand{\StripeToken}[6]{%
  \ifnum#5=1
    \fill[r2c1] ({#1}, {#2}) rectangle ({#1+#3}, {#2+0.50*#4});
    \fill[r3c1] ({#1}, {#2+0.50*#4}) rectangle ({#1+#3}, {#2+#4});
  \fi
  \ifnum#5=2
    \fill[r1c2] ({#1}, {#2}) rectangle ({#1+#3}, {#2+0.25*#4});
    \fill[r2c2] ({#1}, {#2+0.25*#4}) rectangle ({#1+#3}, {#2+0.50*#4});
    \fill[r3c2] ({#1}, {#2+0.50*#4}) rectangle ({#1+#3}, {#2+0.75*#4});
    \fill[r4c2] ({#1}, {#2+0.75*#4}) rectangle ({#1+#3}, {#2+#4});
  \fi
  \ifnum#5=3
    \fill[r2c3] ({#1}, {#2}) rectangle ({#1+#3}, {#2+0.333*#4});
    \fill[r3c3] ({#1}, {#2+0.333*#4}) rectangle ({#1+#3}, {#2+0.667*#4});
    \fill[r4c3] ({#1}, {#2+0.667*#4}) rectangle ({#1+#3}, {#2+#4});
  \fi
  \ifnum#5=4
    \fill[r1c4] ({#1}, {#2}) rectangle ({#1+#3}, {#2+0.333*#4});
    \fill[r2c4] ({#1}, {#2+0.333*#4}) rectangle ({#1+#3}, {#2+0.667*#4});
    \fill[r4c4] ({#1}, {#2+0.667*#4}) rectangle ({#1+#3}, {#2+#4});
  \fi
  \ifnum#5=5
    \fill[r1c5] ({#1}, {#2}) rectangle ({#1+#3}, {#2+0.25*#4});
    \fill[r2c5] ({#1}, {#2+0.25*#4}) rectangle ({#1+#3}, {#2+0.50*#4});
    \fill[r3c5] ({#1}, {#2+0.50*#4}) rectangle ({#1+#3}, {#2+0.75*#4});
    \fill[r4c5] ({#1}, {#2+0.75*#4}) rectangle ({#1+#3}, {#2+#4});
  \fi
  \ifnum#5=6
    \fill[r1c6] ({#1}, {#2}) rectangle ({#1+#3}, {#2+#4});
  \fi
  \draw[#6] ({#1}, {#2}) rectangle ({#1+#3}, {#2+#4});
}

% --- [Macro Block 4] 1x6 Horizontal Token Strip (Encoded / Prediction / Select / Combined) ---
% Usage: \TokenStrip{x1}{y1}{cell_w}{h}{mode}
% mode 1 = Encoded Tokens (cols 1,3,4,6 colored; cols 2,5 white)
% mode 2 = Prediction / Momentum Target (all 6 cols colored)
% mode 3 = Select (only cols 2,5 colored; cols 1,3,4,6 white, dashed outer box)
% mode 4 = Combined Before Reconstructor (all 6 cols colored with individual black borders)
\newcommand{\TokenStrip}[5]{%
  \ifnum#5=1
    \fill[white] ({#1}, {#2}) rectangle ({#1+6*#3}, {#2+#4});
    \StripeToken{#1}{#2}{#3}{#4}{1}{draw=none}
    \StripeToken{#1+2*#3}{#2}{#3}{#4}{3}{draw=none}
    \StripeToken{#1+3*#3}{#2}{#3}{#4}{4}{draw=none}
    \StripeToken{#1+5*#3}{#2}{#3}{#4}{6}{draw=none}
    \draw[black, line width=0.8pt] ({#1}, {#2}) rectangle ({#1+6*#3}, {#2+#4});
  \fi
  \ifnum#5=2
    \foreach \c in {1,2,3,4,5,6} {
      \StripeToken{#1+(\c-1)*#3}{#2}{#3}{#4}{\c}{draw=none}
    }
  \fi
  \ifnum#5=3
    \fill[white] ({#1}, {#2}) rectangle ({#1+6*#3}, {#2+#4});
    \StripeToken{#1+#3}{#2}{#3}{#4}{2}{draw=none}
    \StripeToken{#1+4*#3}{#2}{#3}{#4}{5}{draw=none}
    \draw[black, densely dashed, line width=0.85pt] ({#1}, {#2}) rectangle ({#1+6*#3}, {#2+#4});
  \fi
  \ifnum#5=4
    \StripeToken{#1}{#2}{#3}{#4}{1}{draw=black, line width=0.75pt}
    \StripeToken{#1+#3}{#2}{#3}{#4}{2}{draw=black, densely dashed, line width=0.75pt}
    \StripeToken{#1+2*#3}{#2}{#3}{#4}{3}{draw=black, line width=0.75pt}
    \StripeToken{#1+3*#3}{#2}{#3}{#4}{4}{draw=black, line width=0.75pt}
    \StripeToken{#1+4*#3}{#2}{#3}{#4}{5}{draw=black, densely dashed, line width=0.75pt}
    \StripeToken{#1+5*#3}{#2}{#3}{#4}{6}{draw=black, line width=0.75pt}
  \fi
}

% --- [Macro Block 5] 4x6 Patched EEG Grid (Unmasked / Masked / Reconstructed) ---
% Usage: \PatchedEEGGrid{x1}{y1}{cell_w}{cell_h}{mode}
% mode 0 = Unmasked (all 24 cells solid)
% mode 1 = Masked Input (15 masked cells have white inner square, solid outer border)
% mode 2 = Reconstructed Output (9 unmasked cells have white inner square, dashed outer border)
% mode 3 = Reconstruction Target (9 unmasked cells have white inner square, solid outer border)
\newcommand{\PatchedEEGGrid}[5]{%
  \foreach \r in {1,2,3,4} {
    \foreach \c in {1,2,3,4,5,6} {
      \fill[r\r c\c] ({#1+(\c-1)*#3}, {#2+(\r-1)*#4}) rectangle ({#1+\c*#3}, {#2+\r*#4});
    }
  }
  \ifnum#5=1
    % 15 Masked positions
    \foreach \r/\c in {1/1, 1/2, 1/3, 1/5, 2/2, 2/5, 2/6, 3/2, 3/4, 3/5, 3/6, 4/1, 4/2, 4/5, 4/6} {
      \fill[white] ({#1+(\c-0.82)*#3}, {#2+(\r-0.82)*#4}) rectangle ({#1+(\c-0.18)*#3}, {#2+(\r-0.18)*#4});
    }
    \draw[black, line width=0.9pt] ({#1}, {#2}) rectangle ({#1+6*#3}, {#2+4*#4});
  \fi
  \ifnum#5=2
    % 9 Complement (Unmasked) positions
    \foreach \r/\c in {1/4, 1/6, 2/1, 2/3, 2/4, 3/1, 3/3, 4/3, 4/4} {
      \fill[white] ({#1+(\c-0.82)*#3}, {#2+(\r-0.82)*#4}) rectangle ({#1+(\c-0.18)*#3}, {#2+(\r-0.18)*#4});
    }
    \draw[black, dashed, line width=1.1pt] ({#1}, {#2}) rectangle ({#1+6*#3}, {#2+4*#4});
  \fi
  \ifnum#5=3
    \foreach \r/\c in {1/4, 1/6, 2/1, 2/3, 2/4, 3/1, 3/3, 4/3, 4/4} {
      \fill[white] ({#1+(\c-0.82)*#3}, {#2+(\r-0.82)*#4}) rectangle ({#1+(\c-0.18)*#3}, {#2+(\r-0.18)*#4});
    }
    \draw[black, line width=0.9pt] ({#1}, {#2}) rectangle ({#1+6*#3}, {#2+4*#4});
  \fi
  \ifnum#5=0
    \draw[black, line width=0.9pt] ({#1}, {#2}) rectangle ({#1+6*#3}, {#2+4*#4});
  \fi
}

% --- [Macro Block 6] Embedding Plus Node (\oplus) ---
\newcommand{\EmbedPlus}[3]{%
  \filldraw[fill=white, draw=black, line width=0.8pt] ({#1}, {#2}) circle (#3);
  \draw[black, line width=0.75pt] ({#1-#3}, {#2}) -- ({#1+#3}, {#2}) ({#1}, {#2-#3}) -- ({#1}, {#2+#3});
}

\begin{document}
\noindent\centering
\begin{tikzpicture}[
  x=0.25mm, y=-0.25mm,
  >={Latex[length=4.5pt, width=4.0pt]},
  mainarrow/.style={draw=black, line width=1.2pt, ->},
  smallarrow/.style={draw=black, line width=0.85pt, ->},
  greyarrow/.style={draw=arrowgrey, line width=1.3pt, ->},
  mathlbl/.style={font=\fontsize{8.0}{9.5}\selectfont},
  txtlbl/.style={font=\rmfamily\fontsize{8.0}{9.5}\selectfont}
]

\useasboundingbox (0,0) rectangle (906,548);

% =========================================================================
% 1. LEFT COLUMN: 3 Zoomed Callout Modules (Reconstructor, Predictor, Encoder)
% =========================================================================

% --- [Top Callout] Reconstructor Internal Structure ---
\draw[draw=recpeach!95!orange, line width=1.1pt, dash pattern=on 5pt off 3pt, rounded corners=18pt]
  (21, 28) rectangle (266, 178);
\draw[draw=recpeach!90!orange, line width=0.7pt] (260, 42) -- (338, 134);
\draw[draw=recpeach!90!orange, line width=0.7pt] (260, 172) -- (338, 137);

% Output rec_{i,j} above Transformer
\node[mathlbl] at (44, 38) {$rec_{i,j}$};
\filldraw[fill=r1c1, draw=dashblue, densely dashed, line width=0.85pt] (35, 48) rectangle (53, 64);
\draw[smallarrow] (44, 77) -- (44, 64);

\ModelBar{trans-top}{28}{77}{259}{103}{transblue}{Transformer}

% 7 Input tokens below Top Transformer: q_{i,j}, enc_1, pred_2, enc_3, enc_4, pred_5, enc_6
\TokenBox{44}{120}{18}{16}{white}{$q_{i,j}$}
\draw[smallarrow] (44, 112) -- (44, 103);

\foreach \c/\x/\bstyle/\lbl in {
  1/66/{draw=dashblue, line width=0.75pt}/enc_1,
  2/98/{draw=dashblue, densely dashed, line width=0.8pt}/pred_2,
  3/130/{draw=dashblue, line width=0.75pt}/enc_3,
  4/162/{draw=dashblue, line width=0.75pt}/enc_4,
  5/194/{draw=dashblue, densely dashed, line width=0.8pt}/pred_5,
  6/225/{draw=dashblue, line width=0.75pt}/enc_6
} {
  \StripeToken{\x}{112}{18}{16}{\c}{\bstyle}
  \draw[smallarrow] ({\x+9}, 112) -- ({\x+9}, 103);
  \node[mathlbl] at ({\x+9}, 141) {$\lbl$};
  \node[mathlbl] at ({\x+9}, 154) {$+$};
  \node[mathlbl] at ({\x+9}, 168) {$pos_{\c}$};
}


% --- [Middle Callout] Predictor Internal Structure ---
\draw[draw=predyellow!95!orange, line width=1.1pt, dash pattern=on 5pt off 3pt, rounded corners=18pt]
  (21, 198) rectangle (266, 351);
\draw[draw=predyellow!95!orange, line width=0.7pt] (260, 212) -- (338, 316);
\draw[draw=predyellow!95!orange, line width=0.7pt] (260, 345) -- (338, 319);

% 6 Predicted tokens pred_1..pred_6 above Middle Transformer
\foreach \c/\x in {1/66, 2/98, 3/130, 4/162, 5/194, 6/225} {
  \node[mathlbl] at ({\x+9}, 211) {$pred_{\c}$};
  \StripeToken{\x}{220}{18}{16}{\c}{draw=dashblue, densely dashed, line width=0.8pt}
  \draw[smallarrow] ({\x+9}, 250) -- ({\x+9}, 236);
}

\ModelBar{trans-mid}{27}{250}{259}{279}{transblue}{Transformer}

% 6 Input tokens below Middle Transformer: enc_1, query, enc_3, enc_4, query, enc_6
\foreach \c/\x in {1/66, 3/130, 4/162, 6/225} {
  \StripeToken{\x}{291}{18}{16}{\c}{draw=dashblue, line width=0.75pt}
  \draw[smallarrow] ({\x+9}, 291) -- ({\x+9}, 279);
  \node[mathlbl] at ({\x+9}, 319) {$enc_{\c}$};
  \node[mathlbl] at ({\x+9}, 332) {$+$};
  \node[mathlbl] at ({\x+9}, 345) {$pos_{\c}$};
}
\foreach \c/\x in {2/98, 5/194} {
  \TokenBox{\x+9}{299}{18}{16}{white}{$q$}
  \draw[smallarrow] ({\x+9}, 291) -- ({\x+9}, 279);
  \node[mathlbl] at ({\x+9}, 319) {$query$};
  \node[mathlbl] at ({\x+9}, 332) {$+$};
  \node[mathlbl] at ({\x+9}, 345) {$pos_{\c}$};
}


% --- [Bottom Callout] Encoder Internal Structure ---
\draw[draw=encgreen!90!black, line width=1.1pt, dash pattern=on 5pt off 3pt, rounded corners=18pt]
  (21, 375) rectangle (266, 520);
\draw[draw=encgreen!90!black, line width=0.7pt] (258, 383) -- (338, 394);
\draw[draw=encgreen!90!black, line width=0.7pt] (258, 512) -- (338, 397);

% Output Summary Tokens [e_1, e_2] = enc_i above Bottom Transformer
\node[mathlbl] at (189, 386) {$enc_i$};
\draw[black, densely dashed, line width=0.85pt] (158, 394) rectangle (219, 421);
\TokenBox{172}{407.5}{16}{16}{white}{$e_1$}
\TokenBox{204}{407.5}{16}{16}{white}{$e_2$}
\draw[smallarrow] (172, 429) -- (172, 415.5);
\draw[smallarrow] (204, 429) -- (204, 415.5);
\node[mathlbl] at (229, 407.5) {$=$};
\StripeToken{239}{399.5}{18}{16}{4}{draw=dashblue, line width=0.75pt}

\ModelBar{trans-bot}{28}{429}{260}{455}{transblue}{Transformer}

% 3 Unmasked Patch Tokens + 2 Summary Tokens s_1, s_2 below Bottom Transformer
\fill[r1c4] (68, 466) rectangle (86, 482);
\fill[r2c4] (100, 466) rectangle (118, 482);
\fill[r4c4] (132, 466) rectangle (150, 482);
\foreach \x in {77, 109, 141} {
  \draw[smallarrow] (\x, 466) -- (\x, 455);
}
\node[mathlbl, align=center] at (109, 498) {$token_{i,j}$\\$\in masked$};

\TokenBox{172}{474}{16}{16}{white}{$s_1$}
\TokenBox{204}{474}{16}{16}{white}{$s_2$}
\draw[smallarrow] (172, 466) -- (172, 455);
\draw[smallarrow] (204, 466) -- (204, 455);
\node[mathlbl, align=center] at (188, 498) {$\mathit{Summary}$\\$\mathit{Tokens}$};


% =========================================================================
% 2. CENTER & RIGHT PIPELINE: Masked Autoencoder & Momentum Alignment
% =========================================================================

% --- Bottom Input Row: Masked & Unmasked Patched EEG ---
\PatchedEEGGrid{405}{451}{15.83}{16}{1}
\node[txtlbl] at (452.5, 530) {Patched EEG};

\PatchedEEGGrid{703}{451}{15.83}{16}{0}
\node[txtlbl] at (750.5, 530) {Patched EEG};

% Time / Channel axes indicator on Unmasked Patched EEG
\draw[black, line width=0.8pt, ->] (698, 446) -- (719, 446);
\draw[black, line width=0.8pt, ->] (698, 446) -- (698, 467);
\node[mathlbl] at (714, 439) {$\mathit{time}$};
\node[mathlbl] at (676, 458) {$\mathit{channel}$};

% Grey "masked" arrow from right Patched EEG to center Patched EEG
\draw[greyarrow] (703, 485) -- (501, 485);
\node[font=\sffamily\fontsize{7.5}{9}\selectfont] at (616, 476) {masked};

% Grey "unmasked" bypass arrow from right Patched EEG all the way up to Target Grid
\draw[greyarrow] (798, 482) -- (885, 482) -- (885, 64) -- (798, 64);
\node[font=\sffamily\fontsize{7.5}{9}\selectfont] at (838, 474) {unmasked};

% --- Embedding Nodes & Encoder / Momentum Encoder Bars ---
\draw[mainarrow] (452.5, 451) -- (452.5, 408);
\EmbedPlus{452.5}{431}{9.5}
\node[txtlbl, anchor=west] at (468, 433) {Embedding};

\draw[mainarrow] (750.5, 451) -- (750.5, 408);
\EmbedPlus{750.5}{431}{9.5}
\node[txtlbl, anchor=west] at (766, 433) {Embedding};

\ModelBar{encoder}{335}{381}{569}{408}{encgreen}{Encoder}
\ModelBar{mom-encoder}{633}{381}{866}{408}{momgreen}{Momentum Encoder}

% --- Encoded Tokens Strip & Predictor ---
\draw[mainarrow] (452.5, 381) -- (452.5, 360);
\TokenStrip{405}{343}{15.83}{17}{1}
\node[txtlbl, anchor=west] at (466, 369) {Encoded Tokens};

\draw[mainarrow] (452.5, 343) -- (452.5, 330);
\ModelBar{predictor}{335}{303}{569}{330}{predyellow}{Predictor}

% --- Prediction Strip, Momentum Target Strip & Alignment Loss ---
\draw[mainarrow] (452.5, 303) -- (452.5, 290);
\TokenStrip{405}{273}{15.83}{17}{2}
\draw[dashblue, densely dashed, line width=0.85pt] (405, 273) rectangle (500, 290);
\node[txtlbl, anchor=west] at (468, 297) {Prediction};

\draw[mainarrow] (750.5, 381) -- (750.5, 290);
\TokenStrip{703}{273}{15.83}{17}{2}
\draw[black, line width=0.85pt] (703, 273) rectangle (798, 290);

% Alignment Loss Box
\filldraw[fill=white, draw=black, line width=0.8pt] (530, 273) rectangle (661, 290);
\node[txtlbl] at (595.5, 281.5) {Alignment Loss};
\draw[greyarrow] (500, 281.5) -- (530, 281.5);
\draw[greyarrow] (703, 281.5) -- (661, 281.5);

% --- Select Strip, Skip Connection (+) & Reconstructor ---
\draw[mainarrow] (452.5, 273) -- (452.5, 255);
\node[txtlbl, anchor=west] at (468, 265) {Select};
\TokenStrip{405}{238}{15.83}{17}{3}

% Addition Node (+) combining Encoded Tokens skip connection & Selected Predictions
\draw[mainarrow] (452.5, 238) -- (452.5, 222);
\filldraw[fill=white, draw=black, line width=0.85pt] (452.5, 211.5) circle (10.5);
\node[font=\bfseries\fontsize{10}{11}\selectfont] at (452.5, 211.5) {+};

% Skip connection from Encoded Tokens (left side at x=405, y=351.5) up to (+)
\draw[mainarrow, line width=1.5pt] (405, 351.5) -- (320, 351.5) -- (320, 211.5) -- (442, 211.5);

% Combined Token Strip before Reconstructor
\draw[mainarrow] (452.5, 201) -- (452.5, 181);
\TokenStrip{405}{164}{15.83}{17}{4}

\draw[mainarrow] (452.5, 164) -- (452.5, 150);
\ModelBar{reconstructor}{336}{123}{569}{150}{recpeach}{Reconstructor}

% --- Top Row: Reconstructed EEG, Target EEG & Reconstruction Loss ---
\draw[mainarrow] (452.5, 123) -- (452.5, 96);
\node[txtlbl, anchor=west] at (468, 112) {Reconstructed EEG};

\PatchedEEGGrid{405}{32}{15.83}{16}{2}
\PatchedEEGGrid{703}{32}{15.83}{16}{3}

% Reconstruction Loss Box
\filldraw[fill=white, draw=black, line width=0.8pt] (533, 55.5) rectangle (664, 72.5);
\node[txtlbl] at (598.5, 64) {Reconstruction Loss};
\draw[greyarrow] (500, 64) -- (533, 64);
\draw[greyarrow] (703, 64) -- (664, 64);

\end{tikzpicture}
\end{document}

```

## 4. Dual-Stream Riemannian Geometry + Unrolled Temporal LSTM + Topoplot Template

```latex
\documentclass[10pt]{article}
\usepackage[T1]{fontenc}
\usepackage[paperwidth=260mm, paperheight=114mm, margin=2mm]{geometry}
\usepackage{tikz}
\usepackage{xcolor}
\usepackage{amsmath,amssymb}
\usepackage{mathptmx}
\usepackage[scaled=0.92]{helvet}
\pagestyle{empty}

\usetikzlibrary{arrows.meta, calc, positioning, fit, backgrounds, shadings, shapes.geometric}

% =========================================================================
% 1. Color Palette (Sampled from Original Figure)
% =========================================================================
\definecolor{plumblock}{HTML}{7C5A74}
\definecolor{oliveblock}{HTML}{9E8D65}
\definecolor{fcgreen}{HTML}{54813A}
\definecolor{slateblock}{HTML}{6D7F9B}
\definecolor{goldgate}{HTML}{BC901E}
\definecolor{outred}{HTML}{DD3F24}
\definecolor{streamblue}{HTML}{4A72BF}
\definecolor{axisblue}{HTML}{2E75B6}
\definecolor{fbLightBlue}{HTML}{8BB4D0}
\definecolor{fbVividBlue}{HTML}{1F77B4}

% Covariance Heatmap & Brain Topoplot Palette
\definecolor{covRed}{HTML}{C93B2B}
\definecolor{covOrange}{HTML}{E87D2F}
\definecolor{covYellow}{HTML}{F5C75D}
\definecolor{covCyan}{HTML}{7BC8A4}
\definecolor{topoRed}{HTML}{990000}
\definecolor{topoOrange}{HTML}{F97316}
\definecolor{topoYellow}{HTML}{FACC15}
\definecolor{topoCyan}{HTML}{22D3EE}
\definecolor{topoBlue}{HTML}{1D4ED8}
\definecolor{topoNavy}{HTML}{0F172A}

% Window & Row Highlight Dashed Colors
\definecolor{winRed}{HTML}{C00000}
\definecolor{winGreen}{HTML}{548235}
\definecolor{winPurple}{HTML}{7030A0}

% =========================================================================
% 2. Dedicated Reusable Macro Blocks (专用模块宏块定义)
% =========================================================================

% --- [Macro Block 1] Dark Vertical Block with White Rotated Text (-90 deg) ---
% Usage: \DarkVBlock[corner_r]{name}{cx}{cy}{w}{h}{fill_col}{font_cmd}{label}
\newcommand{\DarkVBlock}[9][3.5pt]{%
  \coordinate (#2) at ({#3}, {#4});
  \filldraw[fill=#7, draw=black!85, line width=0.85pt, rounded corners=#1]
    ({#3 - 0.5*#5}, {#4 - 0.5*#6}) rectangle ({#3 + 0.5*#5}, {#4 + 0.5*#6});
  \node[rotate=-90, align=center, text=white, font=#8, inner sep=0pt] at ({#3}, {#4}) {#9};
}

% --- [Macro Block 2] Forest-Green Beveled FC Block ---
% Usage: \FCBlock{name}{cx}{cy}{w}{h}{label}
\newcommand{\FCBlock}[6]{%
  \coordinate (#1) at ({#2}, {#3});
  \fill[black!22, rounded corners=3.5pt]
    ({#2 - 0.5*#4 - 1.2}, {#3 - 0.5*#5 - 1.2}) rectangle ({#2 + 0.5*#4 + 1.2}, {#3 + 0.5*#5 + 1.2});
  \filldraw[fill=fcgreen, draw=white!90, line width=0.7pt, rounded corners=3pt]
    ({#2 - 0.5*#4}, {#3 - 0.5*#5}) rectangle ({#2 + 0.5*#4}, {#3 + 0.5*#5});
  \node[rotate=-90, align=center, text=white!92, font=\sffamily\fontsize{5.8}{6.8}\selectfont, inner sep=0pt] at ({#2}, {#3}) {#6};
}

% --- [Macro Block 3] Symmetric Spatial Covariance Matrix Icon ---
% Usage: \CovMatrixIcon{x1}{y1}{w}{h}{dominant_mode}
\newcommand{\CovMatrixIcon}[5]{%
  \begin{scope}[shift={({#1}, {#2})}]
    \fill[covOrange] (0, 0) rectangle ({#3}, {#4});
    \pgfmathsetmacro{\cw}{#3/6.0}
    \pgfmathsetmacro{\ch}{#4/6.0}
    \foreach \r in {0,...,5} {
      \foreach \c in {0,...,5} {
        \pgfmathsetmacro{\d}{abs(\r-\c)}
        \ifnum#5=1
          \ifdim\d pt<1.1pt \fill[covRed] ({\c*\cw}, {\r*\ch}) rectangle ({(\c+1)*\cw}, {(\r+1)*\ch}); \fi
          \ifdim\d pt>2.5pt \fill[covYellow] ({\c*\cw}, {\r*\ch}) rectangle ({(\c+1)*\cw}, {(\r+1)*\ch}); \fi
          \ifdim\d pt>3.8pt \fill[covCyan] ({\c*\cw}, {\r*\ch}) rectangle ({(\c+1)*\cw}, {(\r+1)*\ch}); \fi
        \else
          \ifdim\d pt<1.5pt \fill[covRed] ({\c*\cw}, {\r*\ch}) rectangle ({(\c+1)*\cw}, {(\r+1)*\ch}); \fi
          \ifdim\d pt>2.2pt \fill[covOrange!80!covRed] ({\c*\cw}, {\r*\ch}) rectangle ({(\c+1)*\cw}, {(\r+1)*\ch}); \fi
          \ifdim\d pt>3.5pt \fill[covYellow!85!covRed] ({\c*\cw}, {\r*\ch}) rectangle ({(\c+1)*\cw}, {(\r+1)*\ch}); \fi
        \fi
      }
    }
    \draw[black!45, line width=0.35pt] (0, 0) rectangle ({#3}, {#4});
  \end{scope}
}

% --- [Macro Block 4] Circular Scalp EEG Topoplot Node ---
% Usage: \TopoMapNode{cx}{cy}{r}{palette_mode}
\newcommand{\TopoMapNode}[4]{%
  \begin{scope}
    \clip ({#1}, {#2}) circle (#3);
    \ifnum#4=1
      \shade[shading=axis, top color=topoRed, bottom color=topoCyan, middle color=topoYellow, shading angle=145]
        ({#1-#3}, {#2-#3}) rectangle ({#1+#3}, {#2+#3});
    \fi
    \ifnum#4=2
      \shade[shading=axis, top color=topoBlue!75!topoCyan, bottom color=topoYellow!85!green, middle color=topoCyan, shading angle=160]
        ({#1-#3}, {#2-#3}) rectangle ({#1+#3}, {#2+#3});
    \fi
    \ifnum#4=3
      \shade[shading=radial, inner color=topoBlue, outer color=topoNavy]
        ({#1-#3}, {#2-#3}) rectangle ({#1+#3}, {#2+#3});
    \fi
    % Electrode sensor dots inside scalp map
    \foreach \dx/\dy in {-0.4/-0.45, 0.35/-0.4, -0.5/0.1, 0.0/0.0, 0.45/0.15, -0.3/0.5, 0.3/0.45} {
      \fill[black!70] ({#1+\dx*#3}, {#2+\dy*#3}) circle (0.45pt);
    }
  \end{scope}
  \draw[black!55, line width=0.4pt] ({#1}, {#2}) circle (#3);
}

% --- [Macro Block 5] Unrolled Vertical LSTM Column (t_n, t_2, \vdots, t_1) ---
% Usage: \LSTMColumn{prefix}{cx}{next_x}
\newcommand{\LSTMColumn}[3]{%
  \DarkVBlock[2.5pt]{#1-tn}{#2}{242.5}{15}{31}{slateblock}{\sffamily\fontsize{5.5}{6.5}\selectfont}{LSTM}
  \DarkVBlock[2.5pt]{#1-t2}{#2}{284.5}{15}{31}{slateblock}{\sffamily\fontsize{5.5}{6.5}\selectfont}{LSTM}
  \DarkVBlock[2.5pt]{#1-t1}{#2}{374.5}{15}{31}{slateblock}{\sffamily\fontsize{5.5}{6.5}\selectfont}{LSTM}
  % Vertical recurrent arrows & dots
  \draw[black, line width=1.0pt, ->] ({#2}, 258) -- ({#2}, 269);
  \draw[black, line width=1.0pt, ->] ({#2}, 300) -- ({#2}, 315);
  \node[font=\bfseries\fontsize{8}{9}\selectfont] at ({#2}, 330) {$\vdots$};
  \draw[black, line width=1.0pt, ->] ({#2}, 343) -- ({#2}, 359);
  % Horizontal output arrows to next layer
  \draw[black, line width=1.0pt, ->] ({#2+7.5}, 242.5) -- ({#3}, 242.5);
  \draw[black, line width=1.0pt, ->] ({#2+7.5}, 284.5) -- ({#3}, 284.5);
  \draw[black, line width=1.0pt, ->] ({#2+7.5}, 374.5) -- ({#3}, 374.5);
}

% --- [Macro Block 6] Dashed Trapezoidal Twin-FC Encoder (Spatial / Temporal Info Encoder) ---
% Usage: \TrapezoidEncoder{prefix}{cy}{y_top_left}{y_bot_left}{y_top_right}{y_bot_right}
\newcommand{\TrapezoidEncoder}[6]{%
  \draw[black, densely dashed, line width=0.8pt]
    (734, {#3}) -- (796, {#5}) -- (796, {#6}) -- (734, {#4}) -- cycle;
  \FCBlock{#1-fc1}{752.5}{#2}{17}{48}{FC}
  \FCBlock{#1-fc2}{782.5}{#2}{17}{48}{FC}
  \draw[black, line width=1.1pt, ->] (761, {#2}) -- (774, {#2});
}

% --- [Macro Block 7] Gold Gating Operator Node (+ / x in Feature Fusion) ---
% Usage: \GateCircle{name}{cx}{cy}{r}{symbol}
\newcommand{\GateCircle}[5]{%
  \coordinate (#1) at ({#2}, {#3});
  \filldraw[fill=goldgate, draw=black!85, line width=0.75pt] ({#2}, {#3}) circle (#4);
  \node[text=white, font=\bfseries\sffamily\fontsize{7.5}{8.5}\selectfont, inner sep=0pt] at ({#2}, {#3}) {#5};
}

\begin{document}
\noindent\centering
\begin{tikzpicture}[
  x=0.25mm, y=-0.25mm,
  >={Triangle[length=4.2pt, width=4.0pt]},
  mainarrow/.style={draw=black, line width=1.05pt, ->},
  lblbold/.style={font=\bfseries\rmfamily\fontsize{7.5}{9}\selectfont},
  lblreg/.style={font=\rmfamily\fontsize{6.8}{8}\selectfont},
  mathlbl/.style={font=\bfseries\fontsize{7.8}{9}\selectfont}
]

\useasboundingbox (0,0) rectangle (1024,434);

% =========================================================================
% 1. FAR LEFT: Multi-Channel Raw EEG & Filter Bank (Bandpass Filters)
% =========================================================================
\node[lblbold] at (75, 110) {EEG};
\draw[axisblue, line width=0.85pt, <->] (29, 128) -- (29, 274) -- (124, 274);
\node[rotate=90, lblreg] at (21, 201) {Channels};
\node[lblreg] at (80, 283) {Time};
  \draw[black!75, line width=0.3pt] (33.0,135.4)--(36.5,132.1)--(40.0,133.9)--(43.4,134.2)--(46.9,135.5)--(50.4,133.5)--(53.9,131.8)--(57.4,136.1)--(60.8,134.6)--(64.3,132.9)--(67.8,133.5)--(71.3,133.9)--(74.8,136.2)--(78.2,132.7)--(81.7,132.3)--(85.2,135.9)--(88.7,134.2)--(92.2,133.8)--(95.6,132.7)--(99.1,134.3)--(102.6,136.4)--(106.1,132.1)--(109.6,133.1)--(113.0,135.2)--(116.5,134.4)--(120.0,134.2);
  \draw[black!50, line width=0.3pt] (33.0,140.4)--(36.5,140.5)--(40.0,141.7)--(43.4,142.3)--(46.9,142.6)--(50.4,139.0)--(53.9,141.8)--(57.4,143.6)--(60.8,140.5)--(64.3,141.0)--(67.8,140.8)--(71.3,143.1)--(74.8,142.3)--(78.2,138.8)--(81.7,142.4)--(85.2,142.7)--(88.7,141.2)--(92.2,140.8)--(95.6,140.3)--(99.1,143.9)--(102.6,141.5)--(106.1,139.3)--(109.6,142.5)--(113.0,142.1)--(116.5,142.1)--(120.0,140.1);
  \draw[black!50, line width=0.3pt] (33.0,147.2)--(36.5,149.1)--(40.0,149.2)--(43.4,150.6)--(46.9,147.9)--(50.4,147.2)--(53.9,151.4)--(57.4,149.1)--(60.8,148.0)--(64.3,148.4)--(67.8,149.3)--(71.3,151.1)--(74.8,147.1)--(78.2,148.0)--(81.7,150.9)--(85.2,149.0)--(88.7,148.7)--(92.2,147.5)--(95.6,149.9)--(99.1,151.0)--(102.6,146.7)--(106.1,148.7)--(109.6,150.1)--(113.0,149.5)--(116.5,148.9)--(120.0,146.9);
  \draw[black!75, line width=0.3pt] (33.0,155.8)--(36.5,156.7)--(40.0,157.5)--(43.4,157.1)--(46.9,153.9)--(50.4,157.5)--(53.9,158.2)--(57.4,155.4)--(60.8,156.0)--(64.3,155.9)--(67.8,158.4)--(71.3,156.6)--(74.8,154.0)--(78.2,157.9)--(81.7,157.4)--(85.2,156.2)--(88.7,155.6)--(92.2,155.7)--(95.6,159.1)--(99.1,155.8)--(102.6,154.6)--(106.1,157.7)--(109.6,157.0)--(113.0,157.0)--(116.5,154.8)--(120.0,156.2);
  \draw[black!50, line width=0.3pt] (33.0,164.2)--(36.5,164.4)--(40.0,165.5)--(43.4,162.3)--(46.9,162.9)--(50.4,166.5)--(53.9,163.6)--(57.4,163.2)--(60.8,163.4)--(64.3,164.7)--(67.8,165.8)--(71.3,161.6)--(74.8,163.7)--(78.2,165.8)--(81.7,163.8)--(85.2,163.7)--(88.7,162.5)--(92.2,165.5)--(95.6,165.4)--(99.1,161.5)--(102.6,164.2)--(106.1,164.9)--(109.6,164.5)--(113.0,163.5)--(116.5,162.1)--(120.0,166.2);
  \draw[black!50, line width=0.3pt] (33.0,171.7)--(36.5,172.8)--(40.0,171.6)--(43.4,169.0)--(46.9,173.1)--(50.4,172.6)--(53.9,170.3)--(57.4,171.1)--(60.8,170.9)--(64.3,175.7)--(67.8,167.7)--(71.3,170.1)--(74.8,173.3)--(78.2,172.0)--(81.7,171.2)--(85.2,170.4)--(88.7,171.2)--(92.2,174.1)--(95.6,170.1)--(99.1,170.1)--(102.6,172.8)--(106.1,171.9)--(109.6,171.9)--(113.0,169.5)--(116.5,171.9)--(120.0,173.9);
  \draw[black!75, line width=0.3pt] (33.0,179.6)--(36.5,180.3)--(40.0,176.8)--(43.4,178.6)--(46.9,181.4)--(50.4,178.2)--(53.9,178.3)--(57.4,178.4)--(60.8,180.1)--(64.3,180.3)--(67.8,176.4)--(71.3,179.3)--(74.8,180.6)--(78.2,178.7)--(81.7,178.5)--(85.2,177.6)--(88.7,181.0)--(92.2,179.7)--(95.6,176.5)--(99.1,179.7)--(102.6,179.8)--(106.1,179.5)--(109.6,178.1)--(113.0,177.5)--(116.5,181.6)--(120.0,178.9);
  \draw[black!50, line width=0.3pt] (33.0,187.9)--(36.5,185.9)--(40.0,184.3)--(43.4,188.6)--(46.9,187.1)--(50.4,185.4)--(53.9,186.0)--(57.4,186.4)--(60.8,188.7)--(64.3,185.2)--(67.8,184.9)--(71.3,188.5)--(74.8,186.7)--(78.2,186.2)--(81.7,185.2)--(85.2,186.8)--(88.7,188.8)--(92.2,184.6)--(95.6,185.7)--(99.1,187.7)--(102.6,186.9)--(106.1,186.7)--(109.6,184.4)--(113.0,187.6)--(116.5,188.4)--(120.0,184.5);
  \draw[black!50, line width=0.3pt] (33.0,195.0)--(36.5,191.5)--(40.0,194.3)--(43.4,196.1)--(46.9,192.9)--(50.4,193.5)--(53.9,193.4)--(57.4,195.5)--(60.8,194.7)--(64.3,191.3)--(67.8,195.0)--(71.3,195.2)--(74.8,193.6)--(78.2,193.3)--(81.7,192.9)--(85.2,196.3)--(88.7,194.0)--(92.2,191.7)--(95.6,195.0)--(99.1,194.6)--(102.6,194.5)--(106.1,192.7)--(109.6,193.0)--(113.0,196.7)--(116.5,193.3)--(120.0,192.6);
  \draw[black!75, line width=0.3pt] (33.0,200.3)--(36.5,199.8)--(40.0,203.9)--(43.4,201.5)--(46.9,200.5)--(50.4,201.0)--(53.9,201.8)--(57.4,203.5)--(60.8,199.6)--(64.3,200.5)--(67.8,203.5)--(71.3,201.4)--(74.8,201.2)--(78.2,200.1)--(81.7,202.4)--(85.2,203.4)--(88.7,199.2)--(92.2,201.2)--(95.6,202.6)--(99.1,201.9)--(102.6,201.3)--(106.1,199.4)--(109.6,203.2)--(113.0,202.8)--(116.5,199.4)--(120.0,201.5);
  \draw[black!50, line width=0.3pt] (33.0,206.4)--(36.5,210.0)--(40.0,210.7)--(43.4,207.8)--(46.9,208.6)--(50.4,208.5)--(53.9,210.9)--(57.4,209.0)--(60.8,206.5)--(64.3,210.5)--(67.8,209.9)--(71.3,208.6)--(74.8,208.1)--(78.2,208.3)--(81.7,211.5)--(85.2,208.2)--(88.7,207.1)--(92.2,210.2)--(95.6,209.5)--(99.1,209.5)--(102.6,207.3)--(106.1,208.7)--(109.6,211.6)--(113.0,207.7)--(116.5,207.9)--(120.0,209.5);
  \draw[black!50, line width=0.3pt] (33.0,215.4)--(36.5,219.0)--(40.0,216.1)--(43.4,215.6)--(46.9,216.0)--(50.4,217.2)--(53.9,218.2)--(57.4,214.1)--(60.8,216.2)--(64.3,218.4)--(67.8,216.2)--(71.3,216.1)--(74.8,215.1)--(78.2,217.6)--(81.7,220.1)--(85.2,211.8)--(88.7,217.1)--(92.2,217.5)--(95.6,216.9)--(99.1,216.0)--(102.6,214.7)--(106.1,218.7)--(109.6,217.1)--(113.0,214.5)--(116.5,216.8)--(120.0,216.9);
  \draw[black!75, line width=0.3pt] (33.0,225.7)--(36.5,225.1)--(40.0,222.7)--(43.4,223.6)--(46.9,223.7)--(50.4,226.1)--(53.9,223.3)--(57.4,221.8)--(60.8,225.8)--(64.3,224.5)--(67.8,223.6)--(71.3,222.9)--(74.8,223.8)--(78.2,226.5)--(81.7,222.6)--(85.2,222.6)--(88.7,225.3)--(92.2,224.4)--(95.6,224.3)--(99.1,222.1)--(102.6,224.4)--(106.1,226.3)--(109.6,222.3)--(113.0,223.4)--(116.5,224.5)--(120.0,224.9);
  \draw[black!50, line width=0.3pt] (33.0,233.9)--(36.5,230.7)--(40.0,230.8)--(43.4,230.9)--(46.9,232.6)--(50.4,232.8)--(53.9,228.9)--(57.4,231.9)--(60.8,233.1)--(64.3,231.1)--(67.8,231.0)--(71.3,230.2)--(74.8,233.5)--(78.2,232.2)--(81.7,229.0)--(85.2,232.2)--(88.7,232.3)--(92.2,232.0)--(95.6,230.6)--(99.1,230.1)--(102.6,234.1)--(106.1,231.4)--(109.6,229.7)--(113.0,231.9)--(116.5,231.9)--(120.0,232.8);
  \draw[black!50, line width=0.3pt] (33.0,239.6)--(36.5,237.8)--(40.0,238.6)--(43.4,239.0)--(46.9,241.1)--(50.4,237.6)--(53.9,237.4)--(57.4,241.0)--(60.8,239.1)--(64.3,238.7)--(67.8,237.8)--(71.3,239.3)--(74.8,241.3)--(78.2,237.0)--(81.7,238.2)--(85.2,240.3)--(88.7,239.3)--(92.2,239.1)--(95.6,237.0)--(99.1,240.1)--(102.6,240.9)--(106.1,237.0)--(109.6,238.7)--(113.0,239.4)--(116.5,240.1)--(120.0,238.9);
  \draw[black!75, line width=0.3pt] (33.0,245.4)--(36.5,246.0)--(40.0,246.0)--(43.4,248.0)--(46.9,247.2)--(50.4,243.8)--(53.9,247.5)--(57.4,247.8)--(60.8,246.0)--(64.3,245.9)--(67.8,245.5)--(71.3,248.8)--(74.8,246.4)--(78.2,244.2)--(81.7,247.6)--(85.2,247.1)--(88.7,247.0)--(92.2,245.2)--(95.6,245.6)--(99.1,249.2)--(102.6,245.7)--(106.1,245.0)--(109.6,247.0)--(113.0,247.1)--(116.5,247.6)--(120.0,244.3);
  \draw[black!50, line width=0.3pt] (33.0,252.9)--(36.5,253.6)--(40.0,254.3)--(43.4,256.0)--(46.9,252.0)--(50.4,253.0)--(53.9,256.0)--(57.4,253.9)--(60.8,253.7)--(64.3,252.7)--(67.8,254.9)--(71.3,255.9)--(74.8,251.6)--(78.2,253.8)--(81.7,255.2)--(85.2,254.3)--(88.7,254.1)--(92.2,249.5)--(95.6,259.4)--(99.1,254.3)--(102.6,251.9)--(106.1,254.1)--(109.6,254.4)--(113.0,255.2)--(116.5,253.3)--(120.0,251.9);
  \draw[black!50, line width=0.3pt] (33.0,261.1)--(36.5,261.1)--(40.0,263.3)--(43.4,261.5)--(46.9,259.0)--(50.4,263.0)--(53.9,262.4)--(57.4,261.0)--(60.8,260.7)--(64.3,260.8)--(67.8,264.0)--(71.3,260.7)--(74.8,259.6)--(78.2,262.8)--(81.7,262.0)--(85.2,261.9)--(88.7,259.9)--(92.2,261.2)--(95.6,264.1)--(99.1,260.2)--(102.6,260.4)--(106.1,262.1)--(109.6,262.2)--(113.0,262.3)--(116.5,259.1)--(120.0,262.0);

% Filter Bank Outer Rounded Box
\node[lblreg, align=center] at (175, 86) {Filter Bank\\[-1pt](bandpass filters)};
\draw[black, line width=0.95pt, rounded corners=8pt] (142, 97) rectangle (209, 346);

% 3 Filter Sub-Boxes inside Filter Bank (Filter 1, Filter 2, Filter H)
\foreach \lbl/\ya/\yb in {Filter 1/108/165, Filter 2/190/247, Filter H/280/338} {
  \node[lblreg] at (175.5, {\ya-4.5}) {\lbl};
  \draw[black!55, line width=0.6pt, rounded corners=5pt] (146, \ya) rectangle (205, \yb);
  \draw[axisblue, line width=0.7pt, ->] (138, {\yb}) -- (138, {\ya});
  \node[rotate=90, font=\rmfamily\fontsize{5.8}{6.8}\selectfont] at (131, {0.5*(\ya+\yb)}) {Channels};
}
\node[font=\bfseries\fontsize{7}{8}\selectfont] at (175.5, 139) {$\vdots$};
\node[font=\bfseries\fontsize{7}{8}\selectfont] at (175.5, 221) {$\vdots$};
\node[font=\bfseries\fontsize{8}{9}\selectfont] at (175.5, 260) {$\vdots$};
\node[font=\bfseries\fontsize{7}{8}\selectfont] at (175.5, 313) {$\vdots$};
  \draw[fbLightBlue, line width=0.35pt] (148.0,115.5)--(150.4,116.3)--(152.8,117.1)--(155.2,113.8)--(157.6,117.3)--(160.0,109.5)--(162.3,118.5)--(164.7,109.5)--(167.1,120.1)--(169.5,113.0)--(171.9,118.7)--(174.3,114.2)--(176.7,115.0)--(179.1,113.3)--(181.5,113.7)--(183.9,114.5)--(186.3,115.6)--(188.7,116.4)--(191.0,116.4)--(193.4,115.5)--(195.8,114.4)--(198.2,113.6)--(200.6,113.6)--(203.0,114.5);
  \draw[fbLightBlue, line width=0.35pt] (148.0,131.7)--(150.4,132.4)--(152.8,132.4)--(155.2,131.3)--(157.6,130.7)--(160.0,129.0)--(162.3,130.7)--(164.7,129.1)--(167.1,133.4)--(169.5,130.8)--(171.9,133.4)--(174.3,131.4)--(176.7,129.3)--(179.1,131.5)--(181.5,127.2)--(183.9,132.9)--(186.3,129.7)--(188.7,133.8)--(191.0,131.5)--(193.4,132.0)--(195.8,130.2)--(198.2,129.7)--(200.6,129.6)--(203.0,130.5);
  \draw[fbLightBlue, line width=0.35pt] (148.0,156.7)--(150.4,157.4)--(152.8,157.3)--(155.2,156.5)--(157.6,155.3)--(160.0,154.6)--(162.3,154.6)--(164.7,155.5)--(167.1,156.6)--(169.5,157.5)--(171.9,157.1)--(174.3,157.1)--(176.7,154.2)--(179.1,156.6)--(181.5,151.6)--(183.9,159.4)--(186.3,152.2)--(188.7,161.7)--(191.0,153.8)--(193.4,159.0)--(195.8,154.1)--(198.2,154.9)--(200.6,154.9)--(203.0,155.0);
  \draw[fbLightBlue, line width=0.35pt] (148.0,195.6)--(150.4,195.1)--(152.8,198.1)--(155.2,191.4)--(157.6,199.1)--(160.0,195.2)--(162.3,193.5)--(164.7,200.5)--(167.1,194.1)--(169.5,198.5)--(171.9,198.1)--(174.3,197.7)--(176.7,198.7)--(179.1,198.4)--(181.5,198.5)--(183.9,198.3)--(186.3,198.0)--(188.7,197.6)--(191.0,197.1)--(193.4,196.7)--(195.8,196.3)--(198.2,195.9)--(200.6,195.6)--(203.0,195.5);
  \draw[fbLightBlue, line width=0.35pt] (148.0,212.0)--(150.4,211.7)--(152.8,211.5)--(155.2,211.4)--(157.6,211.8)--(160.0,211.3)--(162.3,212.6)--(164.7,213.0)--(167.1,210.7)--(169.5,217.3)--(171.9,210.4)--(174.3,214.9)--(176.7,217.0)--(179.1,210.4)--(181.5,217.7)--(183.9,213.0)--(186.3,213.8)--(188.7,214.2)--(191.0,212.7)--(193.4,212.8)--(195.8,212.2)--(198.2,211.9)--(200.6,211.6)--(203.0,211.5);
  \draw[fbLightBlue, line width=0.35pt] (148.0,236.0)--(150.4,235.7)--(152.8,235.5)--(155.2,235.5)--(157.6,235.6)--(160.0,235.8)--(162.3,236.2)--(164.7,236.6)--(167.1,237.0)--(169.5,237.5)--(171.9,237.7)--(174.3,238.6)--(176.7,238.0)--(179.1,238.1)--(181.5,240.4)--(183.9,234.7)--(186.3,241.4)--(188.7,236.7)--(191.0,234.6)--(193.4,241.0)--(195.8,232.7)--(198.2,237.4)--(200.6,235.8)--(203.0,234.8);
  \draw[fbVividBlue, line width=0.45pt] (148.0,289.2)--(150.4,285.9)--(152.8,284.6)--(155.2,287.8)--(157.6,291.8)--(160.0,287.8)--(162.3,285.1)--(164.7,285.7)--(167.1,289.6)--(169.5,291.1)--(171.9,285.7)--(174.3,284.7)--(176.7,286.9)--(179.1,290.3)--(181.5,289.1)--(183.9,283.6)--(186.3,284.9)--(188.7,287.9)--(191.0,289.8)--(193.4,286.6)--(195.8,282.4)--(198.2,286.1)--(200.6,288.7)--(203.0,288.7);
  \draw[fbVividBlue, line width=0.45pt] (148.0,304.3)--(150.4,303.1)--(152.8,304.5)--(155.2,308.9)--(157.6,307.6)--(160.0,302.5)--(162.3,303.2)--(164.7,305.8)--(167.1,308.7)--(169.5,305.1)--(171.9,301.1)--(174.3,304.0)--(176.7,306.6)--(179.1,307.5)--(181.5,302.6)--(183.9,300.9)--(186.3,305.4)--(188.7,306.9)--(191.0,305.8)--(193.4,301.0)--(195.8,302.1)--(198.2,307.0)--(200.6,306.7)--(203.0,304.3);
  \draw[fbVividBlue, line width=0.45pt] (148.0,327.1)--(150.4,329.0)--(152.8,331.9)--(155.2,333.4)--(157.6,328.1)--(160.0,326.5)--(162.3,330.0)--(164.7,332.2)--(167.1,331.5)--(169.5,326.0)--(171.9,327.2)--(174.3,331.3)--(176.7,331.9)--(179.1,329.4)--(181.5,325.3)--(183.9,329.0)--(186.3,332.5)--(188.7,331.1)--(191.0,328.0)--(193.4,326.1)--(195.8,331.5)--(198.2,333.1)--(200.6,330.2)--(203.0,327.6);

% Vertical Sliding Time Window Dashed Columns (t_1 red, t_2 green, ..., t_n purple)
\draw[winRed, densely dashed, line width=0.7pt, rounded corners=2pt] (149, 102) rectangle (155, 342);
\draw[winGreen, densely dashed, line width=0.7pt, rounded corners=2pt] (157, 102) rectangle (163, 342);
\draw[winPurple, densely dashed, line width=0.7pt, rounded corners=2pt] (196, 102) rectangle (202, 342);

\draw[axisblue, line width=0.75pt, ->] (142, 351) -- (209, 351);
\node[font=\bfseries\fontsize{6.5}{7.5}\selectfont] at (151, 360) {$\mathbf{t_1}$};
\node[font=\bfseries\fontsize{6.5}{7.5}\selectfont] at (160, 360) {$\mathbf{t_2}$};
\node[font=\bfseries\fontsize{6.5}{7.5}\selectfont] at (178, 358) {$\cdots$};
\node[font=\bfseries\fontsize{6.5}{7.5}\selectfont] at (199, 360) {$\mathbf{t_n}$};
\node[font=\rmfamily\fontsize{5.8}{6.8}\selectfont] at (175, 369) {Time};

% Curved 3D Ribbon Arrows into Spatial & Temporal Streams
\node[lblbold] at (185, 39) {Spatial Info Stream};
\filldraw[fill=streamblue, draw=white, line width=0.4pt]
  (168, 74) -- (168, 58) .. controls (168, 50) and (173, 47) .. (182, 47)
  -- (212, 47) -- (212, 43) -- (222, 51.5) -- (212, 60) -- (212, 56)
  -- (183, 56) .. controls (179, 56) and (177, 58) .. (177, 62) -- (177, 74) -- cycle;

\filldraw[fill=streamblue, draw=white, line width=0.4pt]
  (174, 372) -- (174, 389) .. controls (174, 397) and (179, 400) .. (188, 400)
  -- (214, 400) -- (214, 404) -- (224, 395.5) -- (214, 387) -- (214, 391)
  -- (189, 391) .. controls (185, 391) and (183, 389) .. (183, 385) -- (183, 372) -- cycle;
\node[lblbold] at (185, 412) {Temporal Info Stream};


% =========================================================================
% 2. TOP STREAM: Spatial Info Stream (Riemannian Geometry Pipeline)
% =========================================================================
\draw[black, densely dashed, line width=0.9pt, rounded corners=16pt] (224, 34) rectangle (691, 199);

% Spatial Covariance Matrices Box
\node[lblreg, align=center] at (263, 45) {Spatial\\[-1pt]Covariance Matrices};
\draw[black, line width=0.9pt, rounded corners=6pt] (243, 55) rectangle (290, 189);
\draw[axisblue, line width=0.7pt, ->] (248, 184) -- (248, 60);
\node[rotate=90, font=\rmfamily\fontsize{6.2}{7.2}\selectfont] at (235, 122) {Filter Banks (1 to H)};

\CovMatrixIcon{250}{60}{36}{32}{1}
\CovMatrixIcon{250}{95}{36}{32}{1}
\node[font=\bfseries\fontsize{8}{9}\selectfont] at (268, 140) {$\vdots$};
\CovMatrixIcon{250}{153}{36}{32}{2}

% Riemannian Pipeline Blocks & Math Tensor Annotations
\draw[mainarrow] (290, 123) -- (341, 123);
\node[mathlbl] at (316, 113) {$\mathbf{C_i \in \mathbb{R}^{N\times N}}$};

\DarkVBlock{dim-red}{350}{122.5}{17}{134}{plumblock}{\rmfamily\fontsize{6.5}{7.5}\selectfont}{Dimensionality Reduction}

\draw[mainarrow] (358.5, 123) -- (406, 123);
\node[mathlbl] at (382, 113) {$\mathbf{C_i \in \mathbb{R}^{R\times R}}$};

\DarkVBlock{aff-inv}{414.5}{122.5}{17}{134}{plumblock}{\rmfamily\fontsize{6.5}{7.5}\selectfont}{Affine-Invariant Distance}

\draw[mainarrow] (423, 123) -- (468, 123);
\node[mathlbl] at (445.5, 113) {$\boldsymbol{\delta_R(\mathbf{C}, \mathbf{C_i})}$};

\DarkVBlock{choice-ref}{476.5}{123}{17}{133}{plumblock}{\rmfamily\fontsize{6.5}{7.5}\selectfont}{Choice of Reference}

\draw[mainarrow] (485, 123) -- (532.5, 123);
\node[mathlbl] at (509, 113) {$\mathbf{C_{ref} \in \mathcal{M}}$};

\DarkVBlock{tangent}{541}{123}{17}{134}{oliveblock}{\rmfamily\fontsize{6.5}{7.5}\selectfont}{Tangent Space Learning}

\draw[mainarrow] (549.5, 123) -- (592.5, 123);
\node[mathlbl] at (571, 113) {$\mathbf{T_{C_{ref}}\mathcal{M}}$};

\DarkVBlock{vector}{601}{122.5}{17}{133}{oliveblock}{\rmfamily\fontsize{6.5}{7.5}\selectfont}{Vectorization}

\draw[mainarrow] (609.5, 122.5) -- (629, 122.5);
\FCBlock{fc-top1}{637.5}{122.5}{17}{57}{FC (Dropout)}
\draw[mainarrow] (646, 122.5) -- (661, 122.5);
\FCBlock{fc-top2}{669.5}{122.5}{17}{57}{FC (Dropout)}

\node[mathlbl] at (720, 111) {$\mathbf{\mathbb{R}^{R\times (R+1)/2}}$};


% =========================================================================
% 3. BOTTOM STREAM: Temporal Info Stream (Topoplot Feature Maps + Stacked LSTM)
% =========================================================================
\draw[black, densely dashed, line width=0.9pt, rounded corners=18pt] (224, 205) rectangle (699, 417);

% Feature Maps Rounded Container
\node[lblreg] at (310, 213) {Feature Maps};
\draw[black, line width=0.9pt, rounded corners=12pt] (243, 219) rectangle (374, 396);
\draw[axisblue, line width=0.75pt, ->] (239, 396) -- (239, 224);
\node[rotate=90, font=\rmfamily\fontsize{6.2}{7.2}\selectfont] at (232, 300) {Time};
\draw[axisblue, line width=0.75pt, ->] (243, 402) -- (374, 402);
\node[font=\rmfamily\fontsize{6.2}{7.2}\selectfont] at (308, 410) {Filter Bank (1 to H)};

% 3 Row Dashed Frames inside Feature Maps (t_n purple, t_2 green, t_1 red)
\foreach \col/\yc/\lbl in {winPurple/243/t_n, winGreen/287/t_2, winRed/373/t_1} {
  \draw[\col, densely dashed, line width=0.75pt, rounded corners=5pt] (249, {\yc-16.5}) rectangle (368, {\yc+16.5});
  \TopoMapNode{265.5}{\yc}{14.5}{1}
  \TopoMapNode{298}{\yc}{14.5}{2}
  \node[font=\bfseries\fontsize{8}{9}\selectfont, text=axisblue] at (324, \yc) {$\cdots$};
  \TopoMapNode{350}{\yc}{14.5}{3}
  \node[font=\bfseries\fontsize{6.8}{8}\selectfont] at (382, \yc) {$\mathbf{\lbl}$};
}
\node[font=\bfseries\fontsize{9}{10}\selectfont] at (310, 330) {$\vdots$};

% 3 Unrolled Stacked LSTM Columns + 3 Normalization Bars
\LSTMColumn{lstm1}{396}{423}
\DarkVBlock{norm1}{431.5}{308.5}{17}{163}{slateblock}{\rmfamily\fontsize{6.0}{7.0}\selectfont}{Normalization + LeakyReLU or Dropout}
\draw[mainarrow] (440, 242.5) -- (458.5, 242.5);
\draw[mainarrow] (440, 284.5) -- (458.5, 284.5);
\draw[mainarrow] (440, 374.5) -- (458.5, 374.5);

\LSTMColumn{lstm2}{466}{493}
\DarkVBlock{norm2}{501.5}{308.5}{17}{163}{slateblock}{\rmfamily\fontsize{6.0}{7.0}\selectfont}{Normalization + LeakyReLU or Dropout}
\draw[mainarrow] (510, 242.5) -- (528.5, 242.5);
\draw[mainarrow] (510, 284.5) -- (528.5, 284.5);
\draw[mainarrow] (510, 374.5) -- (528.5, 374.5);

\LSTMColumn{lstm3}{536}{563}
\DarkVBlock{norm3}{571.5}{308.5}{17}{163}{slateblock}{\rmfamily\fontsize{6.0}{7.0}\selectfont}{Normalization + LeakyReLU or Dropout}

% Fan-in Arrows from Norm3 into Bottom Attention -> FC
\draw[mainarrow] (580, 242.5) -- (621.5, 304);
\draw[mainarrow] (580, 284.5) -- (621.5, 307.5);
\node[font=\bfseries\fontsize{8}{9}\selectfont] at (594, 332) {$\cdots$};
\draw[mainarrow] (580, 374.5) -- (621.5, 311);

\DarkVBlock{attn-bot}{630}{307.5}{17}{57}{slateblock}{\rmfamily\fontsize{6.2}{7.2}\selectfont}{Attention}
\draw[mainarrow] (638.5, 307.5) -- (661.5, 307.5);
\FCBlock{fc-bot}{670}{307.5}{17}{42}{FC}


% =========================================================================
% 4. RIGHT: Feature Fusion & Decision Making
% =========================================================================
\node[lblbold] at (824, 104) {Feature Fusion};
\draw[black, densely dashed, line width=0.9pt, rounded corners=16pt] (722, 114) rectangle (928, 318);

% Spatial Info Encoder & Temporal Info Encoder Trapezoids
\node[font=\rmfamily\fontsize{6.0}{7.0}\selectfont] at (806, 134) {Spatial Info Encoder};
\TrapezoidEncoder{fus-top}{171}{134}{207}{148}{193}

\node[font=\rmfamily\fontsize{6.0}{7.0}\selectfont] at (810, 302) {Temporal Info Encoder};
\TrapezoidEncoder{fus-bot}{261}{225}{298}{239}{284}

% Routing from Spatial Stream (y=122.5) into Top Bypass & Spatial Info Encoder
\draw[black, line width=1.05pt] (678, 122.5) -- (901.5, 122.5);
\draw[mainarrow] (901.5, 122.5) -- (901.5, 171.5);
\draw[mainarrow] (708, 122.5) -- (708, 171) -- (744, 171);

% Routing from Temporal Stream (y=307.5) into Bottom Bypass & Temporal Info Encoder
\draw[black, line width=1.05pt] (678.5, 307.5) -- (901.5, 307.5);
\draw[mainarrow] (901.5, 307.5) -- (901.5, 262.5);
\draw[mainarrow] (708, 307.5) -- (708, 261) -- (744, 261);

% Outputs of Spatial/Temporal Encoders merging into Fusion Attention
\draw[black, line width=1.05pt] (791, 171) -- (808, 171) -- (808, 261) -- (791, 261);
\draw[mainarrow] (808, 214.5) -- (822.5, 214.5);

\DarkVBlock{attn-fus}{831}{214.5}{17}{57}{slateblock}{\rmfamily\fontsize{6.2}{7.2}\selectfont}{Attention}

% Gating Structure: Attention -> (+, 1, +) -> (x, x)
\draw[black, line width=1.05pt] (839.5, 214.5) -- (850, 214.5);
\draw[mainarrow] (850, 214.5) -- (850, 181.5) -- (861, 181.5);
\draw[mainarrow] (850, 214.5) -- (850, 253.5) -- (861, 253.5);

% "1" Box and Vertical Arrows to Top/Bottom (+) Nodes
\filldraw[fill=slateblock, draw=black!85, line width=0.75pt, rounded corners=2pt] (863.5, 206) rectangle (877.5, 223);
\node[text=white, font=\bfseries\sffamily\fontsize{6.5}{7.5}\selectfont] at (870.5, 214.5) {1};
\draw[mainarrow] (870.5, 206) -- (870.5, 190);
\draw[mainarrow] (870.5, 223) -- (870.5, 245);

\GateCircle{plus-top}{870.5}{181.5}{8.2}{+}
\GateCircle{mul-top}{901.5}{181.5}{8.2}{x}
\draw[mainarrow] (878.7, 181.5) -- (893.3, 181.5);

\GateCircle{plus-bot}{870.5}{253.5}{8.2}{+}
\GateCircle{mul-bot}{901.5}{253.5}{8.2}{x}
\draw[mainarrow] (878.7, 253.5) -- (893.3, 253.5);

% Merge after Top/Bottom (x) Nodes into Decision Making
\draw[black, line width=1.05pt] (909.7, 181.5) -- (923, 181.5) -- (923, 253.5) -- (909.7, 253.5);

% Decision Making Container
\node[lblbold] at (966, 104) {Decision Making};
\draw[black, densely dashed, line width=0.9pt, rounded corners=8pt] (936, 114) rectangle (998, 318);

\draw[mainarrow] (923, 221.5) -- (945, 221.5);
\FCBlock{fc-dec}{953.5}{221.5}{17}{42}{FC}
\draw[mainarrow] (962, 221.5) -- (974.5, 221.5);

\fill[outred] (983, 221.5) circle (7.8);
\node[lblbold] at (981, 202) {output};

\end{tikzpicture}
\end{document}

```
