export interface BadgeDef { id: string; name: string; skill: string; emoji: string }
export const BADGES: BadgeDef[] = [
  { id: 'form-builder', name: 'Form Builder', skill: 'Built am / is / are + verb-ing in the Checkpoint', emoji: '🧱' },
  { id: 'spelling-sleuth', name: 'Spelling Sleuth', skill: 'Spelled the -ing forms in the picture exercise', emoji: '🔎' },
  { id: 'matchmaker', name: 'Matchmaker', skill: 'Linked every situation with the sentence that follows', emoji: '🧩' },
  { id: 'question-builder', name: 'Question Builder', skill: 'Put be before the subject in every question', emoji: '❓' },
  { id: 'clue-detective', name: 'Clue Detective', skill: 'Found 10 clues before choosing positive or negative', emoji: '🕵️' },
  { id: 'mistake-hunter', name: 'Mistake Hunter', skill: 'Spotted and fixed four typical errors', emoji: '🩹' },
  { id: 'combo-keeper', name: 'Combo Keeper', skill: 'Kept a ×3 combo in the Rapid Review', emoji: '⚡' },
  { id: 'clear-speaker', name: 'Clear Speaker', skill: 'Average clarity of 85% or more in the Talk level', emoji: '🎙️' },
  { id: 'question-master', name: 'Question Master', skill: 'Asked every Talk question correctly on the first try', emoji: '🙋' },
  { id: 'smooth-talker', name: 'Smooth Talker', skill: 'Five first-try turns in a row while speaking', emoji: '🌊' },
  { id: 'word-detective', name: 'Word Detective', skill: 'Practised single words with the slow model three times', emoji: '🔬' },
  { id: 'fearless-first-try', name: 'Fearless First Try', skill: 'Passed your very first speaking turn at the first attempt', emoji: '🦁' },
  { id: 'unit-complete', name: 'Unit Champion', skill: 'Finished the whole unit', emoji: '🏆' },
  { id: 'streak-3', name: 'Three-Day Streak', skill: 'Practised three days in a row', emoji: '🔥' },
];
export const BADGE_FOR_EXERCISE: Record<string, string> = {
  gapFill: 'form-builder', pictureVerb: 'spelling-sleuth', matching: 'matchmaker', buildQuestion: 'question-builder',
};
