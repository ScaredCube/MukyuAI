const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const net = require('net');

let serverProcess = null;
let mainWindow = null;
const isDev = !app.isPackaged;

// Helper to find an available port starting from a given port number
function getFreePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(getFreePort(startPort + 1));
      } else {
        resolve(startPort);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(startPort);
    });
    server.listen(startPort);
  });
}

async function startNextServer() {
  if (isDev) {
    // In development mode, we expect Next.js dev server to be running on port 3000
    process.env.MUKYU_DATA_DIR = path.join(app.getAppPath(), 'data');
    process.env.MUKYU_WASM_DIR = path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist');
    return 'http://127.0.0.1:3000';
  }

  // In production (packaged) mode, we start the standalone Next.js server locally
  const port = await getFreePort(19024);
  // electron-builder sets PORTABLE_EXECUTABLE_DIR to the directory containing the original .exe file
  const appDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);

  // Set environment variables for portable mode next to the executable
  process.env.MUKYU_DATA_DIR = path.join(appDir, 'data');
  process.env.MUKYU_WASM_DIR = path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist');
  process.env.PORT = port.toString();
  process.env.HOSTNAME = '127.0.0.1';
  process.env.NODE_ENV = 'production';

  const serverPath = path.join(app.getAppPath(), 'server.js');

  console.log(`Starting Next.js standalone server on port ${port}...`);
  console.log(`Database folder is located at: ${process.env.MUKYU_DATA_DIR}`);

  serverProcess = fork(serverPath, [], {
    env: { ...process.env },
    stdio: 'inherit'
  });

  // Small delay to allow the server to boot up before the window tries to load it
  await new Promise((resolve) => setTimeout(resolve, 1500));

  return `http://127.0.0.1:${port}`;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    title: 'MukyuAI',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const url = await startNextServer();
  createWindow(url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(url);
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ensure the child process is terminated on unexpected app exits
process.on('exit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});
