// The stickers a player can pick from after a high score. Only the four sheets the professor approved are here:
// Sheet 1 is Stickers/10.png, Sheet 2 is 11.png, Sheet 3 is 41.png and Sheet 4 is 50.png (also Stickers-1.pdf, pages 1 to 4).
// Each entry is one design. `spots` lists where it sits on the sheets as sheet-number, counting left to right, top to bottom;
// a design printed twice has two spots. The pictures are cut by tools/cut_stickers.py and embedded by build.py.

window.QN_STICKER_SHEETS = [
  { id: "1", name: "Sheet 1", file: "10.png" },
  { id: "2", name: "Sheet 2", file: "11.png" },
  { id: "3", name: "Sheet 3", file: "41.png" },
  { id: "4", name: "Sheet 4", file: "50.png" },
];

window.QN_STICKERS = [
  { id: "1-01", sheet: "1", name: "Pink hearts", spots: ["1-01", "1-03"] },
  { id: "1-02", sheet: "1", name: "Spotify code", spots: ["1-02"] },
  { id: "1-04", sheet: "1", name: "Graduation loading", spots: ["1-04", "1-09"] },
  { id: "1-05", sheet: "1", name: "Pink bow", spots: ["1-05", "1-10"] },
  { id: "1-06", sheet: "1", name: "Python heartbeat", spots: ["1-06"] },
  { id: "1-07", sheet: "1", name: "Pink Wi-Fi", spots: ["1-07"] },
  { id: "1-08", sheet: "1", name: "</code>", spots: ["1-08"] },
  { id: "1-11", sheet: "1", name: "Code and coffee", spots: ["1-11"] },
  { id: "1-12", sheet: "1", name: "Programming languages", spots: ["1-12"] },

  { id: "2-01", sheet: "2", name: "Java logo", spots: ["2-01"] },
  { id: "2-02", sheet: "2", name: "Code duck", spots: ["2-02"] },
  { id: "2-03", sheet: "2", name: "Docker", spots: ["2-03"] },
  { id: "2-05", sheet: "2", name: "Java file", spots: ["2-05"] },
  { id: "2-06", sheet: "2", name: "Code girlie", spots: ["2-06"] },
  { id: "2-07", sheet: "2", name: "Programmer loading", spots: ["2-07"] },
  { id: "2-08", sheet: "2", name: "Error windows", spots: ["2-08"] },

  { id: "3-01", sheet: "3", name: "Powered by caffeine and code", spots: ["3-01"] },
  { id: "3-02", sheet: "3", name: "Hello World", spots: ["3-02"] },
  { id: "3-03", sheet: "3", name: "Not a bug, a feature", spots: ["3-03"] },
  { id: "3-04", sheet: "3", name: "Ctrl + Alt + Delete", spots: ["3-04"] },
  { id: "3-05", sheet: "3", name: "Copy-paste from Stack Overflow", spots: ["3-05"] },
  { id: "3-06", sheet: "3", name: "Eat, sleep, code, repeat", spots: ["3-06"] },
  { id: "3-07", sheet: "3", name: "In Linux we trust", spots: ["3-07"] },
  { id: "3-08", sheet: "3", name: "The cloud", spots: ["3-08"] },
  { id: "3-09", sheet: "3", name: "Repeat", spots: ["3-09"] },
  { id: "3-10", sheet: "3", name: "In Linux we trust (green)", spots: ["3-10"] },
  { id: "3-11", sheet: "3", name: "The cloud (green)", spots: ["3-11"] },
  { id: "3-12", sheet: "3", name: "I just fixed the code", spots: ["3-12"] },

  { id: "4-01", sheet: "4", name: "Very tired college student", spots: ["4-01"] },
  { id: "4-02", sheet: "4", name: "Certified yapper", spots: ["4-02"] },
  { id: "4-03", sheet: "4", name: "I’m okay", spots: ["4-03"] },
  { id: "4-04", sheet: "4", name: "Full-stack developer", spots: ["4-04"] },
  { id: "4-05", sheet: "4", name: "Never give up", spots: ["4-05"] },
  { id: "4-06", sheet: "4", name: "Let me think", spots: ["4-06"] },
  { id: "4-07", sheet: "4", name: "Trust yourself", spots: ["4-07"] },
  { id: "4-08", sheet: "4", name: "Study mode on", spots: ["4-08"] },
  { id: "4-09", sheet: "4", name: "Too many tabs open", spots: ["4-09"] },
  { id: "4-10", sheet: "4", name: "Make yourself a priority", spots: ["4-10"] },
  { id: "4-11", sheet: "4", name: "Trust the process", spots: ["4-11"] },
  { id: "4-12", sheet: "4", name: "I bee-leaf in you", spots: ["4-12"] },
  { id: "4-13", sheet: "4", name: "Coding girlie", spots: ["4-13"] },
  { id: "4-14", sheet: "4", name: "Main character energy", spots: ["4-14"] },
  { id: "4-15", sheet: "4", name: "VS Code", spots: ["4-15"] },
  { id: "4-16", sheet: "4", name: "Focus mode", spots: ["4-16"] },
  { id: "4-17", sheet: "4", name: "In my tech girl era", spots: ["4-17", "2-04"] },
  { id: "4-18", sheet: "4", name: "Nap-a-holic", spots: ["4-18"] },
  { id: "4-19", sheet: "4", name: "Hello, world!", spots: ["4-19"] },
];
