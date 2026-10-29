# Quiztopher Nolan

The stall quiz for Cyber Security Awareness Month: one offline HTML file that runs full screen on a laptop.
Each visitor plays 10 questions that go from easy to hard. Four wrong in a row and they're out; six right wins a goodie
(a sticker). Eight right and they pick which sticker they want. A safety tip follows every answer.

**The app is `dist/Quiztopher-Nolan.html`.** Double-click it, or copy it to a pen drive. It needs no internet,
no server and no install. Use Chrome or Edge.

## On the day (about five minutes)

1. Plug the laptop in and turn off sleep and screen timeout.
2. Open `Quiztopher-Nolan.html` in Chrome or Edge. The first tap on *Tap to play* goes full screen.
   For a harder lock, start the browser in kiosk mode, for example
   `chrome --kiosk "file:///path/to/Quiztopher-Nolan.html"`.
3. Open the admin panel: **Ctrl + Shift + A**, or tap the shield logo five times, then the 8-digit PIN.
   **The PIN starts as 12345678. Change it in Event and kiosk before the stall opens.** The app refuses
   PINs anyone would guess first (one digit repeated, or a run like 12345678), keeps only a salted hash of
   the PIN, and locks the PIN pad for 30 seconds after five wrong tries.
   While you're there, add the club name and the team members (one full name per line, up to 8).
   The names appear under "Made by" on the attract screen and the queue screen.
4. In **Goodies**, set how many goodies you have. In **Stickers**, type how many copies of each sticker sheet you
   printed and press *Reset stickers* (this also clears the picks from your test games), then hide any sticker you
   don't have. In **Event and kiosk**, choose a backup file
   (Chrome and Edge save to it after every game).
5. Optional: in **Event and kiosk**, open the queue screen, drag that window onto a TV and press F11.
6. Set the volume low, play one test game, and check the PIN works.
7. Keep a copy of the file on a pen drive in case the laptop needs swapping.

## The sticker pick

Players who get 8 or more right (the number is in **Modules → Sticker pick at right answers**) see every sticker after
the game, tap the one they want and press *This one*, or *Surprise me* for a random one. The win screen then shows their
sticker with its place on the sheets (for example "Sheet 2, no. 3"), so the volunteer can find it. They can change their
mind until the volunteer confirms the hand-over. Players with 6 or 7 right get a sticker the volunteer picks.

Only the four approved sheets are used: Sheet 1 is `Stickers/10.png`, Sheet 2 `11.png`, Sheet 3 `41.png` and Sheet 4
`50.png` (pages 1 to 4 of `Stickers-1.pdf`). They hold 51 stickers in 47 designs; Pink hearts, Graduation loading,
Pink bow and In my tech girl era are printed twice.

In the **Stickers** tab:

- **Show or hide** any sticker, a whole sheet, or all of them. Players only see the ones shown.
- **Remove a sticker once it's picked** (on by default): each pick takes one off its count, and at 0 it leaves the list.
  Turn it off to keep the counts as they are and take stickers off by hand with the − button or *Hidden*.
- **Reset stickers** (top of the Stickers tab, and in Event and kiosk next to *Reset decks*) puts every picked sticker
  back, as if none had been picked, and starts *Recent picks* again. Use it after testing, or after a new print run.
  It fills the counts from **Copies printed of each sheet**, and can also show every hidden sticker again. The
  Goodies log and the spreadsheets keep the record of who picked what.
- *Recent picks* lists who picked what since the last reset. The Goodies log, *Check a code* and the spreadsheets
  show the sticker too.

To turn the whole feature off, switch off **Sticker pick** in Modules (or in the Stickers tab). Every winner then gets
a goodie the volunteer picks, as before. The pick also stays out of the way by itself when no stickers are left to show,
when goodies run out, or when the goodie rule is off.

## At the end of the event

**Goodies → End event** downloads the final spreadsheet and clears the log.
Clearing the browser's history also clears the log, which is why the backup file matters.

## What volunteers can change (admin panel)

