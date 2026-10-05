; Make uninstall reliable when ResumeKit is still running.
; Electron keeps several child processes alive, so removing the install
; directory can otherwise fail after choosing a custom installation path.
!macro customInstall
  ; Keep the selected path discoverable by Windows Apps & features.
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "ResumeKit.exe"'
!macroend
