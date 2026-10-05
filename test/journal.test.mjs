// Deterministic unit tests for the CASE FILE journal (story.js). The journal is
// purely local data — it must never touch the network — so these tests assert
// the exact record/dedupe/ordering contract the client relies on.
import assert from 'assert';
import {
  newJournalRecord, recordJournal, journalEntriesFor, journalKey, JOURNAL_LIMITS,
  STORY, LEVEL_ORDER, introFor, beatsFor, beatFor,
} from '../client/js/story.js';

let passed = 0;
function check(cond, label) {
  assert.ok(cond, label);
  passed++;
  console.log('  \u2714 ' + label);
}

// 1. a fresh record is empty
{
  const rec = newJournalRecord();
  check(journalEntriesFor(rec).length === 0, 'fresh journal is empty');
}

// 2. record + dedupe by explicit key
{
  const rec = newJournalRecord();
  check(recordJournal(rec, 0, 'beat', 'A FRAGMENT', 0) === true, 'first record returns true');
  check(recordJournal(rec, 0, 'beat', 'A FRAGMENT', 0) === false, 'same key is deduped');
  check(journalEntriesFor(rec).length === 1, 'deduped record holds one entry');
}

// 3. records at different levels coexist and are keyed per level
{
  const rec = newJournalRecord();
  recordJournal(rec, 0, 'intro', 'LEVEL ZERO LINE', 0);
  recordJournal(rec, 3, 'intro', 'LEVEL THREE LINE', 0);
  const entries = journalEntriesFor(rec);
  check(entries.length === 2, 'two levels recorded');
  check(entries[0].level === 0 && entries[1].level === 3, 'levels ascend in the file');
}

// 4. kind ordering: intro before beat before cache before ambient before radio
{
  const rec = newJournalRecord();
  recordJournal(rec, 1, 'radio', 'R');
  recordJournal(rec, 1, 'ambient', 'A');
  recordJournal(rec, 1, 'cache', 'C');
  recordJournal(rec, 1, 'beat', 'B');
  recordJournal(rec, 1, 'intro', 'I');
  const kinds = journalEntriesFor(rec).map((e) => e.kind);
  check(JSON.stringify(kinds) === JSON.stringify(['intro', 'beat', 'cache', 'ambient', 'radio']),
    'entries read in story order within a level');
}

// 5. insertion order is preserved within a kind (beats read in the order found)
{
  const rec = newJournalRecord();
  recordJournal(rec, 0, 'beat', 'FIRST', 0);
  recordJournal(rec, 0, 'beat', 'SECOND', 1);
  recordJournal(rec, 0, 'beat', 'THIRD', 2);
  const texts = journalEntriesFor(rec).map((e) => e.text);
  check(JSON.stringify(texts) === JSON.stringify(['FIRST', 'SECOND', 'THIRD']),
    'beats keep discovery order');
}

// 6. ambient/radio are capped; authored intros/beats are not
{
  const rec = newJournalRecord();
  for (let i = 0; i < JOURNAL_LIMITS.ambient + 5; i++) recordJournal(rec, 2, 'ambient', `whisper ${i}`, i);
  const ambient = journalEntriesFor(rec).filter((e) => e.kind === 'ambient');
  check(ambient.length === JOURNAL_LIMITS.ambient, 'ambient capped at ' + JOURNAL_LIMITS.ambient);

  const rec2 = newJournalRecord();
  for (let i = 0; i < 40; i++) recordJournal(rec2, 2, 'beat', `beat ${i}`, i);
  check(journalEntriesFor(rec2).filter((e) => e.kind === 'beat').length === 40,
    'authored beats are never dropped');
}

// 7. empty text is rejected; null/undefined records are safe
{
  const rec = newJournalRecord();
  check(recordJournal(rec, 0, 'beat', '', 0) === false, 'empty text is rejected');
  check(recordJournal(null, 0, 'beat', 'X', 0) === false, 'null record is safe');
  check(journalEntriesFor(null).length === 0, 'null record yields no entries');
}

// 8. every authored level has an intro and at least one beat, all recordable
{
  for (const lv of LEVEL_ORDER) {
    const rec = newJournalRecord();
    const intros = introFor(lv);
    const beats = beatsFor(lv);
    check(intros.length > 0, `level ${lv} has intro narration`);
    check(beats.length > 0, `level ${lv} has at least one beat`);
    intros.forEach((line, i) => recordJournal(rec, lv, 'intro', line, i));
    beats.forEach((line, i) => recordJournal(rec, lv, 'beat', line, i));
    const n = journalEntriesFor(rec).length;
    check(n === intros.length + beats.length, `level ${lv} records intro + beats (${n})`);
  }
}

// 9. beatFor wraps so the narrative never runs out (index beyond authored beats)
{
  const rec = newJournalRecord();
  const beats = beatsFor(0);
  const wrapped = beatFor(0, beats.length + 1);
  check(wrapped === beats[1], 'beatFor wraps around the authored beats');
  recordJournal(rec, 0, 'beat', wrapped, beats.length + 1);
  check(journalEntriesFor(rec).length === 1, 'wrapped beat is still recorded');
}

// 10. key format is stable (used for dedupe identity)
{
  check(journalKey(3, 'cache', 'arch-1') === '3:cache:arch-1', 'journalKey is level:kind:key');
}

// 11. STORY covers every level in LEVEL_ORDER (no gaps in the narrative)
{
  for (const lv of LEVEL_ORDER) check(!!STORY[lv], `STORY defines level ${lv}`);
}

console.log(`\nJOURNAL TESTS PASSED \u2714  (${passed} assertions)`);
