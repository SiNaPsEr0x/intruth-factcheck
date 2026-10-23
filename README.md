# InTruth · Codex

**Italiano** · [English](#english)

Fact-checking di video e dibattiti con **trascrizione Whisper nel browser** e
**Codex CLI** per analisi e ricerca web. Questa versione usa **`gpt-6-luna`** con
ragionamento **`low`** come impostazione iniziale, come richiesto. Non usa le API
Anthropic e non richiede di incollare chiavi nel popup.

Progetto originale di **Risha Panigrahi**:
https://github.com/rpanigrahi222/intruth-factcheck.
Adattamento del repository https://github.com/SiNaPsEr0x/intruth-factcheck.
Vedi [LICENSE](LICENSE) e [NOTICE.md](NOTICE.md).

## Avvio rapido

Servono **Node.js 22+**, **Codex CLI 0.163.0+**, un account con accesso al modello
e **Chrome/Chromium 116+**. Il bridge deve essere avviato **sullo stesso computer
del browser**, anche se sviluppi il progetto con Codex nel cloud.

```sh
npm install -g @openai/codex
codex login
git clone https://github.com/SiNaPsEr0x/intruth-factcheck.git
cd intruth-factcheck
npm run check
npm start
```

Lascia aperto il terminale del bridge. Il progetto non ha dipendenze npm a runtime:
non occorre eseguire `npm install` nella cartella del progetto.

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
```

L'avvio del bridge esegue solo il controllo locale. Un login memorizzato può
comunque essere scaduto: `verify` controlla anche l'accesso effettivo. Se compare
un errore di token/login, esegui `codex login` nel tuo terminale e riavvia il bridge.
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
| `CODEX_BIN` | `codex` nel PATH | Eseguibile Codex o percorso a `bin/codex.js` |
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

## Sviluppo con Codex e verifiche

Apri la cartella in Codex. [AGENTS.md](AGENTS.md) contiene le istruzioni del
progetto e `.codex/config.toml` seleziona Luna/low per gli ambienti che supportano
la configurazione di progetto. Puoi anche avviare esplicitamente:

```sh
codex --model gpt-6-luna -c 'model_reasoning_effort="low"'
npm test
npm run lint
npm run package
```

`npm run package` produce `dist/intruth-codex-extension.zip` (da estrarre prima
di caricarlo in Chrome) e `dist/intruth-codex-source.zip` (progetto completo).
I test Node usano una CLI simulata, senza login o richieste a pagamento.
Il controllo facoltativo `python tests/browser-smoke.py` richiede Playwright
Python e Chromium: prova popup/overlay in Chromium con API Chrome e bridge simulati e porta 8787
libera. Non testa la cattura audio reale né l'accesso al modello.

Dettagli: [architettura](docs/ARCHITECTURE.md), [migrazione](docs/MIGRATION.md),
[risultati e limiti delle verifiche](docs/VALIDATION.md).

## Problemi comuni

- **Bridge non raggiungibile:** esegui `npm start` sul PC del browser. Un server
  avviato nel cloud o in un container senza inoltro porta non è il tuo localhost.
- **Token scaduto o modello non disponibile:** esegui `codex login`, poi
  `npm run verify`. Il bridge non effettua fallback su un altro modello.
- **Estensione aggiornata ma pagina non risponde:** ricarica l'estensione in
  `chrome://extensions` e la pagina video. Non funziona su pagine interne Chrome.
- **Modello audio lento:** prova `tiny`, controlla WebGPU e attendi il download.
- **Verifica in coda:** pausa il video. Abbonamento e rate limit Codex continuano
  ad applicarsi; non esiste una quota illimitata garantita dal bridge.

I risultati sono assistenza informativa e richiedono controllo delle fonti.

## English

InTruth combines local Whisper transcription with **Codex CLI** analysis and
native live web search. Its configured default is **`gpt-6-luna`**, reasoning
**`low`**. Account access to that exact model must be verified; no invented
“light/latest” aliases or silent model fallbacks are used.

Install Node.js 22+, Codex CLI 0.163.0+, run `codex login`, then `npm run check`
and `npm start` from this repository. Keep the bridge running **on the browser's
computer**. In `chrome://extensions`, enable Developer mode and load the
`realtime-factcheck` folder unpacked. Reload a supported YouTube/Jubilee tab,
open InTruth, select the spoken language and Whisper size, optionally enter the
recording date, and start. The extension does not request an API key.

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

Development: `npm test`, `npm run lint`, `npm run package`. The optional
`python tests/browser-smoke.py` uses Chromium and Python Playwright with mocked extension APIs and a mock
bridge; it does not establish real audio/model functionality. See
[validation](docs/VALIDATION.md) for actual results and remaining checks.

Original author: **Risha Panigrahi**,
https://github.com/rpanigrahi222/intruth-factcheck.
The original custom noncommercial [LICENSE](LICENSE) is preserved.
