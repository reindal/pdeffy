#!/usr/bin/env python3
"""Generate French/German override objects for changeLang.js from English keys."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EN_JSON = Path("/tmp/pdeffy_en.json")
CHANGE_LANG = ROOT / "changeLang.js"

# Shared high-visibility translations (key -> (fr, de))
T: dict[str, tuple[str, str]] = {
    "languageNativeEn": ("English", "English"),
    "languageNativeIt": ("Italiano", "Italiano"),
    "languageNativePl": ("Polski", "Polski"),
    "languageNativeEs": ("Español", "Español"),
    "languageNativeFr": ("Français", "Français"),
    "languageNativeDe": ("Deutsch", "Deutsch"),
    "languageText": ("Langue", "Sprache"),
    "welcomeText": ("Outils PDF intelligents", "Intelligente PDF-Werkzeuge"),
    "navHome": ("Accueil", "Startseite"),
    "navOrganize": ("Organiser les PDF", "PDF organisieren"),
    "navConvert": ("Convertir", "Konvertieren"),
    "navEdit": ("Modifier le PDF", "PDF bearbeiten"),
    "navAssistente": ("Assistant IA", "KI-Assistent"),
    "navOpenPdf": ("Ouvrir un PDF", "PDF öffnen"),
    "pdfEditorModeEdit": ("Modifier", "Bearbeiten"),
    "pdfEditorModeAi": ("IA", "KI"),
    "navRecent": ("Récents", "Zuletzt verwendet"),
    "navSettings": ("Paramètres", "Einstellungen"),
    "homeGreeting": ("Bonjour", "Hallo"),
    "homeQuestion": ("Que voulez-vous faire ?", "Was möchten Sie tun?"),
    "homeSubtitle": ("Tous les outils PDF, en local sur votre appareil.", "Alle PDF-Werkzeuge — lokal auf Ihrem Gerät."),
    "homePrivacyTitle": ("Confidentialité", "Datenschutz"),
    "homePrivacyDesc": ("Vos fichiers restent sur cet appareil.", "Ihre Dateien bleiben auf diesem Gerät."),
    "homePrivacyLocal": ("100 % local", "100 % lokal"),
    "homePrivacyNoUpload": ("Aucun envoi", "Kein Upload"),
    "homePrivacyNoCloud": ("Pas de cloud", "Keine Cloud"),
    "homeSearchPlaceholder": ("Rechercher un outil…", "Tool suchen…"),
    "backLink": ("← Retour à l'accueil", "← Zurück zur Startseite"),
    "changeLanguageTitle": ("Changer de langue", "Sprache ändern"),
    "pdfByTemplateText": ("PDF à partir d'un modèle", "PDF aus Vorlage"),
    "pdfByTemplateDesc": ("Générez des PDF à partir d'un modèle.", "PDF aus einer Vorlage erzeugen."),
    "pdfByTemplateHeader": ("Générateur PDF", "PDF-Generator"),
    "pdfByTemplateHeader2": ("Générer des PDF à partir d'un modèle", "PDFs aus Vorlage erzeugen"),
    "pdfByTemplateDocxLabel": ("1. Sélectionnez le modèle (.docx) :", "1. Vorlage auswählen (.docx):"),
    "pdfByTemplateDocxBtn": ("Cliquez pour sélectionner Word", "Klicken, um Word-Datei zu wählen"),
    "pdfByTemplateExcelLabel": ("2. Sélectionnez les données (.xlsx, .csv) :", "2. Daten auswählen (.xlsx, .csv):"),
    "pdfByTemplateExcelBtn": ("Cliquez pour sélectionner Excel", "Klicken, um Excel-Datei zu wählen"),
    "pdfByTemplateNameLabel": ("Préfixe du nom de fichier :", "Dateinamenspräfix:"),
    "pdfByTemplateSubmitBtn": ("Générer les fichiers PDF", "PDF-Dateien erzeugen"),
    "pdfByTemplateSubmitFolder": ("Générer les fichiers PDF", "PDF-Dateien erzeugen"),
    "pdfByTemplateNameHint": (
        "Cliquez sur les colonnes pour insérer des espaces réservés, saisissez un préfixe libre, ou laissez vide pour file1, file2…",
        "Spalten anklicken für Platzhalter, freien Präfix tippen oder leer lassen für file1, file2…",
    ),
    "pdfByTemplateGroupLevelsLabel": ("Sous-dossiers (plusieurs niveaux)", "Unterordner (mehrere Ebenen)"),
    "pdfByTemplateGroupAddLevel": ("Ajouter un niveau", "Ebene hinzufügen"),
    "pdfByTemplateGroupRemoveLevel": ("Supprimer le niveau", "Ebene entfernen"),
    "pdfByTemplateGroupLevelsHint": (
        "Chaque niveau crée un sous-dossier (ex. ENTREPRISE/MOIS/nom.pdf). Ordre de haut en bas.",
        "Jede Ebene erzeugt einen Unterordner (z. B. FIRMA/MONAT/name.pdf). Reihenfolge von oben nach unten.",
    ),
    "pdfByTemplateKeepDocxLabel": ("Générer aussi les fichiers Word (.docx)", "Auch Word-Dateien (.docx) speichern"),
    "pdfByTemplateKeepDocxHint": (
        "Les documents Word remplis restent dans le dossier de destination (ou le ZIP) avec les PDF.",
        "Ausgefüllte Word-Dokumente bleiben im Zielordner (oder ZIP) neben den PDFs.",
    ),
    "pdfByTemplateZipLabel": ("Créer un fichier ZIP", "ZIP-Datei erstellen"),
    "pdfByTemplateZipHint": (
        "Si désactivé, choisissez un dossier : pdeffy_nomdumodele sera créé avec les PDF.",
        "Wenn aus: Ordner wählen — es wird pdeffy_vorlagenname mit den PDFs erstellt.",
    ),
    "pdfByTemplateProgressTitle": ("Génération des PDF", "PDF-Erzeugung"),
    "pdfByTemplateBatchConverting": (
        "Conversion de tous les documents en PDF (session unique)…",
        "Alle Dokumente werden in einer Sitzung zu PDF konvertiert…",
    ),
    "pdfByTemplateSaveZipTitle": ("Enregistrer le ZIP des PDF", "PDF-ZIP speichern"),
    "pdfByTemplatePickFolderTitle": ("Choisir le dossier de destination", "Zielordner wählen"),
    "savingFolder": ("Enregistrement des PDF dans le dossier…", "PDFs werden im Ordner gespeichert…"),
    "successGenerationFolder": ("✓ PDF générés avec succès dans le dossier sélectionné !", "✓ PDFs erfolgreich im gewählten Ordner erzeugt!"),
    "mergeText": ("Fusionner des PDF", "PDFs zusammenführen"),
    "mergeDesc": ("Combinez plusieurs PDF en un seul fichier.", "Mehrere PDFs zu einer Datei verbinden."),
    "splitText": ("Diviser un PDF", "PDF teilen"),
    "splitDesc": ("Divisez un PDF en plusieurs fichiers.", "Ein PDF in mehrere Dateien aufteilen."),
    "protectPdfText": ("Protéger un PDF", "PDF schützen"),
    "protectPdfDesc": ("Ajoutez un mot de passe à votre PDF.", "PDF mit Passwort schützen."),
    "compressPdfText": ("Compresser un PDF", "PDF komprimieren"),
    "compressPdfDesc": ("Réduisez la taille de votre PDF.", "PDF-Dateigröße verringern."),
    "watermarkText": ("Filigrane", "Wasserzeichen"),
    "watermarkDesc": ("Ajoutez un filigrane à vos pages.", "Wasserzeichen auf Seiten setzen."),
    "redactPdfText": ("Caviarder", "Schwärzen"),
    "redactPdfDesc": ("Masquez définitivement des zones du PDF.", "Bereiche dauerhaft unkenntlich machen."),
    "rotatePdfText": ("Pivoter", "Drehen"),
    "rotatePdfDesc": ("Faites pivoter les pages du PDF.", "PDF-Seiten drehen."),
    "deletePagesText": ("Supprimer des pages", "Seiten löschen"),
    "deletePagesDesc": ("Supprimez des pages d'un PDF.", "Seiten aus einem PDF entfernen."),
    "docxToPdfText": ("Word vers PDF", "Word zu PDF"),
    "excelToPdfText": ("Excel vers PDF", "Excel zu PDF"),
    "powerPointToPdfText": ("PowerPoint vers PDF", "PowerPoint zu PDF"),
    "imageToPdfText": ("Image vers PDF", "Bild zu PDF"),
    "markdownToPdfText": ("Markdown vers PDF", "Markdown zu PDF"),
    "pdfToDocxText": ("PDF vers Word", "PDF zu Word"),
    "pdfToExcelText": ("PDF vers Excel", "PDF zu Excel"),
    "pdfToPptxText": ("PDF vers PowerPoint", "PDF zu PowerPoint"),
    "pdfToImageText": ("PDF vers image", "PDF zu Bild"),
    "pdfToMarkdownText": ("PDF vers Markdown", "PDF zu Markdown"),
    "pdfEditorTile": ("Éditeur PDF", "PDF-Editor"),
    "pdfEditorTileDesc": ("Annotez, signez, caviarder et plus encore.", "Annotieren, signieren, schwärzen und mehr."),
    "settingsTitle": ("Paramètres", "Einstellungen"),
    "cancelBtn": ("Annuler", "Abbrechen"),
    "saveBtn": ("Enregistrer", "Speichern"),
    "closeBtn": ("Fermer", "Schließen"),
    "openBtn": ("Ouvrir", "Öffnen"),
    "continueBtn": ("Continuer", "Weiter"),
    "finishBtn": ("Terminer", "Fertig"),
    "nextBtn": ("Suivant", "Weiter"),
    "previousBtn": ("Précédent", "Zurück"),
    "yesBtn": ("Oui", "Ja"),
    "noBtn": ("Non", "Nein"),
    "okBtn": ("OK", "OK"),
    "errorPrefix": ("Erreur : ", "Fehler: "),
    "successPrefix": ("Succès : ", "Erfolg: "),
    "processing": ("Traitement…", "Verarbeitung…"),
    "pleaseWait": ("Veuillez patienter…", "Bitte warten…"),
    "generatingItem": ("Génération du PDF {current} sur {total}…", "PDF {current} von {total} wird erzeugt…"),
    "readingExcel": ("Lecture du fichier Excel…", "Excel-Datei wird gelesen…"),
    "savingZip": ("Enregistrement du ZIP…", "ZIP wird gespeichert…"),
    "successGeneration": ("✓ PDF générés avec succès !", "✓ PDFs erfolgreich erzeugt!"),
    "errorEmptyExcel": ("Le fichier Excel est vide", "Die Excel-Datei ist leer"),
    "convertHubSubtitle": ("Convertissez vers ou depuis PDF", "Zu PDF oder aus PDF konvertieren"),
    "editHubSubtitle": ("Modifier et annoter vos PDF", "PDFs bearbeiten und annotieren"),
    "editOpenPdfBtn": ("Ouvrir un PDF", "PDF öffnen"),
    "editRecentTitle": ("Récents", "Zuletzt verwendet"),
    "editRecentEmpty": ("Aucun fichier récent", "Keine kürzlich verwendeten Dateien"),
    "otherToolsTile": ("Autres outils", "Weitere Tools"),
    "convertPdfTile": ("Convertir", "Konvertieren"),
    "editPdfTile": ("Modifier", "Bearbeiten"),
    "pdfEditorTitle": ("Éditeur PDF", "PDF-Editor"),
    "pdfEditorSave": ("Enregistrer", "Speichern"),
    "pdfEditorSaveAs": ("Enregistrer sous…", "Speichern unter…"),
    "pdfEditorShare": ("Partager", "Teilen"),
    "pdfEditorPrint": ("Imprimer", "Drucken"),
    "pdfEditorOpenPdf": ("Ouvrir un PDF", "PDF öffnen"),
    "pdfEditorChangeFile": ("Changer de fichier", "Datei wechseln"),
    "setupWizardTitle": ("Configuration initiale", "Ersteinrichtung"),
    "settingsDefaultPdfTitle": ("PDF par défaut", "Standard-PDF"),
    "settingsDefaultPdfCheckbox": ("Utiliser Pdeffy comme application PDF par défaut", "Pdeffy als Standard-PDF-App verwenden"),
    "mergePdfText": ("Fusionner des PDF", "PDFs zusammenführen"),
    "mergePdfDesc": ("Fusionnez plusieurs PDF en un seul fichier.", "Mehrere PDFs zu einer Datei verbinden."),
    "splitPdfText": ("Diviser un PDF", "PDF teilen"),
    "splitPdfDesc": ("Divisez votre PDF en plusieurs fichiers.", "PDF in mehrere Dateien aufteilen."),
    "protectPdfTile": ("Protéger un PDF", "PDF schützen"),
    "protectPdfTileDesc": ("Ajoutez des mots de passe et des permissions", "Passwörter und Berechtigungen hinzufügen"),
    "compressPdfTile": ("Compresser un PDF", "PDF komprimieren"),
    "compressPdfTileDesc": ("Réduire la taille du fichier PDF", "PDF-Dateigröße verringern"),
    "watermarkText": ("Ajouter un filigrane", "Wasserzeichen hinzufügen"),
    "watermarkDesc": ("Ajoutez un filigrane à votre document PDF.", "Wasserzeichen zum PDF hinzufügen."),
    "redactPdfTile": ("Caviarder un PDF", "PDF schwärzen"),
    "redactPdfTileDesc": ("Masquer des informations sensibles", "Sensible Informationen ausblenden"),
    "redactDesc": ("Masquez des informations sensibles dans votre PDF", "Sensible Informationen im PDF ausblenden"),
    "rotatePagesDesc": ("Faire pivoter les pages de votre PDF", "Seiten im PDF drehen"),
    "deletePagesText": ("Supprimer des pages", "Seiten löschen"),
    "deletePagesDesc": ("Supprimer des pages d'un PDF.", "Seiten aus einem PDF löschen."),
    "docxToPdfText": ("Word vers PDF", "Word zu PDF"),
    "docxToPdfDesc": ("Convertir des documents Word en PDF.", "Word-Dokumente in PDF umwandeln."),
    "excelToPdfText": ("Excel vers PDF", "Excel zu PDF"),
    "excelToPdfDesc": ("Convertir un fichier Excel en document PDF.", "Excel-Datei in PDF umwandeln."),
    "powerPointToPdfText": ("PowerPoint vers PDF", "PowerPoint zu PDF"),
    "powerPointToPdfDesc": ("Convertir un fichier PowerPoint en PDF.", "PowerPoint-Datei in PDF umwandeln."),
    "imageToPdfText": ("Image vers PDF", "Bild zu PDF"),
    "imageToPdfDesc": ("Convertir une ou plusieurs images en PDF.", "Ein oder mehrere Bilder in PDF umwandeln."),
    "markdownToPdfText": ("Markdown vers PDF", "Markdown zu PDF"),
    "markdownToPdfDesc": ("Convertir un fichier Markdown en PDF.", "Markdown-Datei in PDF umwandeln."),
    "pdfToDocxText": ("PDF vers Word", "PDF zu Word"),
    "pdfToDocxDesc": ("Convertir un PDF au format Word.", "PDF in Word-Format umwandeln."),
    "pdfToExcelText": ("PDF vers Excel", "PDF zu Excel"),
    "pdfToExcelDesc": ("Convertir un PDF en document Excel.", "PDF in Excel-Dokument umwandeln."),
    "pdfToPptxText": ("PDF vers PowerPoint", "PDF zu PowerPoint"),
    "pdfToPptxDesc": ("Convertir un PDF en PowerPoint.", "PDF in PowerPoint umwandeln."),
    "pdfToImageText": ("PDF vers image", "PDF zu Bild"),
    "pdfToImageDesc": ("Convertir les pages PDF en images.", "PDF-Seiten in Bilddateien umwandeln."),
    "pdfToMarkdownText": ("PDF vers Markdown", "PDF zu Markdown"),
    "pdfToMarkdownDesc": ("Extraire le texte d'un PDF vers Markdown.", "Text aus PDF nach Markdown extrahieren."),
    "pdfEditorTileDesc": ("Modifier pages, filigrane, caviardage et signature", "Seiten, Wasserzeichen, Schwärzung und Signatur"),
    "summarizePdfTile": ("Résumer un PDF", "PDF zusammenfassen"),
    "summarizePdfTileDesc": ("Résumé IA local sur l'appareil", "Lokale KI-Zusammenfassung"),
    "firstLaunchIntroTitle": ("Bienvenue dans Pdeffy", "Willkommen bei Pdeffy"),
    "firstLaunchIntroText": ("Configuration rapide : choisissez la langue et les métadonnées PDF.", "Kurze Einrichtung: Sprache und PDF-Metadaten wählen."),
}


def js_escape(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def main() -> None:
    en = json.loads(EN_JSON.read_text(encoding="utf-8"))
    fr: dict[str, str] = {}
    de: dict[str, str] = {}
    for k, (f, d) in T.items():
        fr[k] = f
        de[k] = d

    # Ensure submit keys always present even if EN export missed variants
    fr.setdefault("pdfByTemplateSubmitBtn", "Générer les fichiers PDF")
    fr.setdefault("pdfByTemplateSubmitFolder", "Générer les fichiers PDF")
    de.setdefault("pdfByTemplateSubmitBtn", "PDF-Dateien erzeugen")
    de.setdefault("pdfByTemplateSubmitFolder", "PDF-Dateien erzeugen")

    def emit(obj: dict[str, str], indent: str = "    ") -> str:
        lines = ["{"]
        for k, v in obj.items():
            lines.append(f"{indent}    {k}: {js_escape(v)},")
        lines.append(f"{indent}}}")
        return "\n".join(lines)

    snippet = f"""
