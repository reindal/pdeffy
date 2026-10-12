# QA Bugs — Pdeffy

Registro bug trovati in test. Aggiornato mano a mano durante le sessioni di QA.

I bug sono in due file:

- **[Bug da fixare](QA-open-bugs.md)** — stati `aperto` e `in corso`.
- **[Bug fixati / chiusi](QA-closed-bugs.md)** — stati `fixato`, `verificato`, `wontfix` e `duplicato`.

Quando un bug passa a uno stato chiuso, togli la riga e la scheda da `QA-open-bugs.md` e mettile in `QA-closed-bugs.md`.

**Come usarlo:** dimmi il bug (e se vuoi: area, severity, step, ipotesi di causa). Se alleghi screenshot o video li salvo in `docs/qa-bugs/assets/` e li collego nella scheda.

**Allegati:**
- Media in `assets/` (stessa cartella del tracker).
- **Screenshot** → incorporati inline con `![...](assets/...)`.
- **Video** → salvati come file e collegati con link (Markdown non li riproduce inline in modo affidabile). Preferire clip corte; se pesano troppo, link esterno + frame chiave opzionale.

**Versione app:** quella dell’installer / app installata che stai testando — **me la dici tu** (non si legge dal codice locale). Se te la scordi, te la chiedo prima di chiudere la scheda.

**Legenda stato:** `aperto` · `in corso` · `fixato` · `verificato` · `wontfix` · `duplicato`  
**Legenda severity:** `blocker` · `critical` · `major` · `minor` · `cosmetic`
