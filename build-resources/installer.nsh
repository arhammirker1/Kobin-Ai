; build-resources/installer.nsh
; Custom NSIS installer script
; This runs during Windows installation

!macro customHeader
  ; Custom header code
!macroend

!macro customInit
  ; Runs before install starts
!macroend

!macro customInstall
  ; Runs after install completes
  ; Create registry entry for Add/Remove Programs
  WriteRegStr HKCU "Software\CommandCenter" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\CommandCenter" "Version" "${VERSION}"
!macroend

!macro customUnInstall
  ; Runs during uninstall
  DeleteRegKey HKCU "Software\CommandCenter"
!macroend
