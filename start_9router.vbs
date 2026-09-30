Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

objShell.CurrentDirectory = strPath 


objShell.Run "cmd /c pnpm start", 0, false

WScript.Sleep 3000

objShell.Run "http://localhost:20127"