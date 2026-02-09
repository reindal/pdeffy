const { remove } = require("fs-extra");

let language = localStorage.getItem('language') || 'en';

const languages = {
    en: {
        languageText: "Language",
        welcomeText: "Welcome to the PDF Converter",
        splitPdfText: "Split PDF",
        splitPdfDesc: "Split your PDF document into multiple files.",
        mergePdfText: "Merge PDF",
        mergePdfDesc: "Merge your PDF documents into single file.",
        removeBtn: "Remove",
        backLink: "← Back to main page",
        selectedFile: "✓ Selected file: ",

        mergeHeader: "Merge PDF",

        splitHeader: "Split PDF",
        splitHeader2: "Split PDF Document",
        splitSelectBtnLabel: "Select PDF to split",
        splitSelectButton: "Select PDF",
        splitPageRangesLabel: "Select page ranges to extract:",
        addRangeBtn: "+ Add Another Range",
        outputSplitName: "Output file name:",
        namesSplitExamples:"Files will be named: name_1.pdf, name_2.pdf etc.",
        submitBtn: "Split PDF",
        startPageLabel: "Start page:",
        endPageLabel: "End page:",
        rangeError: "At least one range is required",
        createdSuccesful: '✓ Successfully created ${successCount} file(s) in Downloads folder'
    },
    it: {
        languageText: "Lingua",
        welcomeText: "Benvenuto al Convertitore PDF",
        splitPdfText: "Dividi PDF",
        splitPdfDesc: "Dividi il tuo documento PDF in più file.",
        mergePdfText: "Unisci PDF",
        mergePdfDesc: "Unisci i tuoi documenti PDF in un unico file.",
        removeBtn: "Rimuovi",
        backLink: "← Torna alla pagina principale",
        selectedFile: "✓ File selezionato: ",

        mergeHeader: "Unisci file PDF",

        splitHeader: "Dividi PDF",
        splitHeader2: "Dividi documento PDF",
        splitSelectBtnLabel: "Seleziona PDF da dividere",
        splitSelectButton: "Seleziona PDF",
        splitPageRangesLabel: "Seleziona le pagine da estrarre:",
        addRangeBtn: "+ Aggiungi un'altra fascia",
        outputSplitName: "Nome file di output:",
        namesSplitExamples:"I file saranno denominati: nome_1.pdf, nome_2.pdf ecc.",
        submitBtn: "Dividi PDF",
        startPageLabel: "Pagina iniziale:",
        endPageLabel: "Pagina finale:",
        rangeError: "Almeno una fascia è richiesta",
        createdSuccesful: '✓ Creato con successo ${successCount} file in cartella Download'


    },
    pl: {
        languageText: "Język",
        welcomeText: "Witamy w Konwerterze PDF",
        splitPdfText: "Podziel PDF",
        splitPdfDesc: "Podziel swój dokument PDF na wiele plików.",
        mergePdfText: "Scal PDF",
        mergePdfDesc: "Scal swoje dokumenty PDF w jeden plik.",
        removeBtn: "Usuń",
        backLink: "← Powrót do strony głównej",
        selectedFile: "✓ Wybrano plik: ",

        mergeHeader: "Scal dokumenty PDF",

        splitHeader: "Podziel PDF",
        splitHeader2: "Podziel dokument PDF",
        splitSelectBtnLabel: "Wybierz PDF do podzielenia",
        splitSelectButton: "Wybierz PDF",
        splitPageRangesLabel: "Wybierz zakresy stron do wyodrębnienia:",
        addRangeBtn: "+ Dodaj kolejny zakres",
        outputSplitName: "Nazwa pliku wynikowego:",
        namesSplitExamples:"Pliki będą nazwane: nazwa_1.pdf, nazwa_2.pdf itd.",
        submitBtn: "Podziel PDF",
        startPageLabel: "Strona początkowa:",
        endPageLabel: "Strona końcowa:",
        rangeError: "Wymagany jest co najmniej jeden zakres",
        outputPlaceholderName: "nazwa_pliku"

    }
}

function changeLanguage(lang) {
    let objects = document.getElementsByClassName('langText');
    let objectsP = document.getElementsByClassName('langTextPlaceholder');

    for (let i = 0; i < objects.length; i++) {
        objects[i].innerHTML = languages[lang][objects[i].id];
    }

    for (let i = 0; i < objectsP.length; i++) {
        objectsP[i].placeholder = languages[lang][objectsP[i].id];
    }
}

document.getElementById('languageSelector').addEventListener('change', (event) => {
    localStorage.setItem('language', event.target.value);

    changeLanguage(event.target.value);
});

changeLanguage(language);

console.log(language);