# InTruth · Codex

**Italiano** · [English](#english)

Fact-checking di video e dibattiti con **trascrizione Whisper nel browser** e
**Codex CLI** per analisi e ricerca web. Questa versione usa **`gpt-6-luna`** con
ragionamento **`low`** come impostazione iniziale. Non usa le API
Anthropic e non richiede di incollare chiavi nel popup.

Progetto originale di **Risha Panigrahi**:
https://github.com/rpanigrahi222/intruth-factcheck.
Adattamento del repository https://github.com/SiNaPsEr0x/intruth-factcheck.
Vedi [LICENSE](LICENSE) e [NOTICE.md](NOTICE.md).

## Installazione automatica

1. Scarica ed estrai lo [ZIP del progetto](https://github.com/SiNaPsEr0x/intruth-factcheck/archive/refs/heads/master.zip).
2. **Una sola volta sul PC del browser**, esegui `Install-InTruth.cmd` su Windows
   oppure `Install-InTruth.command` su macOS/Linux. L’installatore scarica Node
   verificandone il checksum, installa il componente locale e lo registra nel
   browser per l’utente corrente, senza privilegi amministrativi.
3. In `chrome://extensions`, carica la cartella **`realtime-factcheck`** come
   estensione non pacchettizzata, oppure ricaricala se già presente.
4. Apri InTruth. Il browser avvia il componente locale. Se serve l’accesso,
   si apre **la pagina ufficiale ChatGPT**: completa solo il login e l’eventuale
   conferma. Il popup diventa pronto automaticamente, senza riavviare nulla.

Se Codex ha già una sessione utilizzabile, viene riusata. La CLI gestisce
memorizzazione e rinnovo dei token. Nessuna password/API key/token va incollata
nel popup. Un accesso annullato mostra il pulsante per riprovare, senza aprire
schede in continuazione. L’avvio automatico non avvia la cattura audio: il tasto
**Avvia il Fact-Checking** resta necessario per il consenso di Chrome.

**L’installazione locale iniziale è necessaria:** un’estensione Chrome non può
installare o eseguire programmi arbitrari al solo caricamento. Dopo questa
installazione non servono terminali aperti o comandi `npm start`/`codex login`.
Chrome, eventuali criteri aziendali e il sistema operativo possono richiedere
la normale autorizzazione all’installazione/esecuzione.

Il nuovo ID stabile è `ihohghmjebpjjlehnbdknchigighdlke`: aggiornando dalla vecchia
versione non pacchettizzata può essere necessario rimuoverla e ricaricarla;
le preferenze dell’estensione possono azzerarsi, mentre il login Codex resta.
Se è ancora aperto un vecchio bridge 2.1 in un terminale, chiudilo una volta per
liberare la porta 8787 prima del nuovo avvio automatico.

Chi ha già Node può usare `npm run setup`. Per rimuovere soltanto la registrazione
dell’avvio automatico: `node scripts/install-helper.cjs --uninstall`.
I file locali e il login Codex non vengono cancellati.

## Avvio manuale / sviluppo

Versione **2.2.0**, con software aggiornato ai canali **stabili** verificati il
23 ottobre 2026. Usa **Node.js 26.12.1** (ultima stabile), oppure **24.22.1 LTS**,
**npm 12.2.1** e Chrome/Chromium stabile aggiornato. Codex CLI **0.164.0** viene
installato dal lockfile del progetto. Il bridge deve essere avviato **sullo
stesso computer del browser**, anche se sviluppi il progetto con Codex nel cloud.

```sh
git clone https://github.com/SiNaPsEr0x/intruth-factcheck.git
cd intruth-factcheck
npm install --global npm@12.2.1
npm ci
npm exec -- codex login
npm run check
npm run verify
npm start
```

Se hai scaricato lo ZIP, estrailo e parti da `npm ci`
nella cartella con `package.json`. Lascia aperto il terminale del bridge.
`npm ci` installa le versioni bloccate di CLI e strumenti di sviluppo; i file
browser già pronti sono inclusi. Non serve ricompilarli per usare l'estensione.

1. Apri `chrome://extensions` e abilita **Modalità sviluppatore**.
2. Scegli **Carica estensione non pacchettizzata** e seleziona la cartella
   **`realtime-factcheck`**, non la radice del repository.
3. Apri o ricarica una pagina video di **YouTube** o **Jubilee**.
4. Apri il popup InTruth: il modello iniziale è `gpt-6-luna`.
5. Scegli Whisper `tiny`, `base` o `small`, la lingua e, se nota, la vera data di
   registrazione del discorso. `auto` rileva la lingua; i risultati seguono la
   lingua del browser (italiano/inglese).
6. Quando il bridge risulta collegato, premi **Avvia il Fact-Checking**.

Al primo utilizzo Whisper scarica i pesi da Hugging Face; il popup mostra la cache
e permette di svuotarla. WebGPU è preferibile; è previsto un fallback CPU/WASM.
Le trascrizioni automatiche possono contenere errori: controlla il testo originale.

### Il modello richiesto

`gpt-6-luna` è l'identificatore scelto per questa configurazione, **non una garanzia
che ogni account Codex vi abbia accesso**. Il progetto non inventa alias come
`luna-light-latest` e non cambia modello in silenzio. Puoi inserire nel popup un
altro identificatore esatto disponibile per il tuo account.

`low` è il livello di ragionamento configurato nel bridge; non è un modello
separato chiamato “Light”. Non sono garantite risposte istantanee o tempi fissi.

```sh
npm run check   # Controlla versione CLI e stato login; non interroga il modello
npm run verify  # Invia una piccola richiesta REALE al modello, consumando quota
npm run verify:web  # Prova anche la ricerca web nativa; eseguila dopo verify
```

L'avvio del bridge esegue solo il controllo locale. Un login memorizzato può
comunque essere scaduto: `verify` controlla anche l'accesso effettivo. Se compare
un errore di token/login, esegui `npm exec -- codex login` nel tuo terminale e riavvia il bridge.
Se il modello non è disponibile, scegli un ID autorizzato per il tuo account.

## Come funziona

```text
Audio della scheda → AudioWorklet → Whisper locale → trascrizione
  → bridge HTTP su 127.0.0.1:8787 → codex exec (gpt-6-luna, low)
  → prima analisi senza web → verifica con web_search live → overlay e report
```

- L'estensione valuta due segmenti finali per volta; un segmento isolato viene
  elaborato dopo 10 secondi senza un altro segmento finale. Un segmento Whisper
  può durare fino a circa 30 secondi, oltre al tempo d'inferenza.
- La prima card è **provvisoria**. La verifica successiva può correggerla in
  entrambe le direzioni, anche da VERO a FALSO.
- Senza ricerca eseguita, senza fonti utilizzabili o in caso di errore, la card
  resta **NON VERIFICABILE**, con confidenza bassa. Una fonte citata può comunque
  essere errata o irrilevante: consulta i link e valuta l'evidenza.
- Sono ammessi al massimo tre claim per passata, due richieste CLI contemporanee
  e una coda limitata. Se Codex resta indietro, metti in pausa il video.
- Fermare la sessione annulla le richieste. Le risposte vecchie non passano alla
  scheda della sessione successiva.
- I nomi dei partecipanti sono contesto modificabile, non diarizzazione audio.
  Il modello deve usare `Unknown` quando il testo non identifica chi parla.
- La “convinzione” lessicale descrive il linguaggio e **non misura la verità**;
  le liste lessicali sono soprattutto inglesi.
- L'overlay è ridimensionabile e trascinabile. **Esporta** scarica un report HTML
  autonomo con modello e fonti; aprilo e usa Stampa → Salva come PDF.
  Le card ancora in attesa non entrano nel report finché non sono finalizzate.

La data di caricamento del video non viene usata come data del discorso.
Inserisci la data di registrazione per verificare affermazioni storiche nel
contesto corretto; in sua assenza il modello non può ricostruirla con certezza.

## Configurazione del bridge

| Variabile | Default | Significato |
| --- | --- | --- |
| `CODEX_BIN` | CLI locale del progetto, poi `codex` nel PATH | Eseguibile Codex o percorso a `bin/codex.js`; override esplicito |
| `CODEX_MODEL` | `gpt-6-luna` | Modello predefinito per bridge/check/verify; il popup invia il suo ID selezionato |
| `CODEX_REASONING_EFFORT` | `low` | Livello supportato dal modello scelto |
| `REQ_TIMEOUT` | `120000` | Timeout della CLI in millisecondi |
| `MAX_CONCURRENT` | `2` | Limite processi CLI paralleli |
| `INTRUTH_EXTENSION_ID` | vuoto | Facoltativo: autorizza solo l'ID della propria estensione |
| `BRIDGE_PORT` | `8787` | Porta del server; per l'estensione usa 8787, oppure modifica anche `BRIDGE_URL` in `src/shared/protocol.js` e ricaricala |

Il client annulla ogni fetch dopo 125 secondi: aumentare solo `REQ_TIMEOUT`
oltre tale limite non allunga l'attesa dell'estensione. `CODEX_BIN` su Windows
può indicare `codex.exe` o il launcher `@openai/codex/bin/codex.js`; lo shim npm
standard viene risolto senza passare il prompt a una shell.

Il bridge ascolta solo su `127.0.0.1`, controlla Host/Origin, limita dimensioni e
concorrenza e usa un protocollo InTruth dedicato. La CLI usa sessioni effimere in
cartelle temporanee, sandbox in sola lettura e shell/app/plugin/hook disabilitati.
Le configurazioni utente non vengono caricate; l'autenticazione resta gestita da
Codex. `bridge/warm-bridge.js` è solo un alias compatibile del nuovo avvio.

## Privacy

L'audio viene elaborato localmente da Whisper. **Il testo della trascrizione, il
titolo, la data e i claim vengono inviati a OpenAI tramite Codex** per l'analisi;
la ricerca web coinvolge i servizi di ricerca usati da Codex. Un bridge locale
non rende locale il modello linguistico. Si applicano condizioni, limiti e
impostazioni privacy dell'account e del servizio Codex utilizzato.

Nessuna API key viene salvata nel browser. All'aggiornamento vengono rimosse le
vecchie impostazioni della chiave Anthropic e i modelli Claude vengono migrati a
`gpt-6-luna`. I modelli audio restano nella cache dell'estensione. Il bridge non
conserva transcript o sessioni su file propri e cancella i suoi file temporanei;
questo non implica assenza di conservazione lato servizio.

## Versioni stabili e controlli

| Componente | Versione |
| --- | --- |
| Node.js / npm | 26.12.1 / 12.2.1 |
| Codex CLI | 0.164.0 |
| Transformers.js | 4.3.1 |
| ONNX Runtime Web/Common | 1.30.0 |
| esbuild / Playwright | 0.28.2 / 1.64.1 |
| Chrome stabile usato nei test | 156.0.8078.47 |

Il bundle browser è ricostruito contro **ONNX stabile 1.30.0**: il bundle
universale upstream di Transformers.js include invece una dipendenza ONNX di
sviluppo. Non viene distribuita quella versione dev. JavaScript e WASM sono
aggiornati insieme, con checksum e licenze. Dettagli e fonti delle versioni:
[SOFTWARE.md](docs/SOFTWARE.md).

Verifiche eseguite su questa versione:

- **30 test automatici**: protocollo, processi, errori, code, audio e isolamento
  delle sessioni; Codex è simulato in questi test.
- **Interfaccia e MV3 nativa**: popup, storage, permessi di origine del bridge,
  content script, worker, card e stop. Il modello è simulato.
- **Whisper reale nell'estensione**: audio pubblico di riferimento riconosciuto
  correttamente su CPU/WASM, sotto la CSP dell'estensione.
- **Traduzione reale inglese → italiano**: «La Terra orbita intorno al Sole.»
- Controlli di sintassi, checksum, versioni stabili, archivio ZIP e `npm audit`.

Il 24 ottobre sono passate anche le prove **reali di Codex/Luna** e della
**ricerca web nativa** (`npm run verify` e `npm run verify:web`). Il precedente
blocco di autenticazione non si è ripresentato nella sessione attuale. Sul tuo PC
verifica comunque il tuo login e l'accesso al modello con gli stessi comandi.
La cattura dell'audio della tua scheda tramite gesto dell'utente e WebGPU sulla
tua GPU richiedono una prova locale. Vedi [risultati](docs/VALIDATION.md).

## Sviluppo con Codex

Apri la cartella in Codex. [AGENTS.md](AGENTS.md) contiene le istruzioni del
progetto e `.codex/config.toml` seleziona Luna/low per gli ambienti che supportano
la configurazione di progetto.

```sh
npm ci --ignore-scripts
npm run versions
npm outdated
npm test
npm run lint
npm exec -- playwright install chromium
npm run test:browser
npm run test:native
npm run test:whisper
npm run package
```

I test browser ora usano Playwright **JavaScript bloccato nel lockfile**: non
servono Python o un Playwright Python installato separatamente. Le prove UI/MV3
usano la porta 8787 libera e una CLI simulata. `test:whisper` scarica un campione
pubblico e i modelli, fa inferenza reale, e non chiama Codex.
`CHROMIUM_BIN` permette di scegliere un browser stabile installato.

Per ricostruire i bundle dopo un aggiornamento approvato usa `npm run vendor`;
non modificare a mano i file minificati. `npm run package` produce
`dist/intruth-codex-extension.zip` (da estrarre prima di caricarlo in Chrome) e
`dist/intruth-codex-source.zip` (progetto completo con lockfile e configurazione).
La CI controlla Node 22/24/26, riproducibilità dei bundle e UI/MV3 nel browser.

Dettagli: [architettura](docs/ARCHITECTURE.md), [migrazione](docs/MIGRATION.md),
[software](docs/SOFTWARE.md), [validazione](docs/VALIDATION.md).

## Sicurezza e correzioni automatiche

A ogni PR, push su `master`, avvio manuale e ogni notte, GitHub Actions esegue:

- **OSV-Scanner** sul lockfile e sullo SBOM di Transformers/ONNX distribuiti.
- **npm audit** anche sulle dipendenze di sviluppo, senza soglia minima esclusa.
- **CodeQL security-extended** su JavaScript e GitHub Actions; i risultati SARIF
  sono caricati in Security e i finding bloccano il gate anche se già presenti.
- **Gitleaks** sull'intera cronologia Git, con valori oscurati; **actionlint** e
  **zizmor** sui workflow e sulla configurazione Dependabot.
- Test Node 22/24/26, browser/MV3, checksum, ricostruzione dei bundle e ZIP.

**Dependabot** propone aggiornamenti npm e delle Actions. La manutenzione
quotidiana applica anche `npm audit fix --package-lock-only --ignore-scripts`
creando una PR dedicata, senza `--force`. Una scansione fallita su `master`
attiva un tentativo di riparazione del lockfile. Se non esiste una correzione
compatibile, la vulnerabilità rimane visibile e il gate rimane rosso.

Il merge automatico accetta soltanto commit firmati dei bot previsti, modifiche
limitate a dipendenze o SHA delle stesse Actions, aggiornamenti compatibili e
**tutti** i controlli superati sul commit esatto e su una branch aggiornata.
Aggiornamenti major, minor pre-1.0, cambi a script/codice e revisioni bloccanti
richiedono revisione. I runtime vendorizzati che richiedono un rebuild coordinato
restano bloccati finché bundle, checksum e SBOM non sono aggiornati insieme.

Non serve una chiave esterna per gli scanner. GitHub deve consentire alle
Actions di creare PR; la funzione di manutenzione segnala un errore se questa
impostazione è disattivata. Dettagli, limiti e controlli del 24 ottobre:
[SECURITY.md](SECURITY.md).

## Problemi comuni

- **Bridge non raggiungibile:** esegui `npm start` sul PC del browser. Un server
  avviato nel cloud o in un container senza inoltro porta non è il tuo localhost.
- **Token scaduto o modello non disponibile:** esegui `npm exec -- codex login`, poi
  `npm run verify`. Il bridge non effettua fallback su un altro modello.
- **Estensione aggiornata ma pagina non risponde:** ricarica l'estensione in
  `chrome://extensions` e la pagina video. Non funziona su pagine interne Chrome.
- **Modello audio lento:** prova `tiny`, controlla WebGPU e attendi il download.
- **Verifica in coda:** pausa il video. Abbonamento e rate limit Codex continuano
  ad applicarsi; non esiste una quota illimitata garantita dal bridge.

I risultati sono assistenza informativa e richiedono controllo delle fonti.

## English

Version 2.2 adds automatic local startup and official ChatGPT browser sign-in.
Run `Install-InTruth.cmd` (Windows) or `Install-InTruth.command` (macOS/Linux)
once, then load/reload the `realtime-factcheck` extension. No terminal or pasted
key/token is needed for subsequent use. A usable Codex login is reused; otherwise
the official sign-in page opens and the popup becomes ready after completion.
Chrome requires this one-time local helper installation; the extension alone
cannot install arbitrary executables. Corporate/OS policies still apply.
The stable extension ID may reset preferences when upgrading older unpacked builds.
Close an old manually started 2.1 bridge once to release port 8787.


InTruth combines local Whisper transcription with **Codex CLI** analysis and
native live web search. Its configured default is **`gpt-6-luna`**, reasoning
**`low`**. Account access to that exact model must be verified; no invented
“light/latest” aliases or silent model fallbacks are used.

Version 2.2.0 uses stable releases checked on 2026-10-23: Node 26.12.1
(or 24.22.1 LTS), npm 12.2.1, Codex CLI 0.164.0, Transformers.js 4.3.1,
stable ONNX Runtime 1.30.0, esbuild 0.28.2 and Playwright 1.64.1.
The browser bundle is rebuilt to avoid upstream's development ORT dependency.
See [software versions](docs/SOFTWARE.md).

Clone the default branch, run `npm ci`,
`npm exec -- codex login`, `npm run check`, `npm run verify`, then `npm start`.
Keep the bridge running **on the browser's computer**. In `chrome://extensions`,
enable Developer mode and load `realtime-factcheck` unpacked. Reload a supported
YouTube/Jubilee tab, select language/Whisper size and optional recording date,
and start. The popup does not request an API key.

`npm run verify` sends a small real inference request. `check` only verifies CLI
version and locally stored login status, which may still have expired. If login
fails, log in again locally. If the model is unavailable, enter an authorized
model ID in the popup. Usage and rate limits of your Codex account still apply.

Preliminary answers are explicitly pending. Web evidence may change any verdict
in either direction; failed searches or missing usable sources result in
UNVERIFIABLE/LOW. Speaker names are inferred from explicit context, not audio
diarization. Lexical conviction is not a truthfulness score. Export downloads a
self-contained HTML report that can be printed to PDF.

Audio stays in the browser, but **transcript text and context are sent to OpenAI
through Codex**. The local bridge does not make LLM inference local. Model
weights are downloaded from Hugging Face and cached. Codex owns authentication;
old Anthropic keys are removed from extension storage during migration.

Development checks: `npm test`, `npm run lint`, `npm run versions`,
`npm outdated`, `npm run test:browser`, `npm run test:native`,
`npm run test:whisper`, `npm audit`, `npm run package`.
Install the browser first with `npm exec -- playwright install chromium`.
Native extension registration, real Whisper transcription and English/Italian
translation passed on stable Chrome 156.0.8078.47; the native pipeline's Codex
responses were simulated. Real Codex inference and native web-search probes
also passed on 2026-10-24 with the current login. Real tabCapture/user-gesture
behavior and hardware WebGPU still need local testing. See [validation](docs/VALIDATION.md).

Original author: **Risha Panigrahi**,
https://github.com/rpanigrahi222/intruth-factcheck.
The original custom noncommercial [LICENSE](LICENSE) is preserved.
