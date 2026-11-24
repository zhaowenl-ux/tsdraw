; TSDraw Windows installer (NSIS 3). Built by desktop/build-desktop.sh:
;   makensis -DVERSION=0.20 -DSRC=<folder with TSDraw.exe, tsdraw.ico, LICENSE.txt> -DOUT=<setup.exe> installer.nsi
; Installs for the current user only (no administrator rights): %LOCALAPPDATA%\Programs\TSDraw,
; a Start menu shortcut, an optional desktop shortcut, and an entry in Settings › Apps for uninstalling.

Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0"
!endif
!define APP "TSDraw"
!define PUBLISHER "Zhaowen Luo"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\TSDraw"

Name "${APP} ${VERSION}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\${APP}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APP} ${VERSION}"

VIProductVersion "${VERSION}.0.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} chemical structure drawing - installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright (c) ${PUBLISHER}. GPL-2.0-only"

!define MUI_ICON "${SRC}\tsdraw.ico"
!define MUI_UNICON "${SRC}\tsdraw.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\TSDraw.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Start TSDraw now"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${SRC}\LICENSE.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "TSDraw (required)" SecMain
  SectionIn RO
  ; A running copy keeps TSDraw.exe locked: stop it first.
  nsExec::Exec 'taskkill /IM TSDraw.exe /F'
  Sleep 500
  SetOutPath "$INSTDIR"
  File "${SRC}\TSDraw.exe"
  File "${SRC}\tsdraw.ico"
  File "${SRC}\LICENSE.txt"
  File "${SRC}\README.txt"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP}"
  ; The launcher's console window starts minimised; the app opens in its own window.
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\TSDraw.exe" "" "$INSTDIR\tsdraw.ico" 0 SW_SHOWMINIMIZED
  CreateShortcut "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\${APP}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\tsdraw.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "URLInfoAbout" "https://github.com/zhaowenl-ux/tsdraw"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\TSDraw.exe" "" "$INSTDIR\tsdraw.ico" 0 SW_SHOWMINIMIZED
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "The TSDraw program and a Start menu shortcut."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "A TSDraw shortcut on the desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  nsExec::Exec 'taskkill /IM TSDraw.exe /F'
  Sleep 500
  Delete "$INSTDIR\TSDraw.exe"
  Delete "$INSTDIR\tsdraw.ico"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APP}\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk"
  RMDir "$SMPROGRAMS\${APP}"
  Delete "$DESKTOP\${APP}.lnk"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP}"
SectionEnd
