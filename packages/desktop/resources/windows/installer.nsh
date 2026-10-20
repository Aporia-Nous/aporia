!macro customInstall
  ; Chromium's sandbox needs read/execute access to the installed runtime files.
  ; https://github.com/electron/electron/issues/49143#issuecomment-3618354787
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*S-1-15-2-2:(OI)(CI)(RX)"'
  Pop $0
!macroend

!macro customInit
  ; Install under the product name (per channel: "Aporetic", "Aporetic Dev", "Aporetic Beta") instead
  ; of the npm package name ("@opencodedesktop"). Otherwise dev and prod installers share one folder
  ; and overwrite each other, and the path reads as an internal package id.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
!macroend
