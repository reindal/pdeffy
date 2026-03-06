const electron = require("electron");
const os = require('os');
const path = require("path");
const url = require("url");
const fs = require("fs");
const fsPromises = fs.promises;
const { BrowserWindow, app , ipcMain, dialog} = electron;
const { updateElectronApp, UpdateSourceType } = require('update-electron-app')
const pptxgen = require('pptxgenjs');
const { exec } = require('child_process');

if (require('electron-squirrel-startup')) return;

//updating app
updateElectronApp({
  updateSource: {
    type: UpdateSourceType.StaticStorage,
    baseUrl: `https://pdeffy.reindal.com/latest/`
  }
})

// Path to store settings
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'pdf-settings.json');
const languagePath = path.join(userDataPath, 'language-settings.json');
const firstLaunchMarkerPath = path.join(userDataPath, 'first-launch-complete.json');
const warningsPath = path.join(userDataPath, 'warnings-settings.json');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false,
        icon: path.join(__dirname, "assets", "logo", "png", "256x256.png")
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
                return require('child_process').execSync('where soffice').toString().trim(); 
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
            try { 
                return require('child_process').execSync('which libreoffice').toString().trim(); 
            } catch (e) { 
                try { 
                    return require('child_process').execSync('which soffice').toString().trim(); 
                } catch (err) { 
                    return null; 
                }
            }
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
                try { await fsPromises.unlink(psPath); } catch (e) {} 
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
            const tempDir = app.getPath('temp');
            // Parse clean name to avoid double extensions (e.g., file.pdf.pdf -> file.pdf)
            const parsedName = path.parse(fileName).name;
            const uniqueFileName = Date.now() + '_' + parsedName + path.parse(fileName).ext;
            const tempInputPath = path.join(tempDir, uniqueFileName);

            await fsPromises.writeFile(tempInputPath, Buffer.from(fileData));
            const outputDir = path.dirname(outputPath);
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
                    try { await fsPromises.unlink(tempInputPath); } catch (e) {}
                    return reject(new Error("LibreOffice installation not found."));
                }

                console.log(`[Conversion] Using system LibreOffice for ${format.toUpperCase()} conversion...`);
                
                // Input filter to force LibreOffice Writer for PDF imports instead of Draw
                let infilter = "";
                if (isPdfInput && format === 'docx') {
                    infilter = `--infilter="writer_pdf_import" `;
                }

                // Execute headless conversion command
                const command = `"${libreOfficePath}" --headless ${infilter}--convert-to ${format} "${tempInputPath}" --outdir "${outputDir}"`;
                
                await new Promise((res, rej) => {
                    exec(command, async (error, stdout, stderr) => {
                        if (error) {
                            console.error("LibreOffice execution error:", stderr);
                            return rej(new Error("LibreOffice conversion failed."));
                        }
                        
                        try {
                            // LibreOffice saves the file with the same base name but a new extension
                            const baseName = path.parse(tempInputPath).name;
                            const generatedFilePath = path.join(outputDir, baseName + `.${format}`);

                            // Rename the generated file to the user's requested path
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

            // Clean up temporary file
            try { await fsPromises.unlink(tempInputPath); } catch (e) {}

            // Apply PDF metadata
            if (metadata && format === 'pdf') {
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
                    console.log("[Warning] Failed to inject metadata into the PDF.");
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
    const hasLibreOffice = getSystemLibreOfficePath() !== null;
    // const hasMSOffice = checkMSOfficeInstalled();
    
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

  const spawn = function(command, args) {
    let spawnedProcess, error;

    try {
      spawnedProcess = ChildProcess.spawn(command, args, {detached: true});
    } catch (error) {}

    return spawnedProcess;
  };

  const spawnUpdate = function(args) {
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