| Tab | What's there |
|---|---|
| Modules | Every feature as a switch: rules and their numbers (including the sticker pick), timer, ladder, boss questions, picture clues, no-repeat decks, 50:50 and hint, tips, mascot, meters, sound, animations, attract screen, goodie codes, stock, idle reset, kiosk lock, feedback. Save and load presets (Stall default, Practice, Quick round, or your own). |
| Questions and packs | Turn packs on or off, rename, duplicate, reorder, export or delete them. Edit, hide, pin or add any question with a live preview. Import or export a spreadsheet (CSV). Undo the last 25 changes. |
| Goodies | Stock, codes, hand-overs, and the goodie log (with each player's sticker). |
| Stickers | The sticker pick: which stickers players see, how many are left, automatic removal, and recent picks. |
| Stats | Players, goodies, where players got out, the questions people miss most, and a day-by-day table. |
| Look and text | Midnight glass or Paper theme, animation level, sound, every word visitors see, and the attract-screen tips. |
| Event and kiosk | Quiz name, club name, tagline, team members, club logo, PIN, kiosk timings, backup and restore, queue screen, decks, and a full reset. |

### Writing questions in a spreadsheet

Export a pack to see the columns. The ones that matter are `question`, `format` (`mcq`, `true_false`,
`scam_or_safe`, `fill_in`, `full_form`, `picture`), `option_1` to `option_4`, `answer` (1 to 4, or the answer's text),
`difficulty` (`easy`, `medium`, `hard`, `challenge`), `hint` and `tip`. Save as CSV and import it.
Wrap web addresses in backticks (`` `mybank.bank.in` ``) for the code font, and type `______` for a blank.

## How a game is built

| Questions | Stage | From |
|---|---|---|
| 1 to 3 | Warm-up | the easy deck |
| 4 to 7 | Getting tricky | the medium deck; question 6 is a picture clue |
| 8 | Final stretch | the hard deck, or a hard picture clue (about half the time) |
| 9 and 10 | Boss questions | the challenge round, Q61 to 90 |

Each deck is shuffled and saved on the laptop, so no question comes back until its whole deck has been used.
Questions a player didn't reach go back into their decks. The 30 challenge questions go round every 15 games.

## For developers

```
src/
  data/questions.js   the 120 questions, packs and attract-screen tips
  data/pictures.js    the 30 picture-round drawings (SVG)
  data/strings.js     every visitor-facing word (overridable in the admin panel)
  data/stickers.js    the 47 sticker designs: name, sheet, and where each one is printed
  engine.js           settings, storage, decks, ladder, rules, stats, CSV (no DOM)
  kit.js              icons, the Kavach mascot, sound (Web Audio) and confetti
  app.js              the visitor screens, kiosk lock, idle reset, backup, queue screen
  admin.js            the admin panel
  styles.css, admin.css, index.html
fonts/                Inter, Space Grotesk and JetBrains Mono (embedded at build time)
assets/stickers/      one picture per sticker design, cut from the sheets (embedded at build time)
tools/cut_stickers.py cuts ../Stickers/10.png, 11.png, 41.png and 50.png into assets/stickers/
build.py              inlines everything into dist/Quiztopher-Nolan.html
tests/engine.test.js  rules, ladder, 100-game no-repeat stress test, every dealing switch, CSV round trip, sticker pick
tests/browser.js      plays every screen in headless Chromium and screenshots it
```

Build: `python3 build.py`. If the sticker sheets change, run `python3 tools/cut_stickers.py` first (add
`--sheet check.png` for a contact sheet of the cuts). Test the engine: `deno test --allow-read tests/engine.test.js`.
Browser run (needs Chromium started with `--remote-debugging-port=9333` and the `dist` folder served over HTTP):
`deno run -A tests/browser.js http://127.0.0.1:8765/Quiztopher-Nolan.html shots 1366 768`.

The stage is drawn at 900 px tall and a width that follows the screen's shape, then scaled to fit, so 1366 × 768
and 1920 × 1080 laptops get the same layout. All data stays in the browser's storage on the laptop; names are
never saved.
