' Starts the Iris Wi-Fi alert with no window. It waits quietly at
' http://localhost:8091 and touches the hotspot only when Broadcast is pressed.
' install-startup.ps1 runs this at every login; double-click it to start now.
' Output goes to wifi_alert.log in this folder.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
pythonw = here & "\.venv\Scripts\pythonw.exe"

If Not fso.FileExists(pythonw) Then
  MsgBox "Set up the Wi-Fi alert first (see README.md):" & vbCrLf & vbCrLf & _
         "python -m venv .venv" & vbCrLf & _
         ".venv\Scripts\python -m pip install -r requirements.txt", vbExclamation, "Iris Wi-Fi alert"
  WScript.Quit 1
End If

' Live mode reads warnings from this backend; drill mode (the default) needs no network.
api = "https://ai-manthan.onrender.com"

shell.CurrentDirectory = here
shell.Run """" & pythonw & """ wifi_alert.py --api " & api, 0, False
