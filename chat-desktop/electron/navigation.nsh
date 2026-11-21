!macro customInstall
  WriteRegStr SHCTX "Software\Classes\taskchat-desktop" "" "URL:TaskChat desktop navigation"
  WriteRegStr SHCTX "Software\Classes\taskchat-desktop" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\taskchat-desktop\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" -- $\"%1$\"'
!macroend

!macro customUnInstall
  ReadRegStr $0 SHCTX "Software\Classes\taskchat-desktop\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" -- $\"%1$\"' 0 +2
  DeleteRegKey SHCTX "Software\Classes\taskchat-desktop"
!macroend
