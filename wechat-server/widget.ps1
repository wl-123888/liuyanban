Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$wv2Dll = $null
$searchRoots = @(
    "$env:ProgramFiles\Microsoft\EdgeWebView\Application",
    "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application",
    "${env:ProgramFiles(x86)}\HnAppStore"
)
foreach ($root in $searchRoots) {
    if (-not (Test-Path $root)) { continue }
    $dll = Get-ChildItem $root -Recurse -Filter 'Microsoft.Web.WebView2.WinForms.dll' -ErrorAction SilentlyContinue |
           Where-Object { $_.FullName -notmatch 'SetupMetrics' } | Select-Object -First 1
    if ($dll) { $wv2Dll = $dll.FullName; break }
}
if (-not $wv2Dll) {
    $localDll = Join-Path $scriptDir 'Microsoft.Web.WebView2.WinForms.dll'
    if (Test-Path $localDll) { $wv2Dll = $localDll }
}
if (-not $wv2Dll) { exit 0 }
Add-Type -Path $wv2Dll

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
[int]$widgetW = 320
[int]$widgetH = 440
[int]$posX = $screen.WorkingArea.Width - $widgetW - 16
[int]$posY = $screen.WorkingArea.Height - $widgetH - 50
[int]$closeX = $widgetW - 30

$form = New-Object System.Windows.Forms.Form
$form.Text = 'ParentBoard'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.ShowInTaskbar = $false
$form.Width = $widgetW
$form.Height = $widgetH
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Location = New-Object System.Drawing.Point($posX, $posY)
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 26)
$form.TopMost = $false
$form.ShowIcon = $false

$form.Add_Shown({
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    [int]$r = 20
    $path.AddArc(0, 0, $r*2, $r*2, 180, 90)
    $path.AddArc($form.Width - ($r*2), 0, $r*2, $r*2, 270, 90)
    $path.AddArc($form.Width - ($r*2), $form.Height - ($r*2), $r*2, $r*2, 0, 90)
    $path.AddArc(0, $form.Height - ($r*2), $r*2, $r*2, 90, 90)
    $path.CloseFigure()
    $form.Region = New-Object System.Drawing.Region($path)
})

$titleBar = New-Object System.Windows.Forms.Panel
$titleBar.Height = 28
$titleBar.Dock = [System.Windows.Forms.DockStyle]::Top
$titleBar.BackColor = [System.Drawing.Color]::FromArgb(24, 24, 34)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = ''
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)
$titleLabel.Location = New-Object System.Drawing.Point(12, 6)
$titleLabel.AutoSize = $true
$titleBar.Controls.Add($titleLabel)

$closeBtn = New-Object System.Windows.Forms.Label
$closeBtn.Text = 'X'
$closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 170)
$closeBtn.Location = New-Object System.Drawing.Point($closeX, 4)
$closeBtn.Size = New-Object System.Drawing.Size(24, 22)
$closeBtn.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$closeBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$closeBtn.Add_Click({ $form.Close() })
$closeBtn.Add_MouseEnter({ $closeBtn.ForeColor = [System.Drawing.Color]::White })
$closeBtn.Add_MouseLeave({ $closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 170) })
$titleBar.Controls.Add($closeBtn)

$form.Controls.Add($titleBar)

$titleMenu = New-Object System.Windows.Forms.ContextMenuStrip
$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem('Exit')
$exitItem.Add_Click({ $form.Close() })
$titleMenu.Items.Add($exitItem)
$titleBar.ContextMenuStrip = $titleMenu

$wv = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$wv.Dock = [System.Windows.Forms.DockStyle]::Fill
$wv.CreationProperties = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties
$wv.CreationProperties.set_UserDataFolder((Join-Path $env:TEMP 'ParentBoardWV2'))
$form.Controls.Add($wv)

$URL = 'http://localhost:58080/display'
$wv.Source = New-Object System.Uri($URL)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$script:attempts = 0
$timer.Add_Tick({
    $script:attempts++
    try {
        if ($wv.CoreWebView2) {
            $current = $wv.CoreWebView2.Source
            if ($current -notmatch 'localhost') {
                $wv.CoreWebView2.Navigate($URL)
            } else {
                $timer.Stop(); $timer.Dispose()
            }
        }
    } catch {}
    if ($script:attempts -gt 30) {
        $timer.Stop(); $timer.Dispose()
        Start-Process $URL
        $form.Close()
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run($form)
if ($wv) { $wv.Dispose() }
$form.Dispose()
