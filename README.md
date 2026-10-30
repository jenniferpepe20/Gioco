# 🌷 Flower Tycoon

Un gioco ispirato ai famosi minigiochi "playable ads": raccogli i mazzi di fiori,
portali al bancone, servi i clienti in fila, incassa le pile di banconote e usa i
soldi per far crescere il tuo giardino.

## Come si gioca

- **Muoviti**: trascina il dito in qualsiasi punto dello schermo (joystick virtuale).
  Su computer: frecce o `W A S D`.
- **Raccogli**: cammina sopra le aiuole: i fiori si impilano tra le tue braccia
  (fino al limite, poi compare **MAX**).
- **Vendi**: stai sulla pedana **VENDI**: lasci i fiori sul bancone e servi il cliente
  in testa alla fila. La nuvoletta 🌷 indica quanti fiori vuole.
- **Incassa**: passa sopra la pila di banconote accanto al bancone.
- **Sblocca**: stai sopra le pedane azzurre con il prezzo per pagarle un po' alla volta.
  Ci sono più pedane insieme (una per ogni spiazzale, una per aprire il prossimo
  spiazzale e una per i potenziamenti): scegli tu cosa comprare.
- **Migliora**: quando uno spiazzale ha tutti i suoi sblocchi compare la pedana
  "Migliora", che alza il prezzo di vendita di quel prodotto. Si può ripetere all'infinito,
  così tutti gli spiazzali continuano a crescere, anche i primi.

### Progressione

Il giardino è diviso in **spiazzali**, ognuno con il suo prodotto, il suo bancone e la sua fila.

**I fiori** (come nella pubblicità):
1. 🌹 **Rose** ($2): lo spiazzale iniziale
2. 🌼 **Margherite** ($3): si apre il cancello in alto (spiazzale da $250)
3. 🍓 **Fragole** ($5): vendute in cassette

Qui sblocchi la seconda aiuola e la **cassiera**, poi per ogni aiuola il **giardiniere**
(raccoglie e porta al bancone) e l'**aratro** (raccolto doppio, ricrescita più veloce).
Alla fine c'è la fontana.

**La fattoria**, dove ogni spiazzale funziona in modo diverso:

4. 🐔 **Pollaio** ($8 le uova): le galline girano nel recinto e fanno le uova per terra.
   Sblocchi altre galline, il **mangime** (più uova) e la **contadina** che le raccoglie.
5. 🐄 **Stalla** ($12 il latte): tagli il fieno nel campo e lo porti alla **mangiatoia**;
   le mucche mangiano e fanno due bottiglie di latte. Sblocchi altre mucche, il **fattore**
   (porta il fieno), il **nastro trasportatore** (latte al bancone) e il **trattore** per il fieno.
6. 🎂 **Pasticceria** ($40 le torte): porti **uova + latte** al tavolo del forno e lui sforna
   le torte. Sblocchi il **pasticcere**, il **forno veloce** e il **furgoncino**, che passa
   dal pollaio e dalla stalla a prendere uova e latte e li porta al forno.

Più aiutanti lavorano in uno spiazzale, più clienti arrivano.

### Nuovo giardino ⭐

Quando hai aperto tutti gli spiazzali compare l'ultima pedana, **Nuovo giardino**.
Si ricomincia da capo, ma con una stella in più: ogni stella fa guadagnare
il **50% in più** su ogni vendita, quindi ogni giro è più veloce del precedente.

I progressi si salvano da soli sul dispositivo.

## Provarlo sul computer

Serve un piccolo server locale (i moduli JavaScript non si aprono con doppio clic):

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

## Metterlo sul telefono come app

1. Pubblica la cartella online. Il modo più semplice è **GitHub Pages**: nel repository
   vai su *Settings → Pages*, scegli il branch e la cartella `/ (root)` e salva.
2. Apri il link dal telefono:
   - **iPhone (Safari)**: Condividi → *Aggiungi alla schermata Home*
   - **Android (Chrome)**: menu ⋮ → *Installa app* / *Aggiungi a schermata Home*
3. L'icona apre il gioco a schermo intero e funziona anche offline.

Per pubblicarlo su App Store / Google Play si può impacchettare la stessa cartella con
[Capacitor](https://capacitorjs.com/).

## Struttura

| File | Cosa contiene |
| --- | --- |
| `index.html` | pagina, HUD e schermata iniziale |
| `style.css` | grafica dell'interfaccia |
| `game.js` | tutto il gioco (mondo 3D, personaggi, logica, salvataggi) |
| `manifest.json`, `sw.js`, `icons/` | installazione come app e modalità offline |
| `vendor/three.module.min.js` | [three.js](https://threejs.org) r170 (licenza MIT, vedi `vendor/THREE_LICENSE`) |

Per bilanciare il gioco, modifica in `game.js` la lista `UPGRADES` (ordine e prezzi degli sblocchi),
`PRODUCTS` (prezzo di ogni prodotto), `spawnInterval` (quanti clienti arrivano) e i valori
iniziali in `state` (capacità, velocità).
