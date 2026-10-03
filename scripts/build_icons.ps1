Add-Type -AssemblyName System.Drawing

function RenderTarget($srcPath, $outPath, $targetWidth, $targetHeight, $padRatio = 0.90) {
    $src = [System.Drawing.Bitmap]::FromFile($srcPath)
    
    # Find bounding box of non-alpha pixels
    $minX = $src.Width; $minY = $src.Height; $maxX = 0; $maxY = 0
    for ($y = 0; $y -lt $src.Height; $y += 2) {
        for ($x = 0; $x -lt $src.Width; $x += 2) {
            $p = $src.GetPixel($x, $y)
            if ($p.A -gt 15) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    
    # Exact bounding box
    $cropW = [Math]::Max(1, $maxX - $minX + 1)
    $cropH = [Math]::Max(1, $maxY - $minY + 1)
    
    $srcRect = New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH
    $cropped = New-Object System.Drawing.Bitmap $cropW, $cropH
    $cropped.SetResolution(96.0, 96.0)
    $gCrop = [System.Drawing.Graphics]::FromImage($cropped)
    $gCrop.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gCrop.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gCrop.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $dstCrop = New-Object System.Drawing.Rectangle 0, 0, $cropW, $cropH
    $gCrop.DrawImage($src, $dstCrop, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $gCrop.Dispose()
    $src.Dispose()
    
    # Create target bitmap
    $target = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
    $target.SetResolution(96.0, 96.0)
    $gTarget = [System.Drawing.Graphics]::FromImage($target)
    $gTarget.Clear([System.Drawing.Color]::Transparent)
    $gTarget.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gTarget.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gTarget.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $maxDrawW = $targetWidth * $padRatio
    $maxDrawH = $targetHeight * $padRatio
    $scale = [Math]::Min($maxDrawW / $cropW, $maxDrawH / $cropH)
    $drawW = [int]($cropW * $scale)
    $drawH = [int]($cropH * $scale)
    $drawX = [int](($targetWidth - $drawW) / 2)
    $drawY = [int](($targetHeight - $drawH) / 2)
    
    $dstDraw = New-Object System.Drawing.Rectangle $drawX, $drawY, $drawW, $drawH
    $srcDraw = New-Object System.Drawing.Rectangle 0, 0, $cropW, $cropH
    $gTarget.DrawImage($cropped, $dstDraw, $srcDraw, [System.Drawing.GraphicsUnit]::Pixel)
    
    $gTarget.Dispose()
    $cropped.Dispose()
    
    $dir = [System.IO.Path]::GetDirectoryName($outPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    
    $target.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
    Write-Host "Success: $outPath ($targetWidth x $targetHeight)"
}

$source = "C:\Users\hp\Desktop\OfficeAirdrop\public\grabcut_logo_mark.png"

# AppX Store Tiles (These replace the Electron Atom tiles)
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\build\appx\StoreLogo.png" 50 50 0.95
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\build\appx\Square44x44Logo.png" 44 44 0.95
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\build\appx\Square150x150Logo.png" 150 150 0.90
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\build\appx\Square310x310Logo.png" 310 310 0.90
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\build\appx\Wide310x150Logo.png" 310 150 0.80
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\build\appx\SplashScreen.png" 620 300 0.60

# Master 512x512 PNGs
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\build\icon.png" 512 512 0.95
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\public\icon.png" 512 512 0.95
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\electron\icon.png" 512 512 0.95
RenderTarget $source "C:\Users\hp\Desktop\OfficeAirdrop\dist\icon.png" 512 512 0.95

# Multi-layer ICO raw sizes
$layersDir = "C:\Users\hp\Desktop\OfficeAirdrop\scratch_ico_layers"
New-Item -ItemType Directory -Force -Path $layersDir | Out-Null
@(16, 24, 32, 48, 64, 128, 256) | ForEach-Object {
    RenderTarget $source "$layersDir\icon_$_.png" $_ $_ 0.95
}
