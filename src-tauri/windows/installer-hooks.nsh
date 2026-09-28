; Optional default PDF handler during install. File icons use pdf-document.ico, not the app logo.

Var PdeffyDefaultPdfCheckbox
Var PdeffyDefaultPdfCheckboxState

!define PDEFFY_PDF_PROGID "Pdeffy.Pdf"
!define /ifndef WS_EX_LAYOUTRTL 0x00400000

!define MUI_PAGE_CUSTOMFUNCTION_SHOW PdeffyFinishShow
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE PdeffyFinishLeave

Function PdeffyFinishShow
  FindWindow $0 "#32770" "" $HWNDPARENT
  System::Call "user32::GetDpiForWindow(p r0) i .r1"
  ${If} $(^RTL) = 1
    StrCpy $2 "${__NSD_CheckBox_EXSTYLE} | ${WS_EX_LAYOUTRTL}"
    IntOp $3 50 * $1
  ${Else}
    StrCpy $2 "${__NSD_CheckBox_EXSTYLE}"
    IntOp $3 0 * $1
  ${EndIf}
  IntOp $4 120 * $1
  IntOp $5 400 * $1
  IntOp $6 120 * $1
  IntOp $3 $3 / 96
  IntOp $4 $4 / 96
  IntOp $5 $5 / 96
  IntOp $6 $6 / 96
  System::Call 'user32::CreateWindowEx(i r2, w "${__NSD_CheckBox_CLASS}", w "Open PDF files with Pdeffy by default (PDF file icons stay unchanged)", i ${__NSD_CheckBox_STYLE}, i r3, i r4, i r5, i r6, p r0, i0, i0, i0) i .s'
  Pop $PdeffyDefaultPdfCheckbox
  SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $0
  SendMessage $PdeffyDefaultPdfCheckbox ${WM_SETFONT} $0 1
  ; Opt-in: leave unchecked by default
FunctionEnd

Function PdeffyFinishLeave
  SendMessage $PdeffyDefaultPdfCheckbox ${BM_GETCHECK} 0 0 $PdeffyDefaultPdfCheckboxState
  ${If} $PdeffyDefaultPdfCheckboxState = 1
    Call PdeffySetDefaultPdfHandler
  ${EndIf}
FunctionEnd

Function PdeffyRegisterPdfHandler
  ; ProgID + open command; icon = generic PDF document (not Pdeffy.exe)
  WriteRegStr SHCTX "Software\Classes\${PDEFFY_PDF_PROGID}" "" "PDF Document"
  WriteRegStr SHCTX "Software\Classes\${PDEFFY_PDF_PROGID}\DefaultIcon" "" "$INSTDIR\resources\pdf-document.ico"
  WriteRegStr SHCTX "Software\Classes\${PDEFFY_PDF_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.pdf\OpenWithProgids" "${PDEFFY_PDF_PROGID}" ""
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
FunctionEnd

Function PdeffySetDefaultPdfHandler
  Call PdeffyRegisterPdfHandler
  WriteRegStr SHCTX "Software\Classes\.pdf" "" "${PDEFFY_PDF_PROGID}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  Call PdeffyRegisterPdfHandler
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Call un.PdeffyUnregisterPdfHandler
!macroend

Function un.PdeffyUnregisterPdfHandler
  DeleteRegKey SHCTX "Software\Classes\${PDEFFY_PDF_PROGID}"
  DeleteRegValue SHCTX "Software\Classes\.pdf\OpenWithProgids" "${PDEFFY_PDF_PROGID}"
  ReadRegStr $0 SHCTX "Software\Classes\.pdf" ""
  ${If} $0 == "${PDEFFY_PDF_PROGID}"
    DeleteRegKey SHCTX "Software\Classes\.pdf"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
FunctionEnd
