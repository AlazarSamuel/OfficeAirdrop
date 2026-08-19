import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const ffmpegPath = app.isPackaged
  ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
  : path.join(app.getAppPath(), 'bin', 'ffmpeg.exe')

/**
 * Creates a slideshow from an array of images.
 * @param {string[]} images - Array of absolute file paths to images.
 * @param {number} duration - Duration in seconds per slide.
 * @param {string} outputDir - Directory to save the MP4.
 * @param {function} onProgress - Callback for progress updates.
 * @param {function} onComplete - Callback when done (returns output path).
 * @param {function} onError - Callback for errors.
 */
function createSlideshow(images, duration, outputDir, onProgress, onComplete, onError) {
  if (!images || images.length === 0) {
    onError('No images provided.')
    return
  }

  const id = Date.now().toString()
  const tempDir = app.getPath('temp')
  const scriptFile = path.join(tempDir, `filter_${id}.txt`)
  const finalDest = path.join(outputDir, `Slideshow_${id}.mp4`)

  try {
    const fps = 25
    const slideDuration = duration // e.g. 3
    const fadeDuration = 0.5
    const framesPerSlide = Math.floor(slideDuration * fps)

    let filterComplex = ''
    let args = ['-y']

    // Add inputs
    images.forEach(img => {
      args.push('-i', img)
    })

    // Build filter graph
    let previousOutput = ''
    
    images.forEach((_, i) => {
      // 1. Process each image into 1920x1080 composite, then scale to 2x (3840x2160) to fix zoompan integer shaking without killing the CPU
      filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease[fg${i}];\n`
      filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=increase,boxblur=40:40,crop=1920:1080[bg${i}];\n`
      filterComplex += `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,scale=3840:2160[comp${i}];\n`
      
      // 2. Apply Ken Burns zoom/pan (generates framesPerSlide frames)
      // Alternate between zooming in and zooming out
      const isZoomIn = i % 2 === 0
      const zExpr = isZoomIn 
        ? `if(eq(on,1),1.0,zoom+0.0015)`
        : `if(eq(on,1),1.15,zoom-0.0015)`
      
      filterComplex += `[comp${i}]zoompan=z='${zExpr}':d=${framesPerSlide}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${fps}[out${i}];\n`

      // 3. Chain xfade transitions
      if (i === 0) {
        previousOutput = `[out0]`
      } else {
        const offset = i * (slideDuration - fadeDuration)
        const currentOut = `[out${i}]`
        const nextOutput = i === images.length - 1 ? `[final]` : `[x${i}]`
        
        filterComplex += `${previousOutput}${currentOut}xfade=transition=fade:duration=${fadeDuration}:offset=${offset}${nextOutput};\n`
        previousOutput = nextOutput
      }
    })

    // If only 1 image, map out0 to final
    if (images.length === 1) {
      filterComplex += `[out0]copy[final];\n` // dummy operation if needed, or just map out0
    }

    fs.writeFileSync(scriptFile, filterComplex, 'utf-8')

    // Append script args
    args.push('-filter_complex_script', scriptFile)
    
    // Map final output
    const mapLabel = images.length === 1 ? '[out0]' : '[final]'
    args.push(
      '-map', mapLabel,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', `${fps}`,
      finalDest
    )

    const subprocess = spawn(ffmpegPath, args, { windowsHide: true })

    let stdErrOutput = ''

    subprocess.stderr.on('data', (data) => {
      const output = data.toString()
      stdErrOutput += output
      if (onProgress) {
        onProgress({ status: 'processing', raw: output })
      }
    })

    subprocess.on('close', (code) => {
      try {
        fs.unlinkSync(scriptFile)
      } catch (e) {}

      if (code === 0) {
        onComplete({ success: true, path: finalDest })
      } else {
        console.error('FFmpeg error:', stdErrOutput)
        onError(`Slideshow generation failed (Code ${code})`)
      }
    })

  } catch (error) {
    onError(error.message)
  }
}

export default {
  createSlideshow
}
