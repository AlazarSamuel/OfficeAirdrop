import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let regionWindow = null;

export async function startRegionSelection() {
  return new Promise((resolve) => {
    if (regionWindow) {
      regionWindow.close();
      regionWindow = null;
    }

    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);

    regionWindow = new BrowserWindow({
      x: activeDisplay.bounds.x,
      y: activeDisplay.bounds.y,
      width: activeDisplay.bounds.width,
      height: activeDisplay.bounds.height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      enableLargerThanScreen: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    });

    regionWindow.setAlwaysOnTop(true, 'screen-saver');
    regionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    regionWindow.focus();

    // We can just load a local HTML file for the overlay
    regionWindow.loadFile(path.join(__dirname, 'region.html'));

    const cleanup = () => {
      ipcMain.removeListener('region-selected', onSelected);
      ipcMain.removeListener('region-canceled', onCanceled);
      if (regionWindow && !regionWindow.isDestroyed()) {
        regionWindow.close();
      }
      regionWindow = null;
    };

    const onSelected = (event, bounds) => {
      cleanup();
      // bounds will be relative to the active display's bounds in logical pixels
      const scale = activeDisplay.scaleFactor || 1;
      const physicalBounds = {
        x: Math.round(bounds.x * scale),
        y: Math.round(bounds.y * scale),
        width: Math.round(bounds.width * scale),
        height: Math.round(bounds.height * scale)
      };
      
      resolve({ 
        bounds, 
        physicalBounds,
        display_id: activeDisplay.id 
      });
    };

    const onCanceled = () => {
      cleanup();
      resolve(null);
    };

    ipcMain.on('region-selected', onSelected);
    ipcMain.on('region-canceled', onCanceled);

    // If the window is closed by other means
    regionWindow.on('closed', () => {
      ipcMain.removeListener('region-selected', onSelected);
      ipcMain.removeListener('region-canceled', onCanceled);
      regionWindow = null;
      resolve(null);
    });
  });
}
