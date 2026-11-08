; Update/reinstall can skip the old uninstaller. Remove only the known legacy
; adapter dependency tree after the new compact bundles were copied successfully.
!macro NSIS_HOOK_POSTINSTALL
  ${If} $INSTDIR != ""
  ${AndIf} ${FileExists} "$INSTDIR\adapters\manifest.json"
  ${AndIf} ${FileExists} "$INSTDIR\adapters\claude-code\index.mjs"
  ${AndIf} ${FileExists} "$INSTDIR\adapters\codex-cli\index.mjs"
  ${AndIf} ${FileExists} "$INSTDIR\adapters\node_modules\@agentclientprotocol\claude-agent-acp\package.json"
  ${AndIf} ${FileExists} "$INSTDIR\adapters\node_modules\@agentclientprotocol\codex-acp\package.json"
    Push $0
    Push $1
    ; Resolve the exact child before recursive removal; never delete $INSTDIR
    ; itself or follow a junction used as the legacy tree or adapters directory.
    GetFullPathName $1 "$INSTDIR\adapters\node_modules"
    ${If} $1 == "$INSTDIR\adapters\node_modules"
      System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\adapters") i .r0'
      IntOp $0 $0 & 0x400
      ${If} $0 = 0
        System::Call 'kernel32::GetFileAttributesW(w "$1") i .r0'
        IntOp $0 $0 & 0x400
        ${If} $0 = 0
          DetailPrint "Removing legacy ACP adapter node_modules"
          RMDir /r "$1"
        ${EndIf}
      ${EndIf}
    ${EndIf}
    Pop $1
    Pop $0
  ${EndIf}
!macroend
