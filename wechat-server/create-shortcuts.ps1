$installDir = "$env:USERPROFILE\家长留言板"
$linkName = "家长留言板"
$wsh = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$startup = [Environment]::GetFolderPath("Startup")

$sc = $wsh.CreateShortcut("$desktop\$linkName.lnk")
$sc.TargetPath = "$installDir\启动.vbs"
$sc.WorkingDirectory = $installDir
$sc.Save()

$sc2 = $wsh.CreateShortcut("$startup\$linkName.lnk")
$sc2.TargetPath = "$installDir\启动.vbs"
$sc2.WorkingDirectory = $installDir
$sc2.Save()

Write-Host "OK: Desktop shortcut + Startup shortcut created"
