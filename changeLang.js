let language = localStorage.getItem('language') || 'en';

const langages = {
    en: {
        languageText: "Language",
        welcomeText: "Welcome to the PDF Converter",
        splitPdfText: "Split PDF",
        splitPdfDesc: "Split your PDF document into multiple files.",
        mergePdfText: "Merge PDF",
        mergePdfDesc: "Merge your PDF documents into single file.",

        mergeHeader: "Merge PDF",

        splitHeader: "Split PDF",
    },
    it: {
        languageText: "Lingua",
        welcomeText: "Benvenuto al Convertitore PDF",
        splitPdfText: "Dividi PDF",
        splitPdfDesc: "Dividi il tuo documento PDF in più file.",
        mergePdfText: "Unisci PDF",
        mergePdfDesc: "Unisci i tuoi documenti PDF in un unico file.",

        mergeHeader: "Unisci file PDF",

        splitHeader: "Dividi PDF",
    },
    pl: {
        languageText: "Język",
        welcomeText: "Witamy w Konwerterze PDF",
        splitPdfText: "Podziel PDF",
        splitPdfDesc: "Podziel swój dokument PDF na wiele plików.",
        mergePdfText: "Scal PDF",
        mergePdfDesc: "Scal swoje dokumenty PDF w jeden plik.",

        mergeHeader: "Scal dokumenty PDF",

        splitHeader: "Podziel PDF",
    }
}

function changeLanguage(lang) {
    let objects = document.getElementsByClassName('langText');

    for (let i = 0; i < objects.length; i++) {
        objects[i].innerHTML = langages[lang][objects[i].id];
    }
}

document.getElementById('languageSelector').addEventListener('change', (event) => {
    localStorage.setItem('language', event.target.value);
    
    changeLanguage(event.target.value);
});

changeLanguage(language);

console.log(language);