// French & German: English base + overrides for primary UI (missing keys fall back via Object.assign).
const PDEFFY_I18N_FR_OVERRIDES = {emit(fr)};
const PDEFFY_I18N_DE_OVERRIDES = {emit(de)};
languages.fr = Object.assign({{}}, languages.en, PDEFFY_I18N_FR_OVERRIDES);
languages.de = Object.assign({{}}, languages.en, PDEFFY_I18N_DE_OVERRIDES);
"""

    src = CHANGE_LANG.read_text(encoding="utf-8")

    # LANGUAGE_CHOICES
    if "value: 'fr'" not in src:
        src = src.replace(
            """const LANGUAGE_CHOICES = [
    { value: 'en', code: 'EN', emoji: '🇬🇧', labelKey: 'languageNativeEn' },
    { value: 'it', code: 'IT', emoji: '🇮🇹', labelKey: 'languageNativeIt' },
    { value: 'pl', code: 'PL', emoji: '🇵🇱', labelKey: 'languageNativePl' },
    { value: 'es', code: 'ES', emoji: '🇪🇸', labelKey: 'languageNativeEs' },
];""",
            """const LANGUAGE_CHOICES = [
    { value: 'en', code: 'EN', emoji: '🇬🇧', labelKey: 'languageNativeEn' },
    { value: 'it', code: 'IT', emoji: '🇮🇹', labelKey: 'languageNativeIt' },
    { value: 'pl', code: 'PL', emoji: '🇵🇱', labelKey: 'languageNativePl' },
    { value: 'es', code: 'ES', emoji: '🇪🇸', labelKey: 'languageNativeEs' },
    { value: 'fr', code: 'FR', emoji: '🇫🇷', labelKey: 'languageNativeFr' },
    { value: 'de', code: 'DE', emoji: '🇩🇪', labelKey: 'languageNativeDe' },
];""",
        )

    # Native names in each pack
    for pack_marker in (
        'languageNativeEs: "Español",',
        "languageNativeEs: 'Español',",
    ):
        if pack_marker in src and "languageNativeFr" not in src.split(pack_marker, 1)[1][:80]:
            pass
    # Add after languageNativeEs in each language block
    src = re.sub(
        r'(languageNativeEs:\s*"[^"]*",\n)',
        r'\1        languageNativeFr: "Français",\n        languageNativeDe: "Deutsch",\n',
        src,
    )
    # Avoid duplicating if re-run
    while src.count('languageNativeFr: "Français",\n        languageNativeDe: "Deutsch",\n        languageNativeFr:') > 0:
        src = src.replace(
            'languageNativeFr: "Français",\n        languageNativeDe: "Deutsch",\n        languageNativeFr: "Français",\n        languageNativeDe: "Deutsch",\n',
            'languageNativeFr: "Français",\n        languageNativeDe: "Deutsch",\n',
        )

    # Submit button strings
    replacements = {
        'pdfByTemplateSubmitBtn: "Generate PDFs as ZIP"': 'pdfByTemplateSubmitBtn: "Generate PDF files"',
        'pdfByTemplateSubmitFolder: "Generate PDFs in folder"': 'pdfByTemplateSubmitFolder: "Generate PDF files"',
        'pdfByTemplateSubmitBtn: "Genera PDF in ZIP"': 'pdfByTemplateSubmitBtn: "Genera files PDF"',
        'pdfByTemplateSubmitFolder: "Genera PDF in cartella"': 'pdfByTemplateSubmitFolder: "Genera files PDF"',
        'pdfByTemplateSubmitBtn: "Generuj PDF jako ZIP"': 'pdfByTemplateSubmitBtn: "Generuj pliki PDF"',
        'pdfByTemplateSubmitFolder: "Generuj PDF w folderze"': 'pdfByTemplateSubmitFolder: "Generuj pliki PDF"',
        'pdfByTemplateSubmitBtn: "Generar PDFs en ZIP"': 'pdfByTemplateSubmitBtn: "Generar archivos PDF"',
        'pdfByTemplateSubmitFolder: "Generar PDF en carpeta"': 'pdfByTemplateSubmitFolder: "Generar archivos PDF"',
    }
    for a, b in replacements.items():
        src = src.replace(a, b)

    # Inject FR/DE assignment once (after languages object closes)
    marker = "\n};\n\nfunction changeLanguage(lang)"
    if "languages.fr =" not in src:
        if marker not in src:
            raise SystemExit("Could not find languages object end marker")
        src = src.replace(marker, "\n};\n" + snippet + "\nfunction changeLanguage(lang)", 1)
    else:
        # replace existing overrides block
        src = re.sub(
            r"\n// French & German:.*?languages\.de = Object\.assign\(\{\}, languages\.en, PDEFFY_I18N_DE_OVERRIDES\);\n",
            "\n" + snippet.lstrip("\n"),
            src,
            count=1,
            flags=re.S,
        )

    CHANGE_LANG.write_text(src, encoding="utf-8")
    print(f"Updated {CHANGE_LANG}")
    print(f"FR overrides: {len(fr)}, DE overrides: {len(de)}")


if __name__ == "__main__":
    main()
