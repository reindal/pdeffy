const electron = require("electron");
const path = require("path");
const url = require("url");
const fs = require("fs");
const { BrowserWindow, app , ipcMain, dialog} = electron;
const { updateElectronApp, UpdateSourceType } = require('update-electron-app')

//updating app
updateElectronApp({
  updateSource: {
    type: UpdateSourceType.StaticStorage,
    baseUrl: `https://update.reindal.cloud/argo-tools/`
  }
})

// Path to store settings
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'pdf-settings.json');
const languagePath = path.join(userDataPath, 'language-settings.json');
const firstLaunchMarkerPath = path.join(userDataPath, 'first-launch-complete.json');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false,
        icon: path.join(__dirname, "assets", "ico.png")
    });
    mainWindow.maximize();
    mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, "index.html"),
            protocol: "file:",
            slashes: true,
        })
    );

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });
}

// Handle IPC request for downloads path
//TODO: OUTDATED WILL BE REMOVED
ipcMain.handle('get-downloads-path', async () => {
    return app.getPath('downloads');
});

// Handle IPC request to show save dialog
ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    if (result.canceled) {
        return null;
    }
    return result.filePath;
});

// Handle IPC request to show open dialog (for folder selection)
ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

// Handle IPC request to set file as read-only
//TODO: OUTDATED WILL BE REMOVED
ipcMain.handle('set-file-readonly', async (event, filePath) => {
    try {
        // Set file to read-only (remove write permissions)
        fs.chmodSync(filePath, 0o444);
        return { success: true };
    } catch (error) {
        console.error('Error setting file as read-only:', error);
        throw error;
    }
});

// Handle IPC request to save PDF metadata to local file
ipcMain.handle('save-pdf-metadata', async (event, metadata) => {
    try {
        const settings = {
            author: metadata.author || '',
            title: metadata.title || '',
            subject: metadata.subject || ''
        };

        // Save to JSON file
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        return { success: true };
    } catch (error) {
        console.error('Error saving PDF metadata:', error);
        throw error;
    }
});

// Handle IPC request to get PDF metadata from local file
ipcMain.handle('get-pdf-metadata', async () => {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error reading PDF metadata:', error);
    }

    // Return empty metadata if file doesn't exist or error occurs
    return {
        author: '',
        title: '',
        subject: ''
    };
});

// Handle IPC request to know if this is the first app launch.
// The existence of a marker file as the source of truth.
ipcMain.handle('check-first-launch', async () => {
    try {
        if (fs.existsSync(firstLaunchMarkerPath)) {
            return false;
        }

        fs.writeFileSync(
            firstLaunchMarkerPath,
            JSON.stringify({ completedAt: new Date().toISOString() }, null, 2),
            'utf8'
        );

        return true;
    } catch (error) {
        console.error('Error handling first-launch marker:', error);
        return false;
    }
});

app.on("ready", createWindow);

// Handle IPC request to save the language selected to local file
ipcMain.handle('get-language', async () => {
    try {
        if (fs.existsSync(languagePath)) {
            const fileContent = fs.readFileSync(languagePath, 'utf8');
            const data = JSON.parse(fileContent);
            return data.language || 'en'; 
        }
        return 'en';
    } catch (error) {
        console.error('Error reading language file:', error);
        return 'en';
    }
});

// Handle IPC request to get the language selected from local file
ipcMain.handle('save-language', async (event, language) => {
    try {
        fs.writeFileSync(
            languagePath,
            JSON.stringify({ language }, null, 2),
            'utf8'
        );
        return { success: true };
    } catch (error) {
        console.error('Error saving language file:', error);
        throw error;
    }
});
