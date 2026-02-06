const electron = require("electron");
const path = require("path");
const url = require("url");
const { BrowserWindow, app , ipcMain} = electron;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false,
        icon: path.join(__dirname, "assets", "logo.png")
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
ipcMain.handle('get-downloads-path', async () => {
    return app.getPath('downloads');
});

app.on("ready", createWindow);