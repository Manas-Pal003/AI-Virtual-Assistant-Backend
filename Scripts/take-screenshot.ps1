param (
    [string]$SavePath
)

try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $width = $screen.Width
    $height = $screen.Height
    $left = $screen.Left
    $top = $screen.Top

    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphic = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphic.CopyFromScreen($left, $top, 0, 0, $bitmap.Size)
    $bitmap.Save($SavePath)
    $graphic.Dispose()
    $bitmap.Dispose()

    Write-Host "Screenshot saved successfully to: $SavePath"
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
