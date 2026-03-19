const electron = require("electron");
const os = require('os');
const path = require("path");
const url = require("url");
const fs = require("fs");
const fsPromises = fs.promises;
const { BrowserWindow, app, ipcMain, dialog, autoUpdater, shell, Menu } = electron;
const { updateElectronApp, UpdateSourceType } = require('update-electron-app');
const pptxgen = require('pptxgenjs');
const { exec } = require('child_process');
const { execSync } = require('child_process');

if (require('electron-squirrel-startup')) return;

// =========================================================
// AUTO-UPDATER CONFIGURATION
// =========================================================

const platform = os.platform();
const currentVersion = app.getVersion();

// Helper function to read the language directly from the saved file in the Backend
function getSavedLanguage() {
    try {
        const userDataPath = app.getPath('userData');
        const settingsPath = path.join(userDataPath, 'language-settings.json');

        if (fs.existsSync(settingsPath)) {
            const rawData = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(rawData);
            return settings.language || 'en';
        }
    } catch (error) {
        console.error('Error reading language file:', error);
    }
    return 'en'; // Fallback
}


if (platform === 'win32' || platform === 'darwin') {
    // -----------------------------------------------------
    // WINDOWS & MACOS: True Background Auto-Updater
    // -----------------------------------------------------
    updateElectronApp({
        updateSource: {
            type: UpdateSourceType.StaticStorage,
            baseUrl: `https://github.com/reindal/pdeffy/releases/download/latest/`
        },
        notifyUser: false
    });

    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {

        let dialogTitle, dialogMessage, dialogDetail, btnUpdate, btnLater;

        const currentLanguage = getSavedLanguage();

        switch (currentLanguage) {
            case 'es':
                dialogTitle = 'Actualización de la aplicación';
                dialogMessage = 'Una nueva versión de Pdeffy está lista.';
                dialogDetail = 'La actualización se ha descargado en segundo plano. ¿Deseas reiniciar la aplicación para aplicar los cambios ahora, o hacerlo más tarde?';
                btnUpdate = 'Actualizar ahora';
                btnLater = 'Más tarde';
                break;

            case 'it':
                dialogTitle = 'Aggiornamento dell\'applicazione';
                dialogMessage = 'Una nuova versione di Pdeffy è pronta.';
                dialogDetail = 'L\'aggiornamento è stato scaricato in background. Vuoi riavviare l\'applicazione per applicare le modifiche ora oppure farlo più tardi?';
                btnUpdate = 'Aggiorna ora';
                btnLater = 'Più tardi';
                break;

            case 'pl':
                dialogTitle = 'Aktualizacja aplikacji';
                dialogMessage = 'Nowa wersja Pdeffy jest gotowa.';
                dialogDetail = 'Aktualizacja została pobrana w tle. Czy chcesz teraz ponownie uruchomić aplikację, aby zastosować zmiany, czy zrobić to później?';
                btnUpdate = 'Aktualizuj teraz';
                btnLater = 'Później';
                break;

            default:
                dialogTitle = 'Application Update';
                dialogMessage = 'A new version of Pdeffy is ready.';
                dialogDetail = 'The update has been downloaded in the background. Would you like to restart the application to apply the changes now, or do it later?';
                btnUpdate = 'Update Now';
                btnLater = 'Later';
                break;
        }

        const dialogOpts = {
            type: 'info',
            buttons: [btnUpdate, btnLater],
            title: dialogTitle,
            message: dialogMessage,
            detail: dialogDetail,
            noLink: true
        };

        dialog.showMessageBox(dialogOpts).then((returnValue) => {
            if (returnValue.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

} else if (platform === 'linux') {
    // -----------------------------------------------------
    // LINUX: Manual Download Notification
    // -----------------------------------------------------
    app.on('ready', () => {
        // Fetch the exact same RELEASES file that Windows uses
        fetch('https://github.com/reindal/pdeffy/releases/download/latest/RELEASES')
            .then(res => {
                if (!res.ok) throw new Error('RELEASES file not found on server.');
                return res.text();
            })
            .then(text => {
                // The text looks like: "HASH pdeffy-1.5.1-full.nupkg SIZE"
                // We use a Regular Expression to extract the version numbers from the filename
                const match = text.match(/pdeffy-([\d.]+)-full\.nupkg/);

                if (match && match[1]) {
                    const latestVersion = match[1];

                    // Compare the semantic version
                    if (latestVersion !== currentVersion) {

                        let dialogTitle, dialogMessage, dialogDetail, btnDownload, btnCancel;

                        const currentLanguage = getSavedLanguage();

                        switch (currentLanguage) {
                            case 'es':
                                dialogTitle = 'Actualización disponible';
                                dialogMessage = `¡La versión ${latestVersion} de Pdeffy está disponible!`;
                                dialogDetail = `Actualmente ejecutas la versión ${currentVersion}. Las políticas de seguridad de Linux impiden las actualizaciones en segundo plano. Por favor, descarga el último instalador .deb desde nuestra web o GitHub.`;
                                btnDownload = 'Descargar actualización';
                                btnCancel = 'Cancelar';
                                break;

                            case 'it':
                                dialogTitle = 'Aggiornamento disponibile';
                                dialogMessage = `La versione ${latestVersion} di Pdeffy è disponibile!`;
                                dialogDetail = `Attualmente stai usando la versione ${currentVersion}. Le politiche di sicurezza di Linux impediscono gli aggiornamenti in background. Per favore scarica l’ultimo installer .deb dal nostro sito web o da GitHub.`;
                                btnDownload = 'Scarica aggiornamento';
                                btnCancel = 'Annulla';
                                break;

                            case 'pl':
                                dialogTitle = 'Dostępna aktualizacja';
                                dialogMessage = `Wersja ${latestVersion} Pdeffy jest dostępna!`;
                                dialogDetail = `Obecnie używasz wersji ${currentVersion}. Zasady bezpieczeństwa systemu Linux uniemożliwiają aktualizacje w tle. Pobierz najnowszy instalator .deb z naszej strony internetowej lub z GitHub.`;
                                btnDownload = 'Pobierz aktualizację';
                                btnCancel = 'Anuluj';
                                break;

                            default:
                                dialogTitle = 'Update available';
                                dialogMessage = `Pdeffy version ${latestVersion} is available!`;
                                dialogDetail = `You are currently running version ${currentVersion}. Linux security policies prevent background updates. Please download the latest .deb installer from our website or GitHub.`;
                                btnDownload = 'Download update';
                                btnCancel = 'Cancel';
                                break;
                        }

                        const dialogOpts = {
                            type: 'info',
                            buttons: [btnDownload, btnCancel],
                            title: dialogTitle,
                            message: dialogMessage,
                            detail: dialogDetail,
                            noLink: true
                        };

                        dialog.showMessageBox(dialogOpts).then((returnValue) => {
                            if (returnValue.response === 0) {
                                shell.openExternal('https://github.com/reindal/pdeffy/releases/tag/latest');
                            }
                        });
                    }
                }
            })
            .catch(err => {
                // This will print to the Ubuntu terminal if launched via command line
                console.error('Error checking for Linux updates:', err);
            });
    });
}

// Path to store settings
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'pdf-settings.json');
const languagePath = path.join(userDataPath, 'language-settings.json');
const firstLaunchMarkerPath = path.join(userDataPath, 'first-launch-complete.json');
const warningsPath = path.join(userDataPath, 'warnings-settings.json');

let mainWindow;

function createWindow() {
    const appVersion = app.getVersion();
    mainWindow = new BrowserWindow({
        title: `Pdeffy v${appVersion}`,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false,
        icon: path.join(__dirname, "assets", "logo", "png", "256x256.png")
    });

    // NATIVE APPLICATION MENU

    const currentLanguage = getSavedLanguage();

    setTranslatedMenu(appVersion, currentLanguage);

    // =========================================================

    mainWindow.on('page-title-updated', (event) => {
        event.preventDefault();
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

    // Ctrl+Shift+I (o Cmd+Option+I en Mac) para toggle DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isDevToolsShortcut =
            input.type === 'keyDown' &&
            input.key === 'I' &&
            input.shift &&
            (process.platform === 'darwin' ? input.meta : input.control);

        if (isDevToolsShortcut) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });
}

ipcMain.handle('open-folder', (_, folderPath) => {
    shell.openPath(folderPath);
});

function setTranslatedMenu(appVersion, language) {
    let menuFile, menuExit, menuHelp, menuAbout, textVersion, textAuthor, textLicense, textDesc;

    switch (language) {
        case 'es':
            menuFile = 'Archivo';
            menuExit = 'Salir';
            menuHelp = 'Ayuda';
            menuAbout = 'Acerca de Pdeffy';
            textVersion = 'Versión';
            textAuthor = 'Autor';
            textLicense = 'Licencia';
            textDesc = 'Una aplicación profesional para manipular archivos PDF.';
            break;

        case 'it':
            menuFile = 'File';
            menuExit = 'Esci';
            menuHelp = 'Aiuto';
            menuAbout = 'Informazioni su Pdeffy';
            textVersion = 'Versione';
            textAuthor = 'Autore';
            textLicense = 'Licenza';
            textDesc = 'Un\'applicazione professionale per la manipolazione di file PDF.';
            break;

        case 'pl':
            menuFile = 'Plik';
            menuExit = 'Zakończ';
            menuHelp = 'Pomoc';
            menuAbout = 'O Pdeffy';
            textVersion = 'Wersja';
            textAuthor = 'Autor';
            textLicense = 'Licencja';
            textDesc = 'Profesjonalna aplikacja do manipulowania plikami PDF.';
            break;

        default:
            menuFile = 'File';
            menuExit = 'Exit';
            menuHelp = 'Help';
            menuAbout = 'About Pdeffy';
            textVersion = 'Version';
            textAuthor = 'Author';
            textLicense = 'License';
            textDesc = 'A professional application for manipulating PDF files.';
            break;
    }

    const menuTemplate = [
        {
            label: menuFile,
            submenu: [
                { role: 'quit', label: menuExit }
            ]
        },
        {
            label: menuHelp,
            submenu: [
                {
                    label: menuAbout,
                    click: () => {
                        const aboutOptions = {
                            type: 'info',
                            title: menuAbout,
                            message: 'Pdeffy',
                            detail: `${textVersion}: ${appVersion}\n${textAuthor}: Reindal\n${textLicense}: MIT\n\n${textDesc}`,
                            buttons: ['OK'],
                            icon: path.join(__dirname, "assets", "logo", "png", "256x256.png")
                        };
                        dialog.showMessageBox(aboutOptions);
                    }
                }
            ]
        }
    ];

    const customMenu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(customMenu);
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
        const appVersion = app.getVersion();
        setTranslatedMenu(appVersion, language);
        return { success: true };
    } catch (error) {
        console.error('Error saving language file:', error);
        throw error;
    }
});

ipcMain.handle('generate-pptx', async (event, { slides, filePath }) => {
    try {
        const pptx = new pptxgen();

        // Iterate through the structured data received from the renderer to build slides
        for (const slideData of slides) {
            const slide = pptx.addSlide();

            if (slideData.images && slideData.images.length > 0) {
                for (const img of slideData.images) {
                    slide.addImage(img);
                }
            }

            if (slideData.texts && slideData.texts.length > 0) {
                for (const textItem of slideData.texts) {
                    slide.addText(textItem.text, textItem.options);
                }
            }
        }

        // Securely write the file to the disk directly from the Node.js environment
        await pptx.writeFile({ fileName: filePath });
        return { success: true };

    } catch (error) {
        console.error("Error in Main process generating PPTX:", error);
        throw error;
    }
});


/////////// LOCAL OFFICE ///////////

// =========================================================
// LIBREOFFICE PATH RESOLVER
// =========================================================
function getSystemLibreOfficePath() {
    switch (os.platform()) {
        case 'win32': {
            const winPaths = [
                'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
                'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
            ];
            for (let p of winPaths) {
                if (fs.existsSync(p)) return p;
            }
            try {
                return execSync('where soffice').toString().trim();
            } catch (e) {
                return null;
            }
        }
        case 'darwin': {
            const macPath = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
            if (fs.existsSync(macPath)) return macPath;
            return null;
        }
        default: {
            // Linux/Ubuntu and other UNIX-like systems
            // Method 1: Standard APT or Snap installations (Checks system $PATH)
            try {
                const standardPath = execSync('which libreoffice').toString().trim();
                if (standardPath && fs.existsSync(standardPath)) return standardPath;
            } catch (e) {
                // Silently ignore and fall through
            }

            try {
                const sofficePath = execSync('which soffice').toString().trim();
                if (sofficePath && fs.existsSync(sofficePath)) return sofficePath;
            } catch (err) {
                // Silently ignore and fall through
            }

            // Method 2: Manual .tar.gz installations (Scans the /opt/ directory)
            // Official manual installs go to /opt/libreoffice[version]/program/soffice
            try {
                const optPath = '/opt';
                if (fs.existsSync(optPath)) {
                    const directories = fs.readdirSync(optPath);

                    // Filter for libreoffice folders and sort descending to grab the newest version if multiple exist
                    const loDirs = directories
                        .filter(dir => dir.toLowerCase().startsWith('libreoffice'))
                        .sort()
                        .reverse();

                    for (const dir of loDirs) {
                        const manualPath = path.join(optPath, dir, 'program', 'soffice');
                        if (fs.existsSync(manualPath)) {
                            console.log(`[System] Found manual LibreOffice installation at: ${manualPath}`);
                            return manualPath;
                        }
                    }
                }
            } catch (e) {
                console.error("[Warning] Error scanning /opt/ for LibreOffice:", e);
            }

            return null; // LibreOffice is definitely not installed
        }
    }
}

// =========================================================
// MICROSOFT OFFICE ENGINE
// =========================================================
function convertWithMSOfficeWindows(inputPath, outputPath, format, inputExtension) {
    return new Promise(async (resolve, reject) => {
        if (os.platform() !== 'win32') return reject(new Error("Only supported on Windows environment."));

        const tempDir = app.getPath('temp');
        const psPath = path.join(tempDir, `msoffice_${Date.now()}.ps1`);

        // Generate a routing key (e.g., ".pdf_to_docx") for cleaner logic mapping
        const conversionRoute = `${inputExtension}_to_${format}`;
        let psScript = '';

        switch (conversionRoute) {
            // --- PDF TO OFFICE ---
            case '.pdf_to_docx':
                psScript = `$word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0; try { $doc = $word.Documents.Open('${inputPath}'); $doc.SaveAs([ref]'${outputPath}', [ref]16); $doc.Close(); $word.Quit(); exit 0 } catch { if ($word) { $word.Quit() }; exit 1 }`;
                break;
            case '.pdf_to_pptx':
                psScript = `$ppt = New-Object -ComObject PowerPoint.Application; $ppt.DisplayAlerts = 1; try { $pres = $ppt.Presentations.Open('${inputPath}', $false, $false, $false); $pres.SaveAs('${outputPath}', 24); $pres.Close(); $ppt.Quit(); exit 0 } catch { if ($ppt) { $ppt.Quit() }; exit 1 }`;
                break;

            // --- OFFICE TO PDF ---
            case '.docx_to_pdf':
                psScript = `$word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0; try { $doc = $word.Documents.Open('${inputPath}'); $doc.SaveAs([ref]'${outputPath}', [ref]17); $doc.Close(); $word.Quit(); exit 0 } catch { if ($word) { $word.Quit() }; exit 1 }`;
                break;
            case '.pptx_to_pdf':
                psScript = `$ppt = New-Object -ComObject PowerPoint.Application; $ppt.DisplayAlerts = 1; try { $pres = $ppt.Presentations.Open('${inputPath}', $false, $false, $false); $pres.SaveAs('${outputPath}', 32); $pres.Close(); $ppt.Quit(); exit 0 } catch { if ($ppt) { $ppt.Quit() }; exit 1 }`;
                break;

            default:
                return reject(new Error("Format not supported by MS Office engine."));
        }

        try {
            await fsPromises.writeFile(psPath, psScript);
            const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`;
            exec(command, async (error) => {
                try { await fsPromises.unlink(psPath); } catch (e) { }
                if (error) reject(error);
                else resolve();
            });
        } catch (e) {
            reject(e);
        }
    });
}

// =========================================================
// MAIN CONVERSION HANDLER
// =========================================================
ipcMain.handle('convert-with-libreoffice', async (event, { fileData, fileName, outputPath, format = 'pdf', metadata }) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Bypass Linux Snap sandbox restrictions by avoiding the system /tmp directory.
            // We route temporary files to the user-selected destination folder (e.g., Downloads),
            // which the Snap environment natively has permission to read and write.
            const targetDir = path.dirname(outputPath);

            // Parse clean name to avoid double extensions (e.g., file.pdf.pdf -> file.pdf)
            const parsedName = path.parse(fileName).name;

            // Prefix with a dot to create a hidden temporary file in UNIX systems
            const uniqueFileName = `.temp_${Date.now()}_${parsedName}${path.parse(fileName).ext}`;
            const tempInputPath = path.join(targetDir, uniqueFileName);

            await fsPromises.writeFile(tempInputPath, Buffer.from(fileData));
            const outputDir = targetDir;
            const isPdfInput = fileName.toLowerCase().endsWith('.pdf');
            const inputExt = path.parse(fileName).ext.toLowerCase();

            let conversionSuccess = false;

            // --- MICROSOFT OFFICE ---
            const canUseMSOffice = os.platform() === 'win32' && (
                (isPdfInput && (format === 'docx' || format === 'pptx')) ||
                ((inputExt === '.docx' || inputExt === '.pptx') && format === 'pdf')
            );

            if (canUseMSOffice) {
                console.log(`[Conversion] Attempting native MS Office conversion...`);
                try {
                    await convertWithMSOfficeWindows(tempInputPath, outputPath, format, inputExt);
                    console.log("[Conversion] MS Office conversion successful.");
                    conversionSuccess = true;
                } catch (msError) {
                    console.log("[Conversion] MS Office failed or is not installed. Falling back to LibreOffice...");
                }
            }

            // --- LIBREOFFICE ---
            if (!conversionSuccess) {
                const libreOfficePath = getSystemLibreOfficePath();
                if (!libreOfficePath) {
                    try { await fsPromises.unlink(tempInputPath); } catch (e) { }
                    return reject(new Error("LibreOffice installation not found."));
                }

                console.log(`[Conversion] Using system LibreOffice for ${format.toUpperCase()} conversion...`);
                const baseName = path.parse(tempInputPath).name;

                // Create a unique, hidden, and isolated profile directory inside the target folder
                const profileDir = path.join(targetDir, `.lo_profile_${Date.now()}_${Math.random().toString(36).substring(7)}`);
                const profileUrl = url.pathToFileURL(profileDir).href;
                const envFlag = `-env:UserInstallation=${profileUrl}`;

                // SPECIAL STRATEGY: 2-Step conversion for PDF to DOCX
                if (isPdfInput && format === 'docx') {
                    console.log(`[Conversion] Applying 2-step process (PDF -> ODT -> DOCX) for better formatting...`);

                    // FIXED: Replaced tempDir with targetDir for the intermediate file
                    const tempOdtPath = path.join(targetDir, baseName + '.odt');

                    // STEP 1: PDF to ODT (Saves in target directory to bypass Snap sandbox)
                    // FIXED: Replaced tempDir with targetDir in the --outdir flag
                    const step1Command = `"${libreOfficePath}" ${envFlag} --headless --infilter="writer_pdf_import" --convert-to odt "${tempInputPath}" --outdir "${targetDir}"`;

                    await new Promise((res, rej) => {
                        exec(step1Command, (error, stdout, stderr) => {
                            if (error) {
                                console.error("LibreOffice Step 1 error:", stderr);
                                return rej(new Error("LibreOffice PDF to ODT conversion failed."));
                            }
                            res();
                        });
                    });

                    // STEP 2: ODT to DOCX (Saves to final output folder)
                    const step2Command = `"${libreOfficePath}" ${envFlag} --headless --convert-to docx "${tempOdtPath}" --outdir "${outputDir}"`;

                    await new Promise((res, rej) => {
                        exec(step2Command, async (error, stdout, stderr) => {
                            // Clean up the intermediate ODT file
                            try { await fsPromises.unlink(tempOdtPath); } catch (e) { }

                            if (error) {
                                console.error("LibreOffice Step 2 error:", stderr);
                                return rej(new Error("LibreOffice ODT to DOCX conversion failed."));
                            }

                            try {
                                const generatedFilePath = path.join(outputDir, baseName + '.docx');
                                if (fs.existsSync(generatedFilePath)) {
                                    if (generatedFilePath !== outputPath) {
                                        await fsPromises.rename(generatedFilePath, outputPath);
                                    }
                                    res();
                                } else {
                                    rej(new Error("LibreOffice process finished, but the expected DOCX file was not found."));
                                }
                            } catch (err) { rej(err); }
                        });
                    });

                } else {
                    // STANDARD STRATEGY: 1-Step conversion for everything else
                    let infilter = "";
                    if (isPdfInput && format === 'pptx') {
                        console.log(`[Conversion] Applying impress_pdf_import filter for PPTX...`);
                        infilter = `--infilter="impress_pdf_import" `;
                    }

                    const command = `"${libreOfficePath}" ${envFlag} --headless ${infilter}--convert-to ${format} "${tempInputPath}" --outdir "${outputDir}"`;

                    await new Promise((res, rej) => {
                        exec(command, async (error, stdout, stderr) => {
                            if (error) {
                                console.error("LibreOffice execution error:", stderr);
                                return rej(new Error("LibreOffice conversion failed."));
                            }

                            try {
                                const generatedFilePath = path.join(outputDir, baseName + `.${format}`);
                                if (fs.existsSync(generatedFilePath)) {
                                    if (generatedFilePath !== outputPath) {
                                        await fsPromises.rename(generatedFilePath, outputPath);
                                    }
                                    res();
                                } else {
                                    rej(new Error("LibreOffice process finished, but the expected output file was not found."));
                                }
                            } catch (err) { rej(err); }
                        });
                    });
                }

                // Cleanup isolated profile directory asynchronously to free up disk space
                try {
                    await fsPromises.rm(profileDir, { recursive: true, force: true });
                } catch (cleanupErr) {
                    console.error("[Warning] Failed to clean up isolated LibreOffice profile:", cleanupErr);
                }
            }

            // Clean up temporary file
            try { await fsPromises.unlink(tempInputPath); } catch (e) { }

            // Apply Metadata depending on the format
            if (metadata) {
                if (format === 'pdf') {
                    // Standard metadata handling for PDF documents
                    try {
                        const { PDFDocument } = require('pdf-lib');
                        const pdfBytes = await fsPromises.readFile(outputPath);
                        const pdfDoc = await PDFDocument.load(pdfBytes);
                        if (metadata.title) pdfDoc.setTitle(metadata.title);
                        if (metadata.subject) pdfDoc.setSubject(metadata.subject);
                        if (metadata.author) pdfDoc.setAuthor(metadata.author);
                        const modifiedPdfBytes = await pdfDoc.save();
                        await fsPromises.writeFile(outputPath, modifiedPdfBytes);
                    } catch (metaErr) {
                        console.log("[Warning] Failed to inject metadata into the PDF.", metaErr);
                    }
                } else if (format === 'docx' || format === 'pptx') {
                    // Metadata injection via internal XML modification (OpenXML)
                    try {
                        const JSZip = require('jszip');
                        const fileData = await fsPromises.readFile(outputPath);
                        const zip = await JSZip.loadAsync(fileData);

                        const coreXmlFile = zip.file("docProps/core.xml");
                        if (coreXmlFile) {
                            let coreXml = await coreXmlFile.async("string");

                            // Helper function to safely insert or update XML tags
                            const updateTag = (xml, tag, value) => {
                                if (!value) return xml;

                                // Escape XML special characters to prevent document corruption
                                const safeValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'i');

                                if (regex.test(xml)) {
                                    // Overwrite existing XML tag
                                    return xml.replace(regex, `<${tag}>${safeValue}</${tag}>`);
                                } else {
                                    // Insert new tag before the closing coreProperties tag
                                    return xml.replace('</cp:coreProperties>', `  <${tag}>${safeValue}</${tag}>\n</cp:coreProperties>`);
                                }
                            };

                            // Apply mapped metadata properties
                            coreXml = updateTag(coreXml, 'dc:title', metadata.title);
                            coreXml = updateTag(coreXml, 'dc:creator', metadata.author);
                            coreXml = updateTag(coreXml, 'cp:lastModifiedBy', metadata.author);
                            coreXml = updateTag(coreXml, 'dc:subject', metadata.subject);

                            // Overwrite the core.xml file within the in-memory ZIP archive
                            zip.file("docProps/core.xml", coreXml);

                            // Generate the updated buffer and commit to disk
                            const newZipContent = await zip.generateAsync({ type: 'nodebuffer' });
                            await fsPromises.writeFile(outputPath, newZipContent);
                        }
                    } catch (metaErr) {
                        console.log(`[Warning] Failed to inject metadata into ${format.toUpperCase()}:`, metaErr);
                    }
                }
            }

            resolve({ success: true });

        } catch (err) {
            reject(err);
        }
    });
});

function checkMSOfficeInstalled() {
    if (os.platform() !== 'win32') return false;

    // Common installation paths for MS Office (Word) in Windows
    const paths = [
        'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE',
        'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\WINWORD.EXE',
        'C:\\Program Files\\Microsoft Office\\Office16\\WINWORD.EXE',
        'C:\\Program Files (x86)\\Microsoft Office\\Office16\\WINWORD.EXE',
        'C:\\Program Files\\Microsoft Office\\root\\Office15\\WINWORD.EXE'
    ];

    for (let p of paths) {
        if (fs.existsSync(p)) return true;
    }
    return false;
}

// Handle IPC request to check if conversion engines are installed
ipcMain.handle('check-engines-availability', async () => {
    //const hasLibreOffice = false;

    const hasLibreOffice = getSystemLibreOfficePath() !== null;
    const hasMSOffice = checkMSOfficeInstalled();

    return { hasLibreOffice, hasMSOffice };
});

// IPC handler to retrieve hidden warning settings
ipcMain.handle('get-warning-settings', async () => {
    try {
        if (fs.existsSync(warningsPath)) {
            return JSON.parse(fs.readFileSync(warningsPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading warnings settings:', error);
    }
    return {};
});

// IPC handler to save the user's preference to hide a specific feature warning
ipcMain.handle('save-warning-settings', async (event, featureId) => {
    try {
        let settings = {};
        if (fs.existsSync(warningsPath)) {
            settings = JSON.parse(fs.readFileSync(warningsPath, 'utf8'));
        }
        // Flag the warning as disabled (true) for this specific feature (e.g., 'pdftodocx')
        settings[featureId] = true;
        fs.writeFileSync(warningsPath, JSON.stringify(settings, null, 2), 'utf8');
        return { success: true };
    } catch (error) {
        console.error('Error saving warnings settings:', error);
        throw error;
    }
});


// =========================================================
// GHOSTSCRIPT PATH RESOLVER
// Add this near getSystemLibreOfficePath() in main.js
// =========================================================

function getGhostscriptPath() {
    const platform = os.platform();

    if (platform === 'win32') {
        // Use the portable binary bundled with the app
        const gsPortable = app.isPackaged
            ? path.join(process.resourcesPath, 'win', 'bin', 'gswin64c.exe')
            : path.join(__dirname, 'resources', 'ghostscript', 'win', 'bin', 'gswin64c.exe')

        if (fs.existsSync(gsPortable)) return gsPortable;
        return null;
    }

    if (platform === 'darwin') {
        // Check common Homebrew paths first
        const macPaths = [
            '/usr/local/bin/gs',        // Homebrew Intel
            '/opt/homebrew/bin/gs',     // Homebrew Apple Silicon
            '/usr/bin/gs'
        ];
        for (const p of macPaths) {
            if (fs.existsSync(p)) return p;
        }
        // Last resort: check PATH
        try {
            const fromPath = execSync('which gs').toString().trim();
            if (fromPath && fs.existsSync(fromPath)) return fromPath;
        } catch (e) { }
        return null;
    }

    // Linux
    try {
        const fromPath = execSync('which gs').toString().trim();
        if (fromPath && fs.existsSync(fromPath)) return fromPath;
    } catch (e) { }
    return null;
}

// =========================================================
// IPC: CHECK GHOSTSCRIPT AVAILABILITY
// Add this near check-engines-availability in main.js
// =========================================================

ipcMain.handle('check-ghostscript-availability', async () => {
    const gsPath = getGhostscriptPath();
    return {
        hasGhostscript: gsPath !== null,
        platform: os.platform()   // 'win32' | 'darwin' | 'linux'
    };
});

// =========================================================
// IPC: COMPRESS PDF WITH GHOSTSCRIPT
// Add this near convert-with-libreoffice in main.js
// =========================================================

ipcMain.handle('compress-with-ghostscript', async (event, { fileData, fileName, outputPath, quality }) => {
    return new Promise(async (resolve, reject) => {
        const gsPath = getGhostscriptPath();
        if (!gsPath) return reject(new Error('Ghostscript not found on this system.'));

        // Write the uploaded file to a temp location beside the output
        const targetDir = path.dirname(outputPath);
        const tempInput = path.join(targetDir, `.gs_temp_${Date.now()}_${path.basename(fileName)}`);

        try {
            await fsPromises.writeFile(tempInput, Buffer.from(fileData));

            // Map quality preset to Ghostscript's -dPDFSETTINGS value
            // screen   → 72 dpi  (smallest)
            // ebook    → 150 dpi (balanced — default)
            // printer  → 300 dpi (high quality)
            // prepress → 300 dpi (maximum quality, for press)
            const validQualities = ['screen', 'ebook', 'printer', 'prepress'];
            const safeQuality = validQualities.includes(quality) ? quality : 'ebook';

            const command = [
                `"${gsPath}"`,
                '-dBATCH',
                '-dNOPAUSE',
                '-dQUIET',
                '-sDEVICE=pdfwrite',
                `-dPDFSETTINGS=/${safeQuality}`,
                '-dCompatibilityLevel=1.4',
                '-dEmbedAllFonts=true',
                '-dSubsetFonts=true',
                `-sOutputFile="${outputPath}"`,
                `"${tempInput}"`
            ].join(' ');

            exec(command, async (error, stdout, stderr) => {
                // Always clean up temp input
                try { await fsPromises.unlink(tempInput); } catch (e) { }

                if (error) {
                    console.error('[Ghostscript] Error:', stderr);
                    return reject(new Error('Ghostscript compression failed: ' + stderr));
                }

                // Return the output file size so the renderer can show savings
                try {
                    const stats = await fsPromises.stat(outputPath);
                    resolve({ success: true, outputSize: stats.size });
                } catch (statErr) {
                    reject(new Error('Output file not found after compression.'));
                }
            });

        } catch (err) {
            try { await fsPromises.unlink(tempInput); } catch (e) { }
            reject(err);
        }
    });
});

ipcMain.handle('open-external-url', (_, url) => {
    shell.openExternal(url);
});

// =========================================================
// IPC: PROTECT PDF WITH GHOSTSCRIPT (AES-256)
// Add this in main.js near the compress-with-ghostscript handler
// =========================================================
 
ipcMain.handle('protect-with-ghostscript', async (event, {
    fileData,
    fileName,
    outputPath,
    userPassword,
    ownerPassword,
    permissions,
}) => {
    return new Promise(async (resolve, reject) => {
        const gsPath = getGhostscriptPath();
        if (!gsPath) return reject(new Error('Ghostscript not found on this system.'));
 
        const targetDir  = path.dirname(outputPath);
        const tempInput  = path.join(targetDir, `.gs_protect_${Date.now()}_${path.basename(fileName)}`);
 
        try {
            await fsPromises.writeFile(tempInput, Buffer.from(fileData));
 
            // ── PDF Permission bitmask ──────────
            //
            // Bit positions (1-based, bit 1 = LSB):
            //   3  → printing (low res when bit 12 is also 0)
            //   4  → modifying document
            //   5  → copying text/graphics
            //   6  → annotating / filling forms (we leave this always on)
            //   9  → filling forms
            //   10 → content accessibility (always on)
            //   11 → document assembly
            //   12 → high-res printing (combined with bit 3)
 
            // Base: all permission bits set (bits 3-12 = 1, others per spec)
            // In decimal: bits 3,4,5,6,9,10,11,12 set = -4 in signed 32-bit (Ghostscript accepts negative)
            // We build it explicitly for clarity:
 
            let permBits = 0;
 
            // Bit 3 — print (low res)
            const allowPrint = permissions.printing !== 'none';
            if (allowPrint) permBits |= (1 << 2);
 
            // Bit 4 — modify document
            if (permissions.editing) permBits |= (1 << 3);
 
            // Bit 5 — copy text/graphics
            if (permissions.copying) permBits |= (1 << 4);
 
            // Bit 6 — annotate / fill forms (always allow)
            permBits |= (1 << 5);
 
            // Bit 9 — fill forms (always allow)
            permBits |= (1 << 8);
 
            // Bit 10 — content accessibility (always allow)
            permBits |= (1 << 9);
 
            // Bit 11 — document assembly (tied to editing)
            if (permissions.editing) permBits |= (1 << 10);
 
            // Bit 12 — high-res printing
            if (permissions.printing === 'highResolution') permBits |= (1 << 11);
 
            // Ghostscript expects the value as a signed 32-bit integer
            // The spec stores bits 1-2 as 0 and bits 13-32 as 1 (= 0xFFFFF000 in upper bits)
            // Combined with our permission bits:
            const gsPermissions = (permBits | 0xFFFFF000) >> 0; // ensure signed 32-bit
 
            // ── Build Ghostscript command ─────────────────────────────────
            const args = [
                '-dBATCH',
                '-dNOPAUSE',
                '-dQUIET',
                '-sDEVICE=pdfwrite',
                '-dEncryptionR=3',
                '-dKeyLength=128',
                `-dPermissions=${gsPermissions}`,
                `-sOutputFile="${outputPath}"`,
            ];
 
            // Passwords are optional — only add if provided
            if (userPassword)  args.push(`-sUserPassword=${userPassword}`);
            if (ownerPassword) args.push(`-sOwnerPassword=${ownerPassword}`);
 
            // Input file must be last
            args.push(`"${tempInput}"`);
 
            const command = `"${gsPath}" ${args.join(' ')}`;
 
            exec(command, async (error, stdout, stderr) => {
                try { await fsPromises.unlink(tempInput); } catch (e) {}
 
                if (error) {
                    console.error('[Ghostscript Protect] Error:', stderr);
                    return reject(new Error('Ghostscript protection failed: ' + stderr));
                }
 
                resolve({ success: true });
            });
 
        } catch (err) {
            try { await fsPromises.unlink(tempInput); } catch (e) {}
            reject(err);
        }
    });
});



//////SQUIRELL EXE INSTALLER CONFIG////////

//const app = require('app');

// this should be placed at top of main.js to handle setup events quickly
if (handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
    return;
}

function handleSquirrelEvent() {
    if (process.argv.length === 1) {
        return false;
    }

    const ChildProcess = require('child_process');

    const appFolder = path.resolve(process.execPath, '..');
    const rootAtomFolder = path.resolve(appFolder, '..');
    const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
    const exeName = path.basename(process.execPath);

    const spawn = function (command, args) {
        let spawnedProcess, error;

        try {
            spawnedProcess = ChildProcess.spawn(command, args, { detached: true });
        } catch (error) { }

        return spawnedProcess;
    };

    const spawnUpdate = function (args) {
        return spawn(updateDotExe, args);
    };

    const squirrelEvent = process.argv[1];
    switch (squirrelEvent) {
        case '--squirrel-install':
        case '--squirrel-updated':
            // Optionally do things such as:
            // - Add your .exe to the PATH
            // - Write to the registry for things like file associations and
            //   explorer context menus

            // Install desktop and start menu shortcuts
            spawnUpdate(['--createShortcut', exeName]);

            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-uninstall':
            // Undo anything you did in the --squirrel-install and
            // --squirrel-updated handlers

            // Remove desktop and start menu shortcuts
            spawnUpdate(['--removeShortcut', exeName]);

            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-obsolete':
            // This is called on the outgoing version of your app before
            // we update to the new version - it's the opposite of
            // --squirrel-updated

            app.quit();
            return true;
    }
};