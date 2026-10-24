# InTruth

**Italiano** · [English](#english)

InTruth ti aiuta a controllare le affermazioni che ascolti in un video o in un
dibattito su YouTube e Jubilee. Trascrive l'audio con Whisper nel browser, poi
usa Codex per analizzare il testo e cercare riscontri sul web. I risultati
compaiono accanto al video, con i link alle fonti.

La configurazione iniziale usa `gpt-6-luna` con ragionamento `low`. Per accedere
si usa il login di Codex: nel popup non devi inserire chiavi API.

## Installazione

1. Scarica lo [ZIP del progetto](https://github.com/SiNaPsEr0x/intruth-factcheck/archive/refs/heads/master.zip)
   ed estrailo.
2. Sul computer in cui usi il browser, esegui `Install-InTruth.cmd` su Windows
   oppure `Install-InTruth.command` su macOS o Linux. Basta farlo una volta:
   installa il componente locale e configura l'avvio dal browser per il tuo
   utente, senza privilegi amministrativi. Se serve, scarica Node e ne verifica
   il checksum.
3. Apri `chrome://extensions`, attiva **Modalità sviluppatore** e scegli
   **Carica estensione non pacchettizzata**. Seleziona la cartella
   `realtime-factcheck` dentro il progetto.
4. Apri InTruth. Se hai già effettuato l'accesso a Codex, viene usata quella
   sessione. Altrimenti si apre la pagina ufficiale ChatGPT: completa il login
   e il popup sarà pronto.

Dopo questa prima installazione il componente locale parte da solo. Non devi
lasciare aperto un terminale né avviare comandi a ogni utilizzo. L'installazione
iniziale serve perché Chrome non permette a un'estensione di installare
programmi sul computer. Il sistema operativo o le regole aziendali possono
richiedere un'autorizzazione all'esecuzione.

Se hai già Node, puoi installare il componente con `npm run setup`. Per
rimuoverne la registrazione dal browser usa
`node scripts/install-helper.cjs --uninstall`: i file locali e il login Codex
restano sul computer.

### Se stai aggiornando

Ricarica l'estensione da `chrome://extensions`, poi ricarica anche la pagina del
video. Dalla versione 2.2 l'ID è `ihohghmjebpjjlehnbdknchigighdlke`: passando da
una vecchia installazione non pacchettizzata potresti doverla rimuovere e
caricare di nuovo. Le preferenze possono azzerarsi; il login Codex rimane.

Se avevi avviato a mano il bridge 2.1, chiudi quel terminale per liberare la porta
8787. Le installazioni successive useranno l'avvio automatico.

## Come si usa

Apri un video su YouTube o Jubilee e poi il popup di InTruth. Scegli il modello
Whisper (`tiny`, `base` o `small`) e la lingua dell'audio; con `auto` viene
rilevata automaticamente. I risultati seguono la lingua del browser, in italiano
o inglese.

Se conosci la data in cui è stato registrato il discorso, inseriscila. Può fare
la differenza quando si controllano affermazioni legate a un preciso momento
storico. La data di caricamento del video non viene usata al suo posto.

Quando il collegamento è pronto, premi **Avvia il Fact-Checking**. Questo clic
serve anche a dare a Chrome il consenso per catturare l'audio della scheda.
Al primo utilizzo Whisper deve scaricare i modelli da Hugging Face: attendi il
download prima di iniziare. Il popup mostra la cache e permette di svuotarla.

L'overlay si può trascinare e ridimensionare. Con **Esporta** scarichi un report
HTML con i risultati e le fonti; puoi aprirlo nel browser e scegliere
Stampa → Salva come PDF. Le verifiche ancora in attesa non vengono incluse.

### Come leggere i risultati

La prima risposta è provvisoria. Dopo la ricerca sul web, il giudizio può
cambiare in entrambe le direzioni. Se la ricerca fallisce o non trova fonti
utilizzabili, l'affermazione resta **NON VERIFICABILE**, con confidenza bassa.
Controlla comunque i link: una fonte citata può essere poco pertinente e anche
la trascrizione può contenere errori.

InTruth analizza due segmenti di trascrizione per volta. Se ne rimane uno solo,
lo elabora dopo 10 secondi senza altri segmenti finali. Un segmento Whisper può
durare fino a circa 30 secondi, a cui si aggiungono i tempi di elaborazione.
Se le verifiche restano indietro, metti in pausa il video. Fermando la sessione
si annullano anche le richieste in corso e in coda.

I nomi dei partecipanti si possono correggere a mano: InTruth non riconosce le
voci e usa `Unknown` quando il testo non chiarisce chi sta parlando.
L'indicatore di “convinzione” riguarda le parole usate, soprattutto in inglese;
non dice se una persona sta dicendo la verità.

## Modello e accesso a Codex

Il modello predefinito è `gpt-6-luna`. Deve essere disponibile per il tuo account:
se non lo è, puoi inserire nel popup l'ID esatto di un altro modello a cui hai
accesso. InTruth non passa automaticamente a un modello diverso. `low` è il
livello di ragionamento impostato nel bridge.

Per controllare il collegamento dal terminale:

```sh
npm run check       # Controlla la CLI e il login salvato, senza chiamare il modello
npm run verify      # Prova una richiesta al modello: usa la quota del tuo account
npm run verify:web  # Prova anche la ricerca web, dopo verify
```

Un login salvato può essere scaduto: `verify` permette di verificare l'accesso
effettivo. Se serve, accedi di nuovo dal popup oppure esegui
`npm exec -- codex login` sul computer del browser. Restano validi i limiti di
utilizzo e di frequenza del tuo account Codex.

## Privacy

Whisper elabora l'audio nel browser. Il testo della trascrizione, il titolo,
la data e le affermazioni da controllare vengono invece inviati a OpenAI
tramite Codex. La ricerca web usa i servizi di ricerca di Codex. A questi dati
si applicano le condizioni e le impostazioni privacy del servizio e del tuo
account.

Codex gestisce le credenziali; l'estensione non salva chiavi API nel browser.
I modelli audio rimangono nella cache locale. Il bridge elimina i propri file
temporanei e non conserva trascrizioni o sessioni in un archivio proprio;
questo non riguarda l'eventuale conservazione dei dati da parte del servizio.

## Avvio manuale e sviluppo

Il progetto è alla versione 2.2.0. Le versioni di riferimento sono Node.js
26.12.1 oppure 24.22.1 LTS, npm 12.2.1 e Codex CLI 0.164.0. La CLI viene
installata con le altre dipendenze dal lockfile. Per i dettagli sui componenti
browser e sulle loro versioni, vedi [SOFTWARE.md](docs/SOFTWARE.md).

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

Se hai scaricato lo ZIP, parti da `npm ci` nella cartella con `package.json`.
Il bridge deve girare sullo stesso computer del browser, anche se lavori al
codice in un ambiente cloud. Con l'avvio manuale, lascia aperto il terminale.
I file dell'estensione sono già pronti: non serve ricompilarli per usarla.

[AGENTS.md](AGENTS.md) contiene le istruzioni per lavorare al progetto con Codex.
La configurazione in `.codex/config.toml` imposta il modello e il ragionamento
negli ambienti che supportano le impostazioni di progetto.

### Configurazione del bridge

| Variabile | Valore predefinito | Uso |
| --- | --- | --- |
| `CODEX_BIN` | CLI del progetto, poi `codex` nel PATH | Percorso dell'eseguibile o di `bin/codex.js` |
| `CODEX_MODEL` | `gpt-6-luna` | Modello per bridge, check e verify; il popup invia quello selezionato |
| `CODEX_REASONING_EFFORT` | `low` | Livello di ragionamento supportato dal modello |
| `REQ_TIMEOUT` | `120000` | Tempo massimo della CLI, in millisecondi |
| `MAX_CONCURRENT` | `2` | Numero massimo di processi CLI contemporanei |
| `INTRUTH_EXTENSION_ID` | vuoto | Limita l'accesso all'ID indicato |
| `BRIDGE_PORT` | `8787` | Porta del bridge |

L'estensione usa la porta 8787. Per cambiarla devi aggiornare anche `BRIDGE_URL`
in `realtime-factcheck/src/shared/protocol.js` e ricaricare l'estensione. Il
client interrompe le richieste dopo 125 secondi: aumentare solo `REQ_TIMEOUT`
non prolunga quel limite.

Su Windows, `CODEX_BIN` può indicare `codex.exe` o il launcher
`@openai/codex/bin/codex.js`. Lo shim npm viene risolto senza passare il prompt
a una shell.

Il bridge ascolta su `127.0.0.1`, controlla Host e Origin e limita dimensioni e
concorrenza delle richieste. Per l'analisi avvia sessioni Codex temporanee, in
sola lettura, con shell, app, plugin e hook disabilitati e senza caricare le
configurazioni utente. L'autenticazione rimane gestita da Codex.
`bridge/warm-bridge.js` è un alias dell'avvio attuale.

### Test e pacchetti

```sh
npm ci --ignore-scripts
npm test
npm run lint
npm run versions
npm exec -- playwright install chromium
npm run test:browser
npm run test:native
npm run test:setup
npm run test:whisper
npm run package
```

I test browser usano Playwright JavaScript dal lockfile e richiedono la porta
8787 libera. Puoi scegliere un browser già installato con `CHROMIUM_BIN`.
`test:whisper` scarica un campione audio e i modelli per provare trascrizione e
traduzione reali, senza chiamare Codex. Whisper usa WebGPU quando disponibile,
con CPU/WASM come alternativa.

Per aggiornare i bundle usa `npm run vendor`, senza modificare a mano i file
minificati. JavaScript, WASM, checksum, licenze e SBOM vanno aggiornati insieme.
Il bundle distribuito usa ONNX stabile al posto della dipendenza di sviluppo
inclusa nel bundle universale upstream di Transformers.js.

`npm run package` crea due archivi in `dist`:

- `intruth-codex-extension.zip`: estensione da estrarre e caricare in Chrome.
- `intruth-codex-source.zip`: progetto completo, con lockfile e configurazione.

La suite comprende 30 test automatici, prove dell'interfaccia e dell'estensione
MV3, oltre a trascrizione Whisper e traduzione inglese–italiano. Nei test della
pipeline Codex viene simulato; le prove reali del modello e della ricerca web
si eseguono con i comandi `verify`. La cattura della scheda e WebGPU vanno
provate anche sul computer e sulla GPU che userai.
I risultati delle verifiche sono in [VALIDATION.md](docs/VALIDATION.md).

## Controlli di sicurezza

GitHub Actions esegue i controlli a ogni PR, a ogni push su `master` e ogni notte.
Puoi avviarli anche manualmente. La pipeline include OSV-Scanner sul lockfile e
sullo SBOM dei runtime distribuiti, `npm audit`, CodeQL per JavaScript e Actions,
Gitleaks sull'intera cronologia, actionlint e zizmor. Controlla anche i test su
Node 22, 24 e 26, gli installer Windows e macOS, il browser, i bundle e gli ZIP.

Dependabot propone gli aggiornamenti delle dipendenze e delle Actions. La
manutenzione quotidiana prova a correggere il lockfile con
`npm audit fix --package-lock-only --ignore-scripts`, senza `--force`, e apre
una PR quando trova una modifica. Anche una scansione fallita su `master`
attiva questo tentativo. Se non c'è una correzione compatibile, il problema
resta segnalato e i controlli rimangono bloccati.

Il merge automatico è limitato agli aggiornamenti compatibili delle dipendenze
o degli SHA delle stesse Actions, con commit firmati dei bot previsti e tutti
i controlli passati sul commit da integrare. Il branch deve essere aggiornato
e non devono esserci revisioni bloccanti. Le major, le minor prima della 1.0 e
le modifiche al codice o agli script richiedono revisione; per i runtime
vendorizzati serve anche la ricostruzione dei bundle.

Gli scanner non richiedono chiavi esterne. GitHub deve però consentire alle
Actions di creare PR. La configurazione e i limiti sono descritti in
[SECURITY.md](SECURITY.md).

## Se qualcosa non funziona

- **Il bridge non risponde:** se hai usato l'installatore, controlla di averlo
  eseguito sul computer del browser e prova a riaprire InTruth. Con l'avvio
  manuale, verifica che `npm start` sia ancora in esecuzione. Un bridge avviato
  nel cloud non è raggiungibile sul localhost del tuo PC.
- **Il login è scaduto o il modello non è disponibile:** ripeti l'accesso e prova
  `npm run verify`. Controlla che l'ID scelto sia disponibile per il tuo account.
- **Dopo un aggiornamento la pagina non risponde:** ricarica sia l'estensione
  sia la pagina del video. Le pagine interne di Chrome non sono supportate.
- **La trascrizione è lenta:** prova Whisper `tiny` e controlla che il download
  sia terminato. Le prestazioni dipendono anche dalla disponibilità di WebGPU.
- **Le verifiche si accumulano:** metti in pausa il video e lascia finire le
  richieste in corso.

Altri dettagli: [architettura](docs/ARCHITECTURE.md),
[migrazione](docs/MIGRATION.md), [software](docs/SOFTWARE.md) e
[validazione](docs/VALIDATION.md).

## Crediti e licenza

Il progetto originale è di [Risha Panigrahi](https://github.com/rpanigrahi222/intruth-factcheck).
Questo repository ne adatta il funzionamento a Codex e aggiunge la gestione del
componente locale. Sono mantenuti la [licenza originale non commerciale](LICENSE)
e i riferimenti in [NOTICE.md](NOTICE.md).

## English

InTruth checks claims in YouTube and Jubilee videos. Whisper transcribes the
audio in your browser; Codex analyses the text and searches the web. Results
appear beside the video with links to their sources.

To install, download and extract the [project ZIP](https://github.com/SiNaPsEr0x/intruth-factcheck/archive/refs/heads/master.zip).
Run `Install-InTruth.cmd` on Windows or `Install-InTruth.command` on macOS/Linux
once, on the computer where you use the browser. In `chrome://extensions`,
enable Developer mode and load the `realtime-factcheck` folder as an unpacked
extension. Open InTruth and complete the official ChatGPT sign-in if needed.
The local helper starts automatically after installation. You do not need to
paste an API key or keep a terminal open.

Open a supported video, choose the Whisper model and audio language, and add
the recording date if you know it. Press **Start Fact-Checking** to allow audio
capture. The first use requires a model download from Hugging Face. Export
saves an HTML report that you can print to PDF.

The default model is `gpt-6-luna` with `low` reasoning. It must be available to
your Codex account; you can enter another exact model ID in the popup. Your
account's usage limits apply. To check access manually, run `npm run check`,
then `npm run verify`; `npm run verify:web` also tests web search. The last two
commands make real requests and use your account's quota.

Initial results are provisional and may change after web research. Missing or
failed searches leave a claim unverified. Check the transcript and source links
yourself. Speaker names come from the text, not voice recognition, and the
lexical conviction indicator is not a measure of truthfulness.

Audio is processed locally, but transcript text and context are sent to OpenAI
through Codex. Codex manages sign-in and credentials. See the service's privacy
settings and account terms for how those requests are handled.

For development, use `npm ci`, `npm test` and `npm run lint`. Browser tests use
Playwright; install Chromium with `npm exec -- playwright install chromium`.
See [software versions](docs/SOFTWARE.md), [validation results](docs/VALIDATION.md)
and [security policy](SECURITY.md) for more detail.

Based on [Risha Panigrahi's original project](https://github.com/rpanigrahi222/intruth-factcheck),
under the original noncommercial [LICENSE](LICENSE).
