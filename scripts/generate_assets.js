const fs = require('fs');
const path = require('path');

// We can use a pure JS PNG parser/encoder or PowerShell System.Drawing to do high quality rendering
// Let's create a PowerShell script to crop and render all icons cleanly with System.Drawing
const psScript = `
Add-Type -AssemblyName System.Drawing

function CropAndCenter($srcPath, $outPath, $targetWidth, $targetHeight, $padRatio = 0.85) {
    $src = [System.Drawing.Bitmap]::FromFile($srcPath)
    
    # Find bounding box of non-alpha pixels
    $minX = $src.Width; $minY = $src.Height; $maxX = 0; $maxY = 0
    for ($y = 0; $y -lt $src.Height; $y++) {
        for ($x = 0; $x -lt $src.Width; $x++) {
            $p = $src.GetPixel($x, $y)
            if ($p.A -gt 10) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    
    $cropW = [Math]::Max(1, $maxX - $minX + 1)
    $cropH = [Math]::Max(1, $maxY - $minY + 1)
    
    # Create cropped bitmap
    $cropRect = New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH
    $cropped = New-Object System.Drawing.Bitmap $cropW, $cropH
    $gCrop = [System.Drawing.Graphics]::FromImage($cropped)
    $gCrop.DrawImage($src, 0, 0, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
    $gCrop.Dispose()
    $src.Dispose()
    
    # Create target canvas
    $target = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
    $gTarget = [System.Drawing.Graphics]::FromImage($target)
    $gTarget.Clear([System.Drawing.Color]::Transparent)
    $gTarget.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gTarget.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gTarget.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    # Calculate scaled dimensions
    $maxDrawW = $targetWidth * $padRatio
    $maxDrawH = $targetHeight * $padRatio
    $scale = [Math]::Min($maxDrawW / $cropW, $maxDrawH / $cropH)
    $drawW = [int]($cropW * $scale)
    $drawH = [int]($cropH * $scale)
    $drawX = [int](($targetWidth - $drawW) / 2)
    $drawY = [int](($targetHeight - $drawH) / 2)
    
    $gTarget.DrawImage($cropped, $drawX, $drawY, $drawW, $drawH)
    $gTarget.Dispose()
    $cropped.Dispose()
    
    $dir = [System.IO.Path]::GetDirectoryName($outPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    
    $target.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
    Write-Host "Generated: $outPath ($targetWidth x $targetHeight)"
}

$source = "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\public\\grabcut_logo_mark.png"
if (-not (Test-Path $source)) {
    $source = "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\public\\icon.png"
}

# 1. Generate AppX store tile assets (Microsoft Store requirement)
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\build\\appx\\StoreLogo.png" 50 50 0.95
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\build\\appx\\Square44x44Logo.png" 44 44 0.95
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\build\\appx\\Square150x150Logo.png" 150 150 0.90
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\build\\appx\\Square310x310Logo.png" 310 310 0.90
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\build\\appx\\Wide310x150Logo.png" 310 150 0.80
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\build\\appx\\SplashScreen.png" 620 300 0.60

# 2. Generate clean centered 512x512 icons for build and public
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\build\\icon.png" 512 512 0.95
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\public\\icon.png" 512 512 0.95
CropAndCenter $source "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\electron\\icon.png" 512 512 0.95

# 3. Generate individual PNG sizes for multi-layer ICO
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$tempDir = "C:\\Users\\hp\\Desktop\\OfficeAirdrop\\scratch_ico_layers"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
foreach ($s in $sizes) {
    CropAndCenter $source "$tempDir\\icon_$s.png" $s $s 0.95
}
`;

fs.writeFileSync(path.join(__dirname, 'generate_assets.ps1'), psScript);
console.log('Saved generate_assets.ps1');
