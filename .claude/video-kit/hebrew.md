# Hebrew narration

How to write and voice a Hebrew video so it sounds like a native speaker, not an English voice
reading Hebrew. Hebrew is written without vowels, has grammatical gender everywhere, and stresses
words differently from English: a script that reads well on screen can still sound foreign, wrong or
gendered when a voice reads it.

## The spec

```js
import { HE_PRONOUNCE } from '/vercel/sandbox/.tooling/video-kit/scripts/he-pronounce.mjs';

lang: 'he',
elevenlabs: { voice: 's0T0DT6EAPeX57MQpn3I', model: 'eleven_v4' }, // Danit
pronounce: { ...HE_PRONOUNCE, '2.0': 'שתיים נקודה אפס' },
```

- **A native Israeli voice, never an English one.** Danit (`s0T0DT6EAPeX57MQpn3I`, female, natural,
  the default) or Itamar (`l7Q9rbdCC6j3J5dNlOOg`, male narrator).
- **`eleven_v4` with `lang: 'he'`.** The kit then sends `language_code: "he"`; without it the model
  guesses the language and gets vowels and stress wrong. Multilingual v2 can't speak Hebrew, so the
  kit never falls back to it, and there is no offline Hebrew voice: when the narration allowance is
  unavailable, a Hebrew video is `narrator: 'none'` (captions carry the words). Say so in your report.
- Captions and title cards follow the text's direction (right to left), and Heebo covers the
  Hebrew letters. Write `*emphasis*` and `at:` cues in Hebrew as usual.
- The kit transcribes each line back with ElevenLabs Scribe and prints `possibly mispronounced` for
  words it heard differently: reword those lines or add a `pronounce` entry, then re-render.

## Grammar and gender

- **Speak to everyone at once, in the plural or impersonally:** "לוחצים על", "אפשר לבחור", "בוחרים".
  Never the singular "you" in either gender (את, אתה, תלחץ, תלחצי, שלך).
- **Avoid "your" where you can:** "החשבון", "ההתקדמות נשמרת"; "שלכם" only when the sentence needs it.
- **The narrator doesn't talk about herself.** For a shared step, the first person plural: "בואו
  נראה", "נעבור על".
- **Agreement, every time:** the verb and adjective take the gender and number of their noun
  (אפליקציה feminine: "האפליקציה נטענת"; סוכן masculine: "הסוכן עונה"; נתונים masculine plural).
  A name in English takes the gender of what it is.
- **"את" before a definite direct object:** "פותחים את הדוח", not "פותחים הדוח".
- **Hebrew verbs, not English ones:** "ללחוץ" (not "לעשות קליק"), "לבחור ב־", "להיכנס ל־", "לשתף".

## Labels on screen

- **Say a label exactly as the screen shows it,** so the viewer finds it: a Hebrew app's labels in
  Hebrew, an English label in English ("לוחצים על **New order**"). Never translate a label.
- **A Hebrew prefix joins an English word with a maqaf:** "ב־Settings", "ל־Orders". Use the real
  maqaf (־, U+05BE), not a hyphen.
- **At most three English words in a row,** then back to Hebrew.

## Rhythm and emphasis

- **One idea per sentence, about 14 words at most.** Long Hebrew sentences lose their stress.
- **The new or important word goes at the end of the sentence,** where Hebrew puts its stress.
- **Punctuation is the emphasis control** (no SSML): a comma for a breath, a colon before an
  explanation, a full stop for a beat. No parentheses, slashes or "וכו׳".
- **Numbers as words in speech,** through `pronounce` (`'0.2': 'אפס נקודה שתיים'`), so captions keep
  the digits.

## Vowels (niqqud)

- **Captions stay unpointed.** Pointing goes only to the voice, through `pronounce`:
  `{ 'לסנן': 'לְסַנֵּן' }` replaces the word in what's spoken and leaves the caption alone.
  `HE_PRONOUNCE` already covers common verbs; add the video's own words after it.
- **Point only words a reader could misread:** piel and pual verbs ("לְסַנֵּן", "לְמַיֵּן", "מְרַכֵּז"),
  words with two common readings, rare or technical words. Pointing every word makes the voice slow
  and stiff.
- When a word reads two ways in different places, reword the sentence instead of pointing it.
