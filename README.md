# InTruth

**🌐 [Italiano](#italiano) · [English](#english)**

> beta aperta! nessuna API key necessaria, la trovi qui / beta open! no API key needed, find it @ https://intruth-beta.vercel.app/ :-3

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-InTruth-blue)](https://chromewebstore.google.com/detail/InTruth/ikmpglbpcdoapfelcbfpoaddmhmaaocg?hl=en&authuser=0)

<img width="400" height="225" alt="InTruth" src="https://github.com/user-attachments/assets/a0a8fba9-c28f-473c-866d-84951a9b548e" />

---

## Italiano

ciao a tutti!

InTruth è un **fact-checker in tempo reale** per dibattiti live, discorsi, interviste, conferenze stampa ed eventi politici. Ascolta l'audio della scheda attiva del browser, individua le affermazioni fattuali mentre vengono pronunciate e fornisce verdetti immediati basati su evidenze, usando l'analisi di un modello linguistico e la ricerca sul web. La maggior parte dei fact-check ufficiali esce giorni dopo il dibattito — qui puoi valutare le affermazioni **mentre** vengono fatte.

Fa parte di un progetto di ricerca più ampio che studia come l'inganno nel discorso politico sia prosodicamente / linguisticamente diverso dall'inganno in altri contesti (parlato letto / preparato), quindi… ci sarà altro in arrivo!

### Novità principali

- **Trascrizione on-device con Whisper (WebGPU)** — la trascrizione ora gira interamente nel tuo browser tramite Whisper (ONNX) su WebGPU, con Transformers.js. Niente servizi cloud di speech-to-text, niente chiave STT. (Deepgram è stato rimosso.)
- **Due modi per usare il modello** — la tua **API key Anthropic** (bring-your-own-key) *oppure* il tuo **abbonamento Claude** tramite un piccolo bridge locale (`warm-bridge.js`) e la CLI di Claude Code.
- **Supporto multilingua** — funziona su dibattiti in una qualunque delle lingue selezionabili; interfaccia dell'overlay ed export localizzati in italiano/inglese.

### Come funziona

1. l'audio della scheda attiva viene catturato (`tabCapture`)
2. l'audio viene trascritto **localmente** con Whisper (WebGPU → fallback CPU)
3. dal parlato vengono estratte le affermazioni fattuali *check-worthy*
4. ogni affermazione viene valutata in due passate: una **veloce** (dalla conoscenza del modello, mostra subito una card "in verifica…") e una **verificata** che ricontrolla l'affermazione contro fonti web
5. verdetti, spiegazioni e fonti compaiono nell'overlay mentre il dibattito è ancora in corso

**Pipeline audio:** `tabCapture` → `AudioWorklet` (`pcm-worklet.js`, sostituisce il deprecato ScriptProcessorNode) → VAD a energia con finestra scorrevole (max 30 s) → testo interim/finale in streaming. L'audio del video continua a sentirsi normalmente.

### Funzionalità

- **Rilevamento affermazioni in tempo reale**: monitora il parlato della scheda attiva e individua affermazioni fattuali verificabili mentre vengono fatte.
- **Valutazione in tempo reale**: analizza la veridicità con un modello linguistico e fonti esterne, assegnando uno di questi verdetti:
  - **TRUE** (Vero)
  - **SUBSTANTIALLY TRUE** (Sostanzialmente vero)
  - **FALSE** (Falso)
  - **MISLEADING** (Fuorviante)
  - **UNVERIFIABLE** (Non verificabile)
  con un livello di confidenza **HIGH / MEDIUM / LOW**.
- **Attribuzione degli speaker**: nessuna diarizzazione dall'audio; i nomi vengono dedotti dal titolo del video, confermati/modificati da te tramite l'editor nell'overlay, e Claude attribuisce le affermazioni al partecipante corretto dal contesto (linguaggio in prima persona, contenuti di policy, riferimenti incrociati).
- **Analisi del contesto**: usa la conversazione circostante e il contesto dell'evento per migliorare l'identificazione e ridurre i falsi positivi; tiene conto della **data di registrazione** per valutare le affermazioni con le informazioni disponibili all'epoca.
- **"Speaker conviction"**: analisi lessicale (hedging, certezza, filler, prima persona, velocità di eloquio…) mostrata per ogni affermazione.
- **Overlay regolabile**: pannello ancorato a destra a tutta altezza, con maniglia per ridimensionare la larghezza (persistente) e modalità **flottante** trascinabile dalla header con posizione salvata tra le sessioni.
- **Export della sessione**: un pulsante genera un report **HTML autoconsistente** (`factcheck-report.html`, stampabile in PDF) con riepilogo dei conteggi e card per speaker (verdetto, confidenza, timestamp, fonti). Localizzato.

### Modello e chiavi

Nel popup puoi scegliere il modello Claude — **Haiku** (più veloce/economico), **Sonnet** (bilanciato) o **Opus** (più capace) — e come chiamarlo:

- **API key Anthropic** (default): incolli la tua chiave `sk-ant-…` nel popup; la richiesta va direttamente a `api.anthropic.com`.
- **Abbonamento locale (warm bridge)**: spunti *"Use local subscription (warm bridge)"*; l'estensione parla con `http://127.0.0.1:8787` e nessuna chiave viene richiesta.

### Warm bridge (usare l'abbonamento Claude)

`bridge/warm-bridge.js` è un piccolo server HTTP locale che espone la stessa forma della Messages API di Anthropic, ma dietro le quinte invoca la CLI di **Claude Code** — così usi il tuo **abbonamento** invece di una API key a consumo. Ogni richiesta lancia un processo `claude -p` indipendente (one-shot, in parallelo).

**Prerequisiti (una tantum):**

1. installa Claude Code e accedi una volta: `claude` (oppure `claude login`). La CLI conserva le credenziali dell'abbonamento; il bridge non gestisce alcun token.
2. avvia il bridge: `node bridge/warm-bridge.js` — all'avvio fa un piccolo round-trip reale per confermare che l'autenticazione funzioni.
3. nel popup dell'estensione spunta *"Use local subscription (warm bridge)"*.

**Override via variabili d'ambiente (tutte opzionali):** `BRIDGE_PORT` (default 8787), `BRIDGE_HOST` (default 127.0.0.1), `REQ_TIMEOUT` (default 120000 ms), `VERIFY_TIMEOUT` (self-check all'avvio), `CLAUDE_BIN` (percorso della CLI). Endpoint di stato: `GET /health`.

