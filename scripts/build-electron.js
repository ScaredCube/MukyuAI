const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');

function runCommand(command, cwd = rootDir) {
  console.log(`Running: ${command}`);
  execSync(command, { stdio: 'inherit', cwd });
}

try {
  // 1. Build Next.js
  console.log('Building Next.js application...');
  runCommand('npm run build');

  // 2. Copy static files
  console.log('Copying static and public files...');
  fs.cpSync(
    path.join(rootDir, '.next', 'static'),
    path.join(standaloneDir, '.next', 'static'),
    { recursive: true }
  );

  fs.cpSync(
    path.join(rootDir, 'public'),
    path.join(standaloneDir, 'public'),
    { recursive: true }
  );

  // 3. Copy Electron files
  console.log('Copying Electron files...');
  fs.cpSync(
    path.join(rootDir, 'electron'),
    path.join(standaloneDir, 'electron'),
    { recursive: true }
  );


  // 5. Modify standalone package.json to declare Electron properties
  console.log('Modifying standalone package.json...');
  const pkgPath = path.join(standaloneDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    pkg.main = 'electron/main.js';
    pkg.name = 'mukyu-ai';
    pkg.description = rootPkg.description || 'MukyuAI Desktop Client';
    pkg.author = rootPkg.author || 'ScaredCube';
    pkg.version = rootPkg.version || '0.1.0';
    
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  }

  // Remove unnecessary files that standalone might copy due to dynamic tracing
  console.log('Cleaning up unnecessary files from standalone directory...');
  const pathsToRemove = [
    path.join(standaloneDir, 'dist'),
    path.join(standaloneDir, 'data'),
    path.join(standaloneDir, 'src'),
    path.join(standaloneDir, 'scripts'),
    path.join(standaloneDir, 'electron-builder.config.json'),
    path.join(standaloneDir, 'package-lock.json')
  ];
  pathsToRemove.forEach((p) => {
    if (fs.existsSync(p)) {
      console.log(`Pruning standalone path: ${p}`);
      fs.rmSync(p, { recursive: true, force: true });
    }
  });

  // 6. Package the application with electron-builder
  console.log('Packaging Electron application...');
  // We run electron-builder using the configuration file in the root directory
  // --projectDir points to the standalone build, --config specifies the root builder config
  runCommand('npx electron-builder --projectDir .next/standalone --config ../../electron-builder.config.json');

  console.log('\n--- Electron packaging completed successfully! ---');
} catch (error) {
  console.error('\n--- Electron packaging failed! ---');
  console.error(error);
  process.exit(1);
}
