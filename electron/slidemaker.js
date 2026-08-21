import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import * as licensing from './licensing.js'

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
function createSlideshow(images, duration, outputDir, transition, onProgress, onComplete, onError) {
  if (!images || images.length === 0) {
    onError('No images provided.')
    return
  }

  const id = Date.now().toString()
  const tempDir = app.getPath('temp')
  const scriptFile = path.join(tempDir, `filter_${id}.txt`)
  const finalDest = path.join(outputDir, `Slideshow_${id}.mp4`)

  try {
    const fps = 30
    const slideDuration = duration // e.g. 3
    const fadeDuration = 0.5
    const framesPerSlide = Math.floor(slideDuration * fps)

    let filterComplex = ''
    let args = ['-y']

    // Add inputs
    images.forEach(img => {
      args.push('-i', img)
    })
    // Add silent dummy audio track for NLE compatibility
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
    const audioInputIndex = images.length

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
        
        let actualTransition = transition || 'fade'
        
        // --- Gate 1: Cryptographic Feature Binding ---
        const proToken = licensing.getProToken();
        if (!proToken && actualTransition !== 'fade') {
          console.log('[SlideMaker] Cryptographic binding failed (Missing Token). Forcing basic fade.');
          actualTransition = 'fade';
        }
        
        if (actualTransition === 'random') {
          const randOptions = [
            'fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 
            'slideleft', 'slideright', 'slideup', 'slidedown', 
            'circlecrop', 'rectcrop', 'distance', 'radial', 
            'smoothleft', 'smoothright', 'smoothup', 'smoothdown', 
            'circleopen', 'circleclose', 'vertopen', 'vertclose', 
            'horzopen', 'horzclose', 'dissolve', 'pixelize', 
            'diagbl', 'diagbr', 'diagtl', 'diagtr', 
            'hlslice', 'hrslice', 'vuslice', 'vdslice'
          ]
          actualTransition = randOptions[Math.floor(Math.random() * randOptions.length)]
        }
        
        filterComplex += `${previousOutput}${currentOut}xfade=transition=${actualTransition}:duration=${fadeDuration}:offset=${offset}${nextOutput};\n`
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
      '-map', `${audioInputIndex}:a`, // Inject the silent audio
      '-c:v', 'libx264',
      '-preset', 'fast', // Balance between speed and quality
      '-crf', '18', // Visually lossless quality
      '-g', '30', // Keyframe every 30 frames (buttery smooth scrubbing in Premiere)
      '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', // Premiere HD color tagging
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-c:a', 'aac', // Audio codec
      '-b:a', '128k',
      '-shortest', // Cut off the infinite dummy audio when the video ends
      '-r', `${fps}`, // Force 30 CFR
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