> `max_tokens` e `temperature` della richiesta vengono ignorati (la CLI `claude -p` non li espone). Questo è uno strumento **personale / di sviluppo**: non è distribuibile ad altri utenti (ognuno avrebbe bisogno di Claude Code + il bridge sul proprio PC).

### Lingue

16 lingue selezionabili nel popup: `en, es, fr, de, it, pt, nl, hi, ja, zh, ar, ko, ru, pl, sv, tr`. La scelta guida la trascrizione di Whisper, il locale della ricerca web e la lingua in cui vengono scritti affermazioni e spiegazioni. L'interfaccia dell'overlay e l'export sono localizzati in **italiano/inglese** in automatico in base a `navigator.language`.

Modelli di trascrizione Whisper selezionabili: **tiny** (più veloce, meno accurato), **base** (bilanciato, consigliato), **small** (più accurato, più pesante). Al primo avvio il modello viene scaricato da HuggingFace e poi resta in cache.

### Cos'è "check-worthy"?

Affermazioni verificabili in questo contesto sono:
- affermazioni fattuali specifiche
- statistiche e dati numerici
- eventi storici
- azioni e politiche di governo
- affermazioni scientifiche e mediche
- fatti documentati e registri pubblici

es.
- "l'inflazione ha toccato il 9,1% nel 2022."
- "la legge è passata al Senato nel 2021."
- "il tasso di disoccupazione è attualmente sotto il 5%."

**NON** lo sono:
- opinioni
- previsioni / promesse future
- domande retoriche
- giudizi di valore
- descrizioni soggettive

es.
- "questa politica distruggerà l'economia."
- "ho il piano migliore."
- "se vince il mio avversario, sarà un disastro."

### Come si usa

1. apri un video, una diretta, un dibattito, un'intervista o un discorso
2. avvia l'estensione e assegna gli speaker con un click
3. l'audio della scheda attiva viene catturato
4. il parlato viene trascritto (localmente)
5. vengono estratte le affermazioni fattuali check-worthy
6. le affermazioni vengono valutate contro fonti autorevoli
7. verdetti e spiegazioni vengono mostrati!

### Privacy

Fornisci tu le tue credenziali: non ho accesso ad esse. La trascrizione avviene **localmente** nel tuo browser (Whisper). Con la tua API key, i dati del transcript vengono inviati direttamente al servizio AI da te configurato per generare i fact-check; con il warm bridge la richiesta resta sulla tua macchina (verso la tua CLI Claude Code). Vedi la privacy policy sul web store per i dettagli completi.

### Permessi

- **tabCapture**: cattura l'audio della scheda attiva dopo che avvii esplicitamente una sessione di fact-checking.
- **activeTab**: interagisce con la scheda selezionata.
- **storage**: salva **localmente** preferenze e configurazione (chiave, modello, lingua, dimensioni/posizione del pannello).
- **offscreen**: supporta l'elaborazione audio in background e la trascrizione Whisper.

