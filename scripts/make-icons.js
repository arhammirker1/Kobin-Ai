// scripts/make-icons.js
// Run: node scripts/make-icons.js
// Requires: npm install sharp (already in devDependencies)
// Place your 1024x1024 PNG at: build-resources/source-icon.png
// This generates all required formats for Win/Mac/Linux

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SOURCE = path.join(__dirname, '../build-resources/source-icon.png')
const OUT = path.join(__dirname, '../build-resources')

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`\n❌ Missing source icon at: build-resources/source-icon.png`)
    console.error(`   Please add a 1024x1024 PNG there and re-run.\n`)
    process.exit(1)
  }

  console.log('🎨 Generating icons from source-icon.png...\n')

  // ── PNG sizes ────────────────────────────────────────────────────────────
  const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  for (const size of pngSizes) {
    await sharp(SOURCE)
      .resize(size, size)
      .png()
      .toFile(path.join(OUT, `icon-${size}.png`))
    console.log(`  ✅ icon-${size}.png`)
  }

  // ── Main icon.png (256px — used by Linux + electron) ─────────────────────
  await sharp(SOURCE)
    .resize(256, 256)
    .png()
    .toFile(path.join(OUT, 'icon.png'))
  console.log(`  ✅ icon.png (256px)`)

  // ── Tray icon (22px for Mac, 16-24px for Win/Linux) ──────────────────────
  await sharp(SOURCE)
    .resize(22, 22)
    .png()
    .toFile(path.join(OUT, 'tray-icon.png'))
  console.log(`  ✅ tray-icon.png (22px)`)

  // ── Windows ICO (multi-size) ──────────────────────────────────────────────
  // Generate individual PNGs then combine into ICO using png-to-ico
  try {
    const pngToIco = require('png-to-ico')
    const icoSizes = [16, 32, 48, 64, 128, 256]
    const icoBuffers = await Promise.all(
      icoSizes.map(size =>
        sharp(SOURCE).resize(size, size).png().toBuffer()
      )
    )
    const icoBuffer = await pngToIco(icoBuffers)
    fs.writeFileSync(path.join(OUT, 'icon.ico'), icoBuffer)
    console.log(`  ✅ icon.ico (Windows)`)
  } catch (e) {
    console.log(`  ⚠️  Skipping ICO (install png-to-ico): npm install png-to-ico`)
    console.log(`     You can also convert manually at: https://icoconvert.com`)
  }

  // ── Mac ICNS ──────────────────────────────────────────────────────────────
  if (process.platform === 'darwin') {
    try {
      const icnsDir = path.join(OUT, 'icon.iconset')
      fs.mkdirSync(icnsDir, { recursive: true })

      const icnsSizes = [
        [16, 'icon_16x16'], [32, 'icon_16x16@2x'],
        [32, 'icon_32x32'], [64, 'icon_32x32@2x'],
        [128, 'icon_128x128'], [256, 'icon_128x128@2x'],
        [256, 'icon_256x256'], [512, 'icon_256x256@2x'],
        [512, 'icon_512x512'], [1024, 'icon_512x512@2x'],
      ]

      for (const [size, name] of icnsSizes) {
        await sharp(SOURCE)
          .resize(size, size)
          .png()
          .toFile(path.join(icnsDir, `${name}.png`))
      }

      execSync(`iconutil -c icns "${icnsDir}" -o "${path.join(OUT, 'icon.icns')}"`)
      fs.rmSync(icnsDir, { recursive: true })
      console.log(`  ✅ icon.icns (macOS)`)
    } catch (e) {
      console.log(`  ⚠️  Skipping ICNS (macOS only, requires iconutil)`)
    }
  } else {
    console.log(`  ℹ️  ICNS generation requires macOS (iconutil). Build Mac app on Mac.`)
  }

  console.log('\n✅ Icon generation complete!\n')
  console.log('Files in build-resources/:')
  fs.readdirSync(OUT)
    .filter(f => !f.includes('source-icon') && !f.startsWith('.'))
    .forEach(f => console.log(`  - ${f}`))
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})