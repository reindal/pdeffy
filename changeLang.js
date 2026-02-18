var { ipcRenderer } = require('electron');
window.currentLanguage = 'en';

const languages = {
    en: {
        languageText: "Language",
        welcomeText: "Welcome to the PDF Converter",
        splitPdfText: "Split PDF",
        splitPdfDesc: "Split your PDF document into multiple files.",
        mergePdfText: "Merge PDF",
        mergePdfDesc: "Merge your PDF documents into single file.",
        imageToPdfText: "Image to PDF",
        imageToPdfDesc: "Convert one or more images into a PDF document.",
        pdfToImageText: "PDF to Image",
        pdfToImageDesc: "Convert PDF pages into image files.",
        watermarkText: "Add Watermark",
        watermarkDesc: "Add a watermark to your PDF document.",
        pdfToDocxText: "PDF to DOCX",
        pdfToDocxDesc: "Convert PDF document to DOCX format.",
        removeBtn: "Remove",
        backLink: "← Back to main page",
        selectedFile: "✓ Selected file: ",

        // Merge PDF
        mergeHeader: "Merge PDF",
        mergeHeader2: "Merge PDF Documents",
        mergeSelectLabel: "Select PDF files (can select multiple):",
        mergeSelectButton: "Click to select files",
        filesOrderTitle: "Files Order",
        mergeHelpText: "Drag to reorder files (top to bottom = first to last in merged PDF)",
        mergeOutputName: "Output file name:",
        mergeSubmitBtn: "Merge PDF",
        outputName: "merged_document",
        // Merge PDF messages
        pleaseSelectAtLeastOnePdf: "Please select at least one PDF file",
        pleaseSelectAtLeastTwoPdfs: "Please select at least two PDF files to merge",
        processingFiles: "Processing {count} file(s)...",
        successMerged: "✓ Successfully created merged PDF: {filename} in Downloads folder!",

        // Split PDF
        splitHeader: "Split PDF",
        splitHeader2: "Split PDF Document",
        splitSelectBtnLabel: "Select PDF to split",
        splitSelectButton: "Select PDF",
        splitPageRangesLabel: "Select page ranges to extract:",
        addRangeBtn: "+ Add Another Range",
        outputSplitName: "Output file name:",
        namesSplitExamples: "Files will be named: name_1.pdf, name_2.pdf etc.",
        splitSubmitBtn: "Split PDF",
        startPageLabel: "Start page:",
        endPageLabel: "End page:",
        rangeError: "At least one range is required",
        createdSuccesful: '✓ Successfully created ${successCount} file(s) in Downloads folder',
        // Split PDF messages
        pleaseSelectFile: "Please select a PDF file",
        pageNumbersGreaterThanZero: "Page numbers must be greater than 0",
        startPageCannotBeGreater: "Start page cannot be greater than end page",
        pdfHasOnlyPages: "PDF has only {total} pages. Please select valid page range.",
        pleaseAddAtLeastOneRange: "Please add at least one page range",
        intervalAtLeastOne: "Interval must be at least 1",
        pleaseAddAtLeastOneOutputFile: "Please add at least one output file",
        pleaseEnterValidFileSize: "Please enter a valid file size",
        cannotSplitMinSize: "Cannot split: minimum required size is {size} (smallest page size)",
        successSplitFiles: "✓ Successfully created {count} file(s) in Downloads folder!",
        successSplitFilesPath: "✓ Saved {count} file(s) in:\n{path}",
        successSplitFilesZip: "✓ Saved {count} file(s) as ZIP in:\n{path}",
        atLeastOneRangeRequired: "You must have at least one range",
        atLeastOneFileRequired: "You must have at least one output file",
        eachFileMustHaveRange: "Each file must have at least one range",

        // Image to PDF
        imageToPdfHeader: "Image to PDF",
        imageToPdfHeader2: "Convert Images to PDF",
        imageToPdfSelectLabel: "Select image files (can select multiple):",
        imageToPdfSelectButton: "Click to select images",
        imagesOrderTitle: "Images Order",
        imageToPdfHelpText: "Drag to reorder images (top to bottom = first to last page in PDF)",
        imageToPdfOutputName: "Output file name:",
        imageToPdfSubmitBtn: "Create PDF",
        // Image to PDF messages
        pleaseSelectAtLeastOneImage: "Please select at least one image",
        creatingPdf: "Creating PDF...",
        successPdfCreated: "✓ PDF created successfully: {filename}",
        successPdfCreatedPath: "✓ Saved PDF: {filename}\nin: {path}",

        // PDF to Image
        pdfToImageHeader: "PDF to Image",
        pdfToImageHeader2: "Convert PDF to Images",
        pdfToImageSelectLabel: "Select PDF file:",
        pdfToImageSelectButton: "Click to select PDF",
        pagesPreviewTitle: "PDF Pages Preview",
        togglePreviewText: "Hide preview",
        pdfToImageFormatLabel: "Output image format:",
        pdfToImageOutputName: "Output file name prefix:",
        pdfToImageNamesExample: "Files will be named: prefix_1.png, prefix_2.png etc.",
        pdfToImageSubmitBtn: "Convert to Images",
        // PDF to Image messages
        loadingPdf: "Loading PDF...",
        errorLoadingPdf: "Error loading PDF: {error}",
        pleaseSelectPdfFirst: "Please select a PDF file first",
        convertingPages: "Converting {count} page(s) to images...",
        convertingPage: "Converting page {current} of {total}...",
        successConverted: "✓ Successfully converted {count} page(s) to {format} images",
        successConvertedPath: "✓ Saved {count} {format} image(s) in:\n{path}",
        successConvertedZip: "✓ Saved {count} {format} image(s) as ZIP in:\n{path}",

        // Watermark
        watermarkHeader: "Add Watermark",
        watermarkHeader2: "Add Watermark to PDF",
        watermarkSelectLabel: "Select PDF file:",
        watermarkSelectButton: "Click to select file",
        watermarkTextLabel: "Watermark text:",
        fontSizeLabel: "Font size:",
        opacityLabel: "Opacity (0-100%):",
        rotationLabel: "Rotation angle:",
        colorLabel: "Text color:",
        positionLabel: "Position:",
        outputNameLabel: "Output file name:",
        watermarkSubmitBtn: "Apply Watermarks to PDF",
        previewTitle: "Watermark Preview",
        previewHint: "Preview shows how watermark(s) will appear on your PDF",
        layersTitle: "Watermark Layers",
        watermarkSettingsTitle: "Watermark Settings",
        addLayerBtnText: "+ Add Watermark Layer",
        // Watermark messages
        pleaseSelectPdf: "Please select a PDF file",
        pleaseEnterWatermark: "Please enter watermark text",
        processingFile: "Adding watermarks...",
        successWatermark: "✓ Successfully created watermarked PDF: {filename}!",
        invalidHexColor: "Invalid color format. Use #RRGGBB (e.g., #FF0000)",
        invalidRotation: "Rotation angle must be between -360 and 360 degrees",
        pleaseEnterValidColor: "Please enter a valid HEX color",
        pleaseAddAtLeastOneLayer: "Please add at least one watermark layer",
        layerAdded: "✓ Watermark layer added successfully!",
        layerRemoved: "✓ Watermark layer removed",
        updateLayerBtn: "✓ Update Layer",
        editBtn: "Edit",
        fontSize: "Size",
        opacity: "Opacity",
        rotation: "Rotation",
        color: "Color",

        // Docx to PDF
        docxToPdfText: "DOCX to PDF",
        docxToPdfDesc: "Convert DOCX documents into a PDF file.",
        docxToPdfHeader: "Docx to PDF",
        docxToPdfHeader2: "Convert Word to PDF",
        docxToPdfSelectLabel: "Select Word file (.docx):",
        docxToPdfSelectButton: "Click to select file",
        docxToPdfSubmitBtn: "Convert to PDF",
        // Docx to PDF messages
        pleaseSelectDocx: "Please select a .docx file",
        convertingDocx: "Converting Word document...",
        successDocxCreated: "✓ PDF created successfully",
        successPdfCreatedPath: "✓ Saved PDF: {filename}\nin: {path}",
        errorDocx: "Error converting Docx: ",

        // Delete pages
        deletePagesText: "Delete Pages",
        deletePagesDesc: "Delete Pages from PDF",
        deleteSelectLabel: "Select a PDF file:",
        deleteSelectButton: "Click to select file",
        deletePreviewTitle: "Click the pages you want to delete",
        deleteHelpText: "Pages marked with X will be deleted.",
        deleteSubmitBtn: "Generate PDF without selected pages",
        // Delete pages messages
        loadingPreview: 'Loading preview...',
        mustLeaveAtLeastOnePage: 'You must leave at least one page unselected.',
        processing: 'Processing...',
        successDeleted: 'Successfully created PDF: {filename}',
        errorPrefix: 'Error: ',

        // PDF to DOCX
        pdfToDocxHeader: "PDF to DOCX",
        pdfToDocxHeader2: "Convert PDF to DOCX",
        pdfToDocxSelectLabel: "Select PDF file:",
        pdfToDocxSelectButton: "Click to select file",
        pdfToDocxOutputLabel: "Output file name:",
        pdfToDocxSubmitBtn: "Convert to DOCX",
        // PDF to DOCX messages
        successPdfConverted: "✓ Successfully converted PDF to DOCX: {filename} in Downloads folder!",

        // General / Shared messages
        errorPrefix: "Error: ",
        processing: "Processing",
        saveCancelled: "Save cancelled",

        // Split mode labels
        splitModeLabel: "Split mode:",
        modeRange: "Custom Page Ranges",
        modeEvery: "Split Every X Pages",
        modeCustom: "Custom Multi-Range Files",
        modeSize: "Split by File Size",

        // Range mode
        rangeSelectLabel: "Select page ranges to extract:",

        // Every mode
        everyPagesLabel: "Split every X pages:",
        everyPagesHelpText: "PDF will be split into documents of this many pages each",

        // Custom mode
        outputFileLabel: "Output file",
        removeFileBtn: "Remove File",
        addRangeToFileBtn: "+ Add Range to This File",
        customRangesLabel: "Define output files with multiple page ranges:",
        addCustomFileBtn: "+ Add Another Output File",
        customHelpText: "Each output file can contain multiple page ranges (e.g., pages 1-4 and 6-12 in one file)",

        // Size mode
        maxFileSizeLabel: "Maximum file size per output:",
        sizeHelpText: "PDF will be split into files not exceeding this size",
        currentFileSize: "Current file size: ",

        // Read-only checkbox
        readOnlyLabel: "Make PDF read-only",

        // Save as ZIP checkbox
        saveAsZipLabel: "Save as ZIP",

        // Settings
        settingsTitle: "Settings",
        changeLanguageTitle: "Change Language:",
        metadataTitle: "PDF Metadata",
        authorLabel: "Author:",
        titleLabel: "Title:",
        subjectLabel: "Subject:",
        saveSettings: "Save Settings",
        cancelSettings: "Cancel",
        settingsSaved: "Settings saved!",
        metaAuthor: "Enter author name",
        metaTitle: "Enter document title",
        metaSubject: "Enter document subject"
    },
    it: {
        languageText: "Lingua",
        welcomeText: "Benvenuto al Convertitore PDF",
        splitPdfText: "Dividi PDF",
        splitPdfDesc: "Dividi il tuo documento PDF in più file.",
        mergePdfText: "Unisci PDF",
        mergePdfDesc: "Unisci i tuoi documenti PDF in un unico file.",
        imageToPdfText: "Immagine a PDF",
        imageToPdfDesc: "Converti una o più immagini in un documento PDF.",
        pdfToImageText: "PDF a Immagine",
        pdfToImageDesc: "Converti le pagine PDF in file immagine.",
        watermarkText: "Aggiungi Filigrana",
        watermarkDesc: "Aggiungi una filigrana al tuo documento PDF.",
        pdfToDocxText: "PDF a DOCX",
        pdfToDocxDesc: "Converti documento PDF in formato DOCX.",
        removeBtn: "Rimuovi",
        backLink: "← Torna alla pagina principale",
        selectedFile: "✓ File selezionato: ",

        // Merge PDF
        mergeHeader: "Unisci file PDF",
        mergeHeader2: "Unisci documenti PDF",
        mergeSelectLabel: "Seleziona file PDF (puoi selezionare più file):",
        mergeSelectButton: "Clicca per selezionare i file",
        filesOrderTitle: "Ordine dei file",
        mergeHelpText: "Trascina per riordinare i file (dall'alto al basso = dal primo all'ultimo nel PDF unito)",
        mergeOutputName: "Nome file di output:",
        mergeSubmitBtn: "Unisci PDF",
        outputName: "documento_unito",
        // Merge PDF messages
        pleaseSelectAtLeastOnePdf: "Seleziona almeno un file PDF",
        pleaseSelectAtLeastTwoPdfs: "Seleziona almeno due file PDF da unire",
        processingFiles: "Elaborazione di {count} file...",
        successMerged: "✓ PDF unito creato con successo: {filename} nella cartella Download!",

        // Split PDF
        splitHeader: "Dividi PDF",
        splitHeader2: "Dividi documento PDF",
        splitSelectBtnLabel: "Seleziona PDF da dividere",
        splitSelectButton: "Seleziona PDF",
        splitPageRangesLabel: "Seleziona le pagine da estrarre:",
        addRangeBtn: "+ Aggiungi un'altra fascia",
        outputSplitName: "Nome file di output:",
        namesSplitExamples: "I file saranno denominati: nome_1.pdf, nome_2.pdf ecc.",
        splitSubmitBtn: "Dividi PDF",
        startPageLabel: "Pagina iniziale:",
        endPageLabel: "Pagina finale:",
        rangeError: "Almeno una fascia è richiesta",
        createdSuccesful: '✓ Creato con successo ${successCount} file in cartella Download',
        // Split PDF messages
        pleaseSelectFile: "Seleziona un file PDF",
        pageNumbersGreaterThanZero: "I numeri di pagina devono essere maggiori di 0",
        startPageCannotBeGreater: "La pagina iniziale non può essere maggiore della pagina finale",
        pdfHasOnlyPages: "Il PDF ha solo {total} pagine. Seleziona un intervallo di pagine valido.",
        pleaseAddAtLeastOneRange: "Aggiungi almeno un intervallo di pagine",
        intervalAtLeastOne: "L'intervallo deve essere almeno 1",
        pleaseAddAtLeastOneOutputFile: "Aggiungi almeno un file di output",
        pleaseEnterValidFileSize: "Inserisci una dimensione file valida",
        cannotSplitMinSize: "Impossibile dividere: la dimensione minima richiesta è {size} (dimensione pagina più piccola)",
        successSplitFiles: "✓ Creati con successo {count} file nella cartella Download!",
        successSplitFilesPath: "✓ Salvati {count} file in:\n{path}",
        successSplitFilesZip: "✓ Salvati {count} file come ZIP in:\n{path}",
        atLeastOneRangeRequired: "Devi avere almeno un intervallo",
        atLeastOneFileRequired: "Devi avere almeno un file di output",
        eachFileMustHaveRange: "Ogni file deve avere almeno un intervallo",

        // Image to PDF
        imageToPdfHeader: "Immagine a PDF",
        imageToPdfHeader2: "Converti Immagini in PDF",
        imageToPdfSelectLabel: "Seleziona file immagine (puoi selezionare più file):",
        imageToPdfSelectButton: "Clicca per selezionare immagini",
        imagesOrderTitle: "Ordine delle Immagini",
        imageToPdfHelpText: "Trascina per riordinare le immagini (dall'alto al basso = dalla prima all'ultima pagina nel PDF)",
        imageToPdfOutputName: "Nome file di output:",
        imageToPdfSubmitBtn: "Crea PDF",
        // Image to PDF messages
        pleaseSelectAtLeastOneImage: "Seleziona almeno un'immagine",
        creatingPdf: "Creazione PDF...",
        successPdfCreated: "✓ PDF creato con successo: {filename}",
        successPdfCreatedPath: "✓ PDF salvato: {filename}\nin: {path}",

        // PDF to Image
        pdfToImageHeader: "PDF a Immagine",
        pdfToImageHeader2: "Converti PDF in Immagini",
        pdfToImageSelectLabel: "Seleziona file PDF:",
        pdfToImageSelectButton: "Clicca per selezionare PDF",
        pagesPreviewTitle: "Anteprima Pagine PDF",
        togglePreviewText: "Nascondi anteprima",
        pdfToImageFormatLabel: "Formato immagine di output:",
        pdfToImageOutputName: "Prefisso nome file di output:",
        pdfToImageNamesExample: "I file saranno denominati: prefisso_1.png, prefisso_2.png ecc.",
        pdfToImageSubmitBtn: "Converti in Immagini",
        // PDF to Image messages
        loadingPdf: "Caricamento PDF...",
        errorLoadingPdf: "Errore nel caricamento del PDF: {error}",
        pleaseSelectPdfFirst: "Seleziona prima un file PDF",
        convertingPages: "Conversione di {count} pagina/e in immagini...",
        convertingPage: "Conversione pagina {current} di {total}...",
        successConverted: "✓ Convertite con successo {count} pagina/e in immagini {format}",
        successConvertedPath: "✓ Salvate {count} immagini {format} in:\n{path}",
        successConvertedZip: "✓ Salvate {count} immagini {format} come ZIP in:\n{path}",

        // Watermark
        watermarkHeader: "Aggiungi Filigrana",
        watermarkHeader2: "Aggiungi Filigrana al PDF",
        watermarkSelectLabel: "Seleziona file PDF:",
        watermarkSelectButton: "Clicca per selezionare file",
        watermarkTextLabel: "Testo della filigrana:",
        fontSizeLabel: "Dimensione carattere:",
        opacityLabel: "Opacità (0-100%):",
        rotationLabel: "Angolo di rotazione:",
        colorLabel: "Colore del testo:",
        positionLabel: "Posizione:",
        outputNameLabel: "Nome file di output:",
        watermarkSubmitBtn: "Applica Filigrane al PDF",
        previewTitle: "Anteprima Filigrana",
        previewHint: "L'anteprima mostra come appariranno le filigrane sul tuo PDF",
        layersTitle: "Livelli Filigrana",
        watermarkSettingsTitle: "Impostazioni Filigrana",
        addLayerBtnText: "+ Aggiungi Livello Filigrana",
        // Watermark messages
        pleaseSelectPdf: "Seleziona un file PDF",
        pleaseEnterWatermark: "Inserisci il testo della filigrana",
        processingFile: "Aggiunta filigrane...",
        successWatermark: "✓ PDF con filigrana creato con successo: {filename}!",
        invalidHexColor: "Formato colore non valido. Usa #RRGGBB (es. #FF0000)",
        invalidRotation: "L'angolo di rotazione deve essere tra -360 e 360 gradi",
        pleaseEnterValidColor: "Inserisci un colore HEX valido",
        pleaseAddAtLeastOneLayer: "Aggiungi almeno un livello di filigrana",
        layerAdded: "✓ Livello di filigrana aggiunto con successo!",
        layerRemoved: "✓ Livello di filigrana rimosso",
        updateLayerBtn: "✓ Aggiorna Livello",
        editBtn: "Modifica",
        fontSize: "Dimensione",
        opacity: "Opacità",
        rotation: "Rotazione",
        color: "Colore",

        // Docx to PDF
        docxToPdfText: "DOCX a PDF",
        docxToPdfDesc: "Convertire documenti DOCX in un file PDF.",
        docxToPdfHeader: "Docx in PDF",
        docxToPdfHeader2: "Converti Word in PDF",
        docxToPdfSelectLabel: "Seleziona il file Word (.docx):",
        docxToPdfSelectButton: "Clicca per selezionare il file",
        docxToPdfSubmitBtn: "Converti in PDF",
        // Docx to PDF messages
        pleaseSelectDocx: "Per favore, seleziona un file .docx",
        convertingDocx: "Conversione del documento Word...",
        successDocxCreated: "✓ PDF creato con successo",
        successPdfCreatedPath: "✓ PDF salvato: {filename}\nin: {path}",
        errorDocx: "Errore durante la conversione del Docx: ",

        // Delete pages
        deletePagesText: "Elimina Pagine",
        deletePagesDesc: "Elimina pagine dal PDF",
        deleteSelectLabel: "Seleziona un file PDF:",
        deleteSelectButton: "Clicca per selezionare il file",
        deletePreviewTitle: "Clicca sulle pagine che vuoi eliminare",
        deleteHelpText: "Le pagine segnate con X verranno eliminate.",
        deleteSubmitBtn: "Genera PDF senza le pagine selezionate",
        // Delete pages messages
        loadingPreview: 'Caricamento anteprima...',
        mustLeaveAtLeastOnePage: 'Devi lasciare almeno una pagina non selezionata.',
        processing: 'Elaborazione...',
        successDeleted: 'PDF creato con successo: {filename}',
        saveCancelled: 'Salvataggio annullato',
        errorPrefix: 'Errore: ',

        // PDF to DOCX
        pdfToDocxHeader: "PDF a DOCX",
        pdfToDocxHeader2: "Converti PDF in DOCX",
        pdfToDocxSelectLabel: "Seleziona file PDF:",
        pdfToDocxSelectButton: "Clicca per selezionare file",
        pdfToDocxOutputLabel: "Nome file di output:",
        pdfToDocxSubmitBtn: "Converti in DOCX",
        // PDF to DOCX messages
        successPdfConverted: "✓ PDF convertito in DOCX con successo: {filename} nella cartella Download!",

        // General / Shared messages
        errorPrefix: "Errore: ",
        processing: "Elaborazione",
        saveCancelled: "Salvataggio annullato",

        // Split mode labels
        splitModeLabel: "Modalità di divisione:",
        modeRange: "Intervalli di pagine personalizzati",
        modeEvery: "Dividi ogni X pagine",
        modeCustom: "File multi-intervallo personalizzati",
        modeSize: "Dividi per dimensione file",

        // Range mode
        rangeSelectLabel: "Seleziona gli intervalli di pagine da estrarre:",

        // Every mode
        everyPagesLabel: "Dividi ogni X pagine:",
        everyPagesHelpText: "Il PDF sarà diviso in documenti con questo numero di pagine ciascuno",

        // Custom mode
        outputFileLabel: "File di output",
        removeFileBtn: "Rimuovi file",
        addRangeToFileBtn: "+ Aggiungi intervallo a questo file",
        customRangesLabel: "Definisci file di output con più intervalli di pagine:",
        addCustomFileBtn: "+ Aggiungi un altro file di output",
        customHelpText: "Ogni file di output può contenere più intervalli di pagine (es. pagine 1-4 e 6-12 in un file)",

        // Size mode
        maxFileSizeLabel: "Dimensione massima per file:",
        sizeHelpText: "Il PDF sarà diviso in file che non superano questa dimensione",
        currentFileSize: "Dimensione file attuale: ",

        // Read-only checkbox
        readOnlyLabel: "Rendi PDF di sola lectura",

        // Save as ZIP checkbox
        saveAsZipLabel: "Salva come ZIP",

        // Settings
        settingsTitle: "Impostazioni",
        changeLanguageTitle: "Cambiare Lingua:",
        metadataTitle: "Metadati PDF",
        authorLabel: "Autore:",
        titleLabel: "Titolo:",
        subjectLabel: "Argomento:",
        saveSettings: "Salva Impostazioni",
        cancelSettings: "Annulla",
        settingsSaved: "Impostazioni salvate!",
        metaAuthor: "Inserisci il nome dell'autore",
        metaTitle: "Inserisci il titolo del documento",
        metaSubject: "Inserisci l'oggetto del documento"
    },
    pl: {
        languageText: "Język",
        welcomeText: "Witamy w Konwerterze PDF",
        splitPdfText: "Podziel PDF",
        splitPdfDesc: "Podziel swój dokument PDF na wiele plików.",
        mergePdfText: "Scal PDF",
        mergePdfDesc: "Scal swoje dokumenty PDF w jeden plik.",
        imageToPdfText: "Obrazy do PDF",
        imageToPdfDesc: "Konwertuj jeden lub więcej obrazów na dokument PDF.",
        pdfToImageText: "PDF do Obrazów",
        pdfToImageDesc: "Konwertuj strony PDF na pliki obrazów.",
        watermarkText: "Dodaj Znak Wodny",
        watermarkDesc: "Dodaj znak wodny do swojego dokumentu PDF.",
        pdfToDocxText: "PDF do DOCX",
        pdfToDocxDesc: "Konwertuj dokument PDF na format DOCX.",
        removeBtn: "Usuń",
        backLink: "← Powrót do strony głównej",
        selectedFile: "✓ Wybrano plik: ",

        // Merge PDF
        mergeHeader: "Scal PDF",
        mergeHeader2: "Scal dokumenty PDF",
        mergeSelectLabel: "Wybierz pliki PDF (możesz wybrać wiele):",
        mergeSelectButton: "Kliknij, aby wybrać pliki",
        filesOrderTitle: "Kolejność plików",
        mergeHelpText: "Przeciągnij, aby zmienić kolejność (od góry do dołu = od pierwszego do ostatniego w scalonym PDF)",
        mergeOutputName: "Nazwa pliku wynikowego:",
        mergeSubmitBtn: "Scal PDF",
        outputName: "scalony_dokument",
        // Merge PDF messages
        pleaseSelectAtLeastOnePdf: "Proszę wybrać co najmniej jeden plik PDF",
        pleaseSelectAtLeastTwoPdfs: "Proszę wybrać co najmniej dwa pliki PDF do scalenia",
        processingFiles: "Przetwarzanie {count} plik(ów)...",
        successMerged: "✓ Pomyślnie utworzono scalony PDF: {filename} w folderze Pobrane!",

        // Split PDF
        splitHeader: "Podziel PDF",
        splitHeader2: "Podziel dokument PDF",
        splitSelectBtnLabel: "Wybierz PDF do podzielenia",
        splitSelectButton: "Wybierz PDF",
        splitPageRangesLabel: "Wybierz zakresy stron do wyodrębnienia:",
        addRangeBtn: "+ Dodaj kolejny zakres",
        outputSplitName: "Nazwa pliku wynikowego:",
        namesSplitExamples: "Pliki będą nazwane: nazwa_1.pdf, nazwa_2.pdf itd.",
        splitSubmitBtn: "Podziel PDF",
        startPageLabel: "Strona początkowa:",
        endPageLabel: "Strona końcowa:",
        rangeError: "Wymagany jest co najmniej jeden zakres",
        // Split PDF messages
        pleaseSelectFile: "Proszę wybrać plik PDF",
        pageNumbersGreaterThanZero: "Numery stron muszą być większe niż 0",
        startPageCannotBeGreater: "Strona początkowa nie może być większa niż strona końcowa",
        pdfHasOnlyPages: "PDF ma tylko {total} stron. Proszę wybrać prawidłowy zakres stron.",
        pleaseAddAtLeastOneRange: "Dodaj co najmniej jeden zakres stron",
        intervalAtLeastOne: "Interwał musi wynosić co najmniej 1",
        pleaseAddAtLeastOneOutputFile: "Dodaj co najmniej jeden plik wyjściowy",
        pleaseEnterValidFileSize: "Wprowadź prawidłowy rozmiar pliku",
        cannotSplitMinSize: "Nie można podzielić: minimalny wymagany rozmiar to {size} (rozmiar najmniejszej strony)",
        successSplitFiles: "✓ Pomyślnie utworzono {count} plik(ów) w folderze Pobrane!",
        successSplitFilesPath: "✓ Zapisano {count} plik(ów) w:\n{path}",
        successSplitFilesZip: "✓ Zapisano {count} plik(ów) jako ZIP w:\n{path}",
        atLeastOneRangeRequired: "Musisz mieć co najmniej jeden zakres",
        atLeastOneFileRequired: "Musisz mieć co najmniej jeden plik wyjściowy",
        eachFileMustHaveRange: "Każdy plik musi mieć co najmniej jeden zakres",

        // Image to PDF
        imageToPdfHeader: "Obrazy do PDF",
        imageToPdfHeader2: "Konwertuj Obrazy do PDF",
        imageToPdfSelectLabel: "Wybierz pliki obrazów (możesz wybrać wiele):",
        imageToPdfSelectButton: "Kliknij, aby wybrać obrazy",
        imagesOrderTitle: "Kolejność Obrazów",
        imageToPdfHelpText: "Przeciągnij, aby zmienić kolejność (od góry do dołu = od pierwszej do ostatniej strony w PDF)",
        imageToPdfOutputName: "Nazwa pliku wynikowego:",
        imageToPdfSubmitBtn: "Utwórz PDF",
        // Image to PDF messages
        pleaseSelectAtLeastOneImage: "Proszę wybrać co najmniej jeden obraz",
        creatingPdf: "Tworzenie PDF...",
        successPdfCreated: "✓ PDF utworzony pomyślnie: {filename}",
        successPdfCreatedPath: "✓ Zapisano PDF: {filename}\nw: {path}",

        // PDF to Image
        pdfToImageHeader: "PDF do Obrazów",
        pdfToImageHeader2: "Konwertuj PDF na Obrazy",
        pdfToImageSelectLabel: "Wybierz plik PDF:",
        pdfToImageSelectButton: "Kliknij, aby wybrać PDF",
        pagesPreviewTitle: "Podgląd Stron PDF",
        togglePreviewText: "Ukryj podgląd",
        pdfToImageFormatLabel: "Format obrazu wyjściowego:",
        pdfToImageOutputName: "Prefiks nazwy pliku wynikowego:",
        pdfToImageNamesExample: "Pliki będą nazwane: prefiks_1.png, prefiks_2.png itd.",
        pdfToImageSubmitBtn: "Konwertuj na Obrazy",
        // PDF to Image messages
        loadingPdf: "Ładowanie PDF...",
        errorLoadingPdf: "Błąd ładowania PDF: {error}",
        pleaseSelectPdfFirst: "Najpierw wybierz plik PDF",
        convertingPages: "Konwersja {count} stron(y) na obrazy...",
        convertingPage: "Konwersja strony {current} z {total}...",
        successConverted: "✓ Pomyślnie przekonwertowano {count} stron(y) na obrazy {format}",
        successConvertedPath: "✓ Zapisano {count} obraz(ów) {format} w:\n{path}",
        successConvertedZip: "✓ Zapisano {count} obraz(ów) {format} jako ZIP w:\n{path}",

        // Watermark
        watermarkHeader: "Dodaj Znak Wodny",
        watermarkHeader2: "Dodaj Znak Wodny do PDF",
        watermarkSelectLabel: "Wybierz plik PDF:",
        watermarkSelectButton: "Kliknij, aby wybrać plik",
        watermarkTextLabel: "Tekst znaku wodnego:",
        fontSizeLabel: "Rozmiar czcionki:",
        opacityLabel: "Przezroczystość (0-100%):",
        rotationLabel: "Kąt obrotu:",
        colorLabel: "Kolor tekstu:",
        positionLabel: "Pozycja:",
        outputNameLabel: "Nazwa pliku wynikowego:",
        watermarkSubmitBtn: "Zastosuj Znaki Wodne do PDF",
        previewTitle: "Podgląd Znaku Wodnego",
        previewHint: "Podgląd pokazuje jak znaki wodne będą wyglądać na PDF",
        layersTitle: "Warstwy Znaków Wodnych",
        watermarkSettingsTitle: "Ustawienia Znaku Wodnego",
        addLayerBtnText: "+ Dodaj Warstwę Znaku Wodnego",
        // Watermark messages
        pleaseSelectPdf: "Proszę wybrać plik PDF",
        pleaseEnterWatermark: "Proszę wprowadzić tekst znaku wodnego",
        processingFile: "Dodawanie znaków wodnych...",
        successWatermark: "✓ Pomyślnie utworzono PDF ze znakiem wodnym: {filename}!",
        invalidHexColor: "Nieprawidłowy format koloru. Użyj #RRGGBB (np. #FF0000)",
        invalidRotation: "Kąt obrotu musi być między -360 a 360 stopni",
        pleaseEnterValidColor: "Proszę wprowadzić prawidłowy kolor HEX",
        pleaseAddAtLeastOneLayer: "Proszę dodać co najmniej jedną warstwę znaku wodnego",
        layerAdded: "✓ Warstwa znaku wodnego dodana pomyślnie!",
        layerRemoved: "✓ Warstwa znaku wodnego usunięta",
        updateLayerBtn: "✓ Aktualizuj Warstwę",
        editBtn: "Edytuj",
        fontSize: "Rozmiar",
        opacity: "Przezroczystość",
        rotation: "Obrót",
        color: "Kolor",

        // Docx to PDF
        docxToPdfText: "DOCX do PDF",
        docxToPdfDesc: "Konwertuj dokumenty DOCX do pliku PDF.",
        docxToPdfHeader: "Docx na PDF",
        docxToPdfHeader2: "Konwertuj Word na PDF",
        docxToPdfSelectLabel: "Wybierz plik Word (.docx):",
        docxToPdfSelectButton: "Kliknij, aby wybrać plik",
        docxToPdfSubmitBtn: "Konwertuj na PDF",
        // Docx to PDF messages
        pleaseSelectDocx: "Proszę wybrać plik .docx",
        convertingDocx: "Konwertowanie dokumentu Word...",
        successDocxCreated: "✓ PDF utworzony pomyślnie",
        successPdfCreatedPath: "✓ Zapisano PDF: {filename}\nw: {path}",
        errorDocx: "Błąd podczas konwersji Docx: ",

        // Delete pages
        deletePagesText: "Usun Strony",
        deletePagesDesc: "Usun strony z PDF",
        deleteSelectLabel: "Wybierz plik PDF:",
        deleteSelectButton: "Kliknij, aby wybrac plik",
        deletePreviewTitle: "Kliknij strony, ktore chcesz usunac",
        deleteHelpText: "Strony oznaczone X zostana usuniete.",
        deleteSubmitBtn: "Utworz PDF bez zaznaczonych stron",
        // Delete pages messages
        loadingPreview: 'Ladowanie podgladu...',
        mustLeaveAtLeastOnePage: 'Musisz pozostawic co najmniej jedna strone niezaznaczona.',
        processing: 'Przetwarzanie...',
        successDeleted: 'Pomyslnie utworzono PDF: {filename}',
        saveCancelled: 'Zapisywanie anulowane',
        errorPrefix: 'Blad: ',

        // PDF to DOCX
        pdfToDocxHeader: "PDF do DOCX",
        pdfToDocxHeader2: "Konwertuj PDF na DOCX",
        pdfToDocxSelectLabel: "Wybierz plik PDF:",
        pdfToDocxSelectButton: "Kliknij, aby wybrać plik",
        pdfToDocxOutputLabel: "Nazwa pliku wynikowego:",
        pdfToDocxSubmitBtn: "Konwertuj do DOCX",
        // PDF to DOCX messages
        successPdfConverted: "✓ Pomyślnie konwertowano PDF na DOCX: {filename} w folderze Pobrane!",

        // General / Shared messages
        errorPrefix: "Błąd: ",
        processing: "Przetwarzanie",
        saveCancelled: "Zapisywanie anulowane",

        // Split mode labels
        splitModeLabel: "Tryb podziału:",
        modeRange: "Własne zakresy stron",
        modeEvery: "Podziel co X stron",
        modeCustom: "Własne pliki wielozakresowe",
        modeSize: "Podziel według rozmiaru pliku",

        // Range mode
        rangeSelectLabel: "Wybierz zakresy stron do wyodrębnienia:",

        // Every mode
        everyPagesLabel: "Podziel co X stron:",
        everyPagesHelpText: "PDF zostanie podzielony na dokumenty zawierające tyle stron każdy",

        // Custom mode
        outputFileLabel: "Plik wyjściowy",
        removeFileBtn: "Usuń plik",
        addRangeToFileBtn: "+ Dodaj zakres do tego pliku",
        customRangesLabel: "Zdefiniuj pliki wyjściowe z wieloma zakresami stron:",
        addCustomFileBtn: "+ Dodaj kolejny plik wyjściowy",
        customHelpText: "Każdy plik wyjściowy może zawierać wiele zakresów stron (np. strony 1-4 i 6-12 w jednym pliku)",

        // Size mode
        maxFileSizeLabel: "Maksymalny rozmiar pliku:",
        sizeHelpText: "PDF zostanie podzielony na pliki nieprzekraczające tego rozmiaru",
        currentFileSize: "Aktualny rozmiar pliku: ",

        // Read-only checkbox
        readOnlyLabel: "Ustaw PDF jako tylko do odczytu",

        // Save as ZIP checkbox
        saveAsZipLabel: "Zapisz jako ZIP",

        // Settings
        settingsTitle: "Ustawienia",
        changeLanguageTitle: "Zmienić Język:",
        metadataTitle: "Metadane PDF",
        authorLabel: "Autor:",
        titleLabel: "Tytuł:",
        subjectLabel: "Temat:",
        saveSettings: "Zapisz ustawienia",
        cancelSettings: "Anuluj",
        settingsSaved: "Ustawienia zapisane!"
    },
    es: {
        languageText: "Idioma",
        welcomeText: "Bienvenido al conversor de PDFs",
        splitPdfText: "Dividir PDF",
        splitPdfDesc: "Dividir tu documento PDF en múltiples archivos.",
        mergePdfText: "Unir PDF",
        mergePdfDesc: "Unir tus documentos PDF en un solo archivo.",
        imageToPdfText: "Imagen a PDF",
        imageToPdfDesc: "Convertir uno o mas imágenes en un documento PDF.",
        pdfToImageText: "PDF to Image",
        pdfToImageDesc: "Convertir páginas PDF en imágenes.",
        watermarkText: "Añadir Marca de Agua",
        watermarkDesc: "Añadir una marca de agua a tu documento PDF.",
        pdfToDocxText: "PDF a DOCX",
        pdfToDocxDesc: "Convertir documento PDF a formato DOCX.",
        removeBtn: "Eliminar",
        backLink: "← Ir a la página principal",
        selectedFile: "✓ Archivo seleccionado: ",

        // Merge PDF
        mergeHeader: "Unir PDF",
        mergeHeader2: "Unir documentos PDF",
        mergeSelectLabel: "Selecciona los archivos PDF (Puedes seleccionar varios):",
        mergeSelectButton: "Haz clic para seleccionar los archivos",
        filesOrderTitle: "Orden de archivos",
        mergeHelpText: "Arrastra para reordenar los archivos (De arriba a abajo = del primero al último para combinar en PDF)",
        mergeOutputName: "Nombre del archivo:",
        mergeSubmitBtn: "Unir PDF",
        outputName: "documento_unido",
        // Merge PDF messages
        pleaseSelectAtLeastOnePdf: "Por favor, selecciona al menos un archivo PDF",
        pleaseSelectAtLeastTwoPdfs: "Por favor, selecciona al menos dos archivos PDF para unir",
        processingFiles: "Procesando {count} archivo(s)...",
        successMerged: "✓ ¡PDF unido creado con éxito: {filename} en la carpeta de Descargas!",

        // Split PDF
        splitHeader: "Dividir PDF",
        splitHeader2: "Dividir documento PDF",
        splitSelectBtnLabel: "Seleccionar el PDF para dividir",
        splitSelectButton: "Selecciona el PDF",
        splitPageRangesLabel: "Selecciona el rango de páginas para extraer:",
        addRangeBtn: "+ Añadir otro rango",
        outputSplitName: "Nombre del archivo:",
        namesSplitExamples: "Los archivos se llamrán: nombre_1.pdf, nombre_2.pdf etc.",
        splitSubmitBtn: "Dividir PDF",
        startPageLabel: "Página de inicio:",
        endPageLabel: "Página final:",
        rangeError: "Se requiere al menos un rango",
        createdSuccesful: '✓ Creado correctamente ${successCount} archivo(s) en la carpeta de descargas',
        // Split PDF messages
        pleaseSelectFile: "Por favor, selecciona un archivo PDF",
        pageNumbersGreaterThanZero: "Los números de página deben ser mayores que 0",
        startPageCannotBeGreater: "La página inicial no puede ser mayor que la página final",
        pdfHasOnlyPages: "El PDF solo tiene {total} páginas. Por favor, selecciona un rango válido.",
        pleaseAddAtLeastOneRange: "Por favor, añade al menos un rango de páginas",
        intervalAtLeastOne: "El intervalo debe ser al menos 1",
        pleaseAddAtLeastOneOutputFile: "Por favor, añade al menos un archivo de salida",
        pleaseEnterValidFileSize: "Por favor, introduce un tamaño de archivo válido",
        cannotSplitMinSize: "No se puede dividir: el tamaño mínimo requerido es {size} (tamaño de la página más pequeña)",
        successSplitFiles: "✓ {count} archivo(s) creado(s) correctamente en la carpeta Descargas",
        atLeastOneRangeRequired: "Debe haber al menos un rango",
        atLeastOneFileRequired: "Debe haber al menos un archivo de salida",
        eachFileMustHaveRange: "Cada archivo debe tener al menos un rango",

        // Image to PDF
        imageToPdfHeader: "Imagen a PDF",
        imageToPdfHeader2: "Convertir imágenes a PDF",
        imageToPdfSelectLabel: "Selecciona las imágenes (puedes seleccionar múltiples):",
        imageToPdfSelectButton: "Haz clic para seleccionar las imágenes",
        imagesOrderTitle: "Orden de imágenes",
        imageToPdfHelpText: "Arrastra para reordenar las imágenes (De arriba a abajo = del primero al último para combinar en PDF)",
        imageToPdfOutputName: "Nombre del archivo:",
        imageToPdfSubmitBtn: "Crear PDF",
        // Image to PDF messages
        pleaseSelectAtLeastOneImage: "Por favor, selecciona al menos una imagen",
        creatingPdf: "Creando PDF...",
        successPdfCreated: "✓ PDF creado con éxito: {filename}",
        successPdfCreatedPath: "✓ PDF guardado: {filename}\nen: {path}",

        // PDF to Image
        pdfToImageHeader: "PDF a imagen",
        pdfToImageHeader2: "Convertir PDF a Imágenes",
        pdfToImageSelectLabel: "Seleccionar archivo PDF:",
        pdfToImageSelectButton: "Haz clic para seleccionar el PDF",
        pagesPreviewTitle: "Vista previa de páginas pdf",
        pdfToImageFormatLabel: "Formato de salida de la imagen:",
        pdfToImageOutputName: "Prefijo del nombre del archivo de salida:",
        pdfToImageNamesExample: "Las páginas se llamarán: prefijo_1.png, prefijo_2.png etc.",
        pdfToImageSubmitBtn: "Convertir a Images",
        // PDF to Image messages
        loadingPdf: "Cargando PDF...",
        errorLoadingPdf: "Error al cargar el PDF: {error}",
        pleaseSelectPdfFirst: "Por favor, selecciona primero un archivo PDF",
        convertingPages: "Convirtiendo {count} página(s) a imágenes...",
        convertingPage: "Convirtiendo página {current} de {total}...",
        successConverted: "✓ Se han convertido con éxito {count} página(s) a imágenes {format}",
        successConvertedPath: "✓ Guardadas {count} imágene(s) {format} en:\n{path}",
        successConvertedZip: "✓ Guardadas {count} imágene(s) {format} como ZIP en:\n{path}",

        // Watermark
        watermarkHeader: "Añadir Marca de Agua",
        watermarkHeader2: "Añadir Marca de Agua al PDF",
        watermarkSelectLabel: "Seleccionar archivo PDF:",
        watermarkSelectButton: "Haz clic para seleccionar el archivo",
        watermarkTextLabel: "Texto de la marca de agua:",
        fontSizeLabel: "Tamaño de fuente:",
        opacityLabel: "Opacidad (0-100%):",
        rotationLabel: "Ángulo de rotación:",
        colorLabel: "Color del texto:",
        positionLabel: "Posición:",
        outputNameLabel: "Nombre del archivo de salida:",
        watermarkSubmitBtn: "Aplicar Marcas de Agua al PDF",
        previewTitle: "Vista Previa de Marca de Agua",
        previewHint: "La vista previa muestra cómo aparecerán las marcas de agua en tu PDF",
        layersTitle: "Capas de Marcas de Agua",
        watermarkSettingsTitle: "Configuración de Marca de Agua",
        addLayerBtnText: "+ Agregar Capa de Marca de Agua",
        // Watermark messages
        pleaseSelectPdf: "Por favor seleccione un archivo PDF",
        pleaseEnterWatermark: "Por favor ingrese el texto de la marca de agua",
        processingFile: "Agregando marcas de agua...",
        successWatermark: "✓ PDF con marca de agua creado exitosamente: {filename}!",
        invalidHexColor: "Formato de color no válido. Use #RRGGBB (ej. #FF0000)",
        invalidRotation: "El ángulo de rotación debe estar entre -360 y 360 grados",
        pleaseEnterValidColor: "Por favor ingrese un color HEX válido",
        pleaseAddAtLeastOneLayer: "Por favor agregue al menos una capa de marca de agua",
        layerAdded: "✓ Capa de marca de agua agregada exitosamente!",
        layerRemoved: "✓ Capa de marca de agua eliminada",
        updateLayerBtn: "✓ Actualizar Capa",
        editBtn: "Editar",
        fontSize: "Tamaño",
        opacity: "Opacidad",
        rotation: "Rotación",
        color: "Color",

        // Docx to PDF
        docxToPdfText: "DOCX a PDF",
        docxToPdfDesc: "Convertir documentos DOCX en un archivo PDF.",
        docxToPdfHeader: "Docx a PDF",
        docxToPdfHeader2: "Convertir Word a PDF",
        docxToPdfSelectLabel: "Selecciona el archivo Word (.docx):",
        docxToPdfSelectButton: "Haz clic para seleccionar el archivo",
        docxToPdfSubmitBtn: "Convertir a PDF",
        // Docx to PDF messages
        pleaseSelectDocx: "Por favor, selecciona un archivo .docx",
        convertingDocx: "Convirtiendo documento Word...",
        successDocxCreated: "✓ PDF generado correctamente",
        successPdfCreatedPath: "✓ PDF guardado: {filename}\nen: {path}",
        errorDocx: "Error al convertir el Docx: ",

        // Delete pages
        deletePagesText: "Eliminar Paginas",
        deletePagesDesc: "Eliminar paginas del PDF",
        deleteSelectLabel: "Selecciona un archivo PDF:",
        deleteSelectButton: "Haz clic para seleccionar archivo",
        deletePreviewTitle: "Haz clic en las paginas que quieras eliminar",
        deleteHelpText: "Las paginas marcadas con X seran eliminadas.",
        deleteSubmitBtn: "Generar PDF sin paginas seleccionadas",
        // Delete pages messages
        loadingPreview: 'Cargando vista previa...',
        mustLeaveAtLeastOnePage: 'Debes dejar al menos una pagina sin seleccionar.',
        processing: 'Procesando...',
        successDeleted: 'PDF creado correctamente: {filename}',
        saveCancelled: 'Guardado cancelado',
        errorPrefix: 'Error: ',

        // PDF to DOCX
        pdfToDocxHeader: "PDF a DOCX",
        pdfToDocxHeader2: "Convertir PDF a DOCX",
        pdfToDocxSelectLabel: "Seleccionar archivo PDF:",
        pdfToDocxSelectButton: "Haz clic para seleccionar el archivo",
        pdfToDocxOutputLabel: "Nombre del archivo de salida:",
        pdfToDocxSubmitBtn: "Convertir a DOCX",
        // PDF to DOCX messages
        successPdfConverted: "✓ PDF convertido a DOCX correctamente: {filename} en la carpeta Descargas",

        // General / Shared messages
        errorPrefix: "Error: ",
        processing: "Procesando",
        saveCancelled: "Guardado cancelado",

        // Split mode labels
        splitModeLabel: "Modo de divisón:",
        modeRange: "Personaliza los rangos de las páginas",
        modeEvery: "Divide cada X páginas",
        modeCustom: "Personaliza los múltiples rangos de los archivos",
        modeSize: "Divide por tamaño de archivo",

        // Range mode
        rangeSelectLabel: "Selecciona el rango de páginas para extraer:",

        // Every mode
        everyPagesLabel: "Divide cada X páginas:",
        everyPagesHelpText: "El PDF se dividirá en documentos de esta cantidad de páginas cada uno",

        // Custom mode
        outputFileLabel: "Archivo de salida",
        removeFileBtn: "Eliminar archivo",
        addRangeToFileBtn: "+ Añadir rango al archivo",
        customRangesLabel: "Definir archivos de salida con múltiples rangos de páginas:",
        addCustomFileBtn: "+ Añadir otro archivo de salida",
        customHelpText: "Cada archivo de salida puede contener múltiples rangos de páginas (ejemplo: paginas 1-4 y 6-12 en in archivo)",

        // Size mode
        maxFileSizeLabel: "Tamaño máximo de salida por archivo:",
        sizeHelpText: "El PDF se dividirá en archivos que no excedan este tamaño",
        currentFileSize: "Tamaño del archivo actual: ",

        // Read-only checkbox
        readOnlyLabel: "Hacer PDF de solo lectura",

        // Save as ZIP checkbox
        saveAsZipLabel: "Guardar como ZIP",

        // Settings
        settingsTitle: "Configuración",
        changeLanguageTitle: "Cambiar Idioma:",
        metadataTitle: "Metadatos del PDF",
        authorLabel: "Autor:",
        titleLabel: "Título:",
        subjectLabel: "Asunto:",
        saveSettings: "Guardar configuración",
        cancelSettings: "Cancelar",
        settingsSaved: "¡Configuración guardada!",
        metaAuthor: "Introduzca el nombre del autor",
        metaTitle: "Introduzca el título del documento",
        metaSubject: "Introduzca el asunto del documento"
    }
};

function changeLanguage(lang) {
    let objects = document.getElementsByClassName('langText');
    let objectsP = document.getElementsByClassName('langTextPlaceholder');

    for (let i = 0; i < objects.length; i++) {
        const key = objects[i].dataset.i18n || objects[i].id;
        objects[i].innerHTML = languages[lang][key];
    }

    for (let i = 0; i < objectsP.length; i++) {
        const key = objects[i].dataset.i18n || objectsP[i].id;
        objectsP[i].placeholder = languages[lang][key];
    }
}

// Helper function to get translated message with parameter substitution
function getMessage(key, params = {}) {
    const lang = window.currentLanguage;
    let message = languages[lang][key] || languages['en'][key] || key;

    // Replace parameters in the message
    Object.keys(params).forEach(param => {
        message = message.replace(`{${param}}`, params[param]);
    });

    return message;
}

window.addEventListener('settingsUIReady', async () => {
    const selector = document.getElementById('languageSelector');

    const savedLang = await ipcRenderer.invoke('get-language');
    window.currentLanguage = savedLang;
    selector.value = savedLang;
    changeLanguage(savedLang);

    selector.addEventListener('change', async (event) => {
        const selectedLang = event.target.value;

        await ipcRenderer.invoke('save-language', selectedLang);

        window.currentLanguage = selectedLang;
        changeLanguage(selectedLang);
    });
});

// Add click handler to logo to navigate back to main page
const headerIcon = document.querySelector('.headerIcon');
if (headerIcon) {
    headerIcon.addEventListener('click', function () {
        // Check if we're not on the main page already
        const currentPath = window.location.pathname;
        if (!currentPath.endsWith('index.html') && currentPath !== '/') {
            window.location.href = '../../index.html';
        }
    });
}

window.getMessage = getMessage;