Host permissions: `api.anthropic.com` (API Claude), `google.serper.dev` (ricerca web di supporto), `huggingface.co` / `*.hf.co` (download dei modelli Whisper), Google Fonts, e `127.0.0.1:8787` / `localhost:8787` (bridge locale). La CSP abilita `wasm-unsafe-eval` per il runtime ONNX.

> Nota: la ricerca web di supporto (grounding) usa [Serper](https://serper.dev). La chiave (`SERPER_KEY` in `src/background/service-worker-ex.js`) è vuota di default: senza una chiave impostata, la seconda passata di verifica basata sul web non è attiva.

### Limitazioni e avvertenze

Il fact-checking è per natura imperfetto! I verdetti generati possono a volte essere errati, incompleti o basati su informazioni non aggiornate. Se hai dubbi su qualcosa, valutalo in modo indipendente e consulta le fonti originali. Questa estensione è uno **strumento informativo**, NON un'autorità definitiva!

### Requisiti

- Chrome Manifest V3 / browser Chromium moderno con supporto **WebGPU**
- chiave API AI fornita dall'utente **oppure** Claude Code + `warm-bridge.js` per l'abbonamento locale

### Contribuire

mi farebbe piacere ricevere consigli, idee di funzionalità e casi limite che avete trovato!

### Licenza

vedi la tab della licenza.

---

## English

hi everyone!

InTruth is a **real-time fact-checker** for live debates, speeches, interviews, press conferences, and political events. It listens to audio from the active browser tab, identifies factual claims as they are made, and provides instant evidence-based verdicts using AI analysis and web research. Most fact-checking docs come out days after debates — now you can evaluate claims **as they're made**.

This is part of a bigger research project assessing how deception in political speech is prosodically / linguistically different than deception in other contexts (rehearsed / read speech), so more to come!

### What's new

- **On-device Whisper transcription (WebGPU)** — transcription now runs entirely in your browser via Whisper (ONNX) on WebGPU, using Transformers.js. No cloud speech-to-text, no STT key. (Deepgram was removed.)
- **Two ways to run the model** — your own **Anthropic API key** (bring-your-own-key) *or* your **Claude subscription** through a tiny local bridge (`warm-bridge.js`) and the Claude Code CLI.
- **Multilingual support** — works on debates in any of the selectable languages; the overlay UI and export are localized in English/Italian.

### How it works

1. audio from the active tab is captured (`tabCapture`)
2. audio is transcribed **locally** with Whisper (WebGPU → CPU fallback)
3. check-worthy factual claims are extracted from the speech
4. each claim is evaluated in two passes: a **fast** pass (from the model's own knowledge, shows a "verifying…" card immediately) and a **grounded** pass that re-checks the claim against web sources
5. verdicts, explanations, and sources appear in the overlay while the debate is still in progress

**Audio pipeline:** `tabCapture` → `AudioWorklet` (`pcm-worklet.js`, replacing the deprecated ScriptProcessorNode) → energy-based VAD with a sliding window (30 s max) → streaming interim/final text. The video's audio keeps playing normally.

### Features

- **Live claim detection**: continuously monitors speech from the active tab and identifies check-worthy factual claims in real time.
- **Live claim evaluation**: analyzes veracity with a large language model plus external sources, assigning one of:
  - **TRUE**
  - **SUBSTANTIALLY TRUE**
  - **FALSE**
  - **MISLEADING**
  - **UNVERIFIABLE**
  with a **HIGH / MEDIUM / LOW** confidence level.
- **Speaker attribution**: no audio diarization; names are inferred from the video title, confirmed/edited by you via the overlay's speaker editor, and Claude attributes claims to the correct participant from context (first-person language, policy content, cross-references).
- **Context analysis**: uses surrounding conversation and event context to improve claim identification and reduce false positives; it also accounts for the **recording date**, evaluating claims against what was known at the time.
- **Speaker conviction**: lexical analysis (hedging, certainty, filler, first-person, speech rate…) surfaced per claim.
- **Adjustable overlay**: a right-anchored, full-height panel with a resize handle for width (persisted), plus a **floating** mode you drag from the header, with its position saved across sessions.
- **Session export**: one button generates a **self-contained HTML report** (`factcheck-report.html`, printable to PDF) with a summary count and per-speaker cards (verdict, confidence, timestamp, sources). Localized.

### Model & keys

In the popup you choose the Claude model — **Haiku** (fastest/cheapest), **Sonnet** (balanced), or **Opus** (most capable) — and how to call it:

- **Anthropic API key** (default): paste your `sk-ant-…` key in the popup; the request goes straight to `api.anthropic.com`.
- **Local subscription (warm bridge)**: check *"Use local subscription (warm bridge)"*; the extension talks to `http://127.0.0.1:8787` and no key is required.

### Warm bridge (use your Claude subscription)

`bridge/warm-bridge.js` is a tiny local HTTP server that exposes the same shape as the Anthropic Messages API but, behind the scenes, invokes the **Claude Code** CLI — so you use your **subscription** instead of a metered API key. Each request spawns an independent `claude -p` process (one-shot, in parallel).

**Prerequisites (one time):**

1. install Claude Code and log in once: `claude` (or `claude login`). The CLI stores your subscription credentials; the bridge manages no token.
2. start the bridge: `node bridge/warm-bridge.js` — on start it does one small real round-trip to confirm auth works.
3. in the extension popup, check *"Use local subscription (warm bridge)"*.

**Env overrides (all optional):** `BRIDGE_PORT` (default 8787), `BRIDGE_HOST` (default 127.0.0.1), `REQ_TIMEOUT` (default 120000 ms), `VERIFY_TIMEOUT` (startup self-check), `CLAUDE_BIN` (CLI path). Status endpoint: `GET /health`.

> The request's `max_tokens` and `temperature` are ignored (the `claude -p` CLI doesn't expose them). This is a **personal / dev tool**: it is not distributable to other users (each would need Claude Code + the bridge on their own PC).

### Languages

16 selectable languages in the popup: `en, es, fr, de, it, pt, nl, hi, ja, zh, ar, ko, ru, pl, sv, tr`. The choice drives Whisper's transcription, the web-search locale, and the language claims/explanations are written in. The overlay UI and export are localized in **English/Italian** automatically based on `navigator.language`.

Selectable Whisper transcription models: **tiny** (fastest, least accurate), **base** (balanced, recommended), **small** (most accurate, heavier). On first run the model is downloaded from HuggingFace and then cached.

### What's check-worthy?

Check-worthy claims in this context are:
- specific factual statements
- statistics and numerical claims
- historical events
- government actions and policies
- scientific and medical claims
- public records and documented events

i.e.
- "inflation peaked at 9.1% in 2022."
- "the bill passed the Senate in 2021."
- "the unemployment rate is currently below 5%."

**NOT:**
- opinions
- predictions / future promises
- rhetorical questions
- value judgments
- subjective descriptions

i.e.
- "this policy will destroy the economy."
- "I have the best plan."
- "if my opponent wins, disaster will follow."

### How to use InTruth

1. open a video, livestream, debate, interview, or speech
2. start the extension and assign speakers with the press of a button
3. audio from the active tab is captured
4. speech is transcribed (locally)
5. check-worthy factual claims are extracted
6. claims are evaluated against authoritative sources
7. verdicts and explanations are displayed!

### Privacy

You provide your own credentials — I have no access to them. Transcription happens **locally** in your browser (Whisper). With your API key, transcript data is sent directly to the AI service you configured to generate fact-check results; with the warm bridge, the request stays on your machine (to your own Claude Code CLI). See the privacy policy on the web store for complete details.

### Permissions

- **tabCapture**: extracts audio from the active tab after you explicitly start a fact-checking session.
- **activeTab**: interacts with the currently selected tab.
- **storage**: stores preferences and configuration **locally** (key, model, language, panel size/position).
- **offscreen**: supports background audio processing and Whisper transcription.

Host permissions: `api.anthropic.com` (Claude API), `google.serper.dev` (supporting web search), `huggingface.co` / `*.hf.co` (Whisper model downloads), Google Fonts, and `127.0.0.1:8787` / `localhost:8787` (local bridge). The CSP enables `wasm-unsafe-eval` for the ONNX runtime.

> Note: supporting web search (grounding) uses [Serper](https://serper.dev). The key (`SERPER_KEY` in `src/background/service-worker-ex.js`) is empty by default: without a key set, the second web-grounded verification pass is inactive.

### Limitations and warnings

Fact-checking is inherently imperfect! Generated verdicts may occasionally be incorrect, incomplete, or based on outdated information. If you're unsure about something, independently evaluate it and consult original sources. This extension is an **informational tool** and NOT a definitive authority!

### Requirements

- Chrome Manifest V3 / modern Chromium-based browser with **WebGPU** support
- user-provided AI API key **or** Claude Code + `warm-bridge.js` for the local subscription

### Contributing

would love advice, any features you'd like, and any edge cases you've found!

### License

view license tab.
