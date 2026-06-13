const { getWordCorrections } = require('../src/main/correction-detector');
const store = require('../store/config');
const { applyTextReplacements } = require('../src/main/text-replacements');

function runTest() {
  console.log('--- STARTING LIVE CORRECTION TEST ---');
  
  // 1. Set the original dictated text (transcription of last_recording.wav)
  const originalDictation = "Hey Johan, how are you? Hope you are doing well. Is everything alright?";
  
  // 2. Set the corrected text (simulating user manually changing Johan -> Johon)
  const editedText = "Hey Johon, how are you? Hope you are doing well. Is everything alright?";
  
  console.log(`Original Dictation: "${originalDictation}"`);
  console.log(`User Edited Text:   "${editedText}"`);
  
  // 3. Detect corrections
  const corrections = getWordCorrections(originalDictation, editedText);
  console.log('\nDetected Corrections:', corrections);
  
  if (corrections.length === 0) {
    console.error('❌ Failed: No corrections detected.');
    return;
  }
  
  // 4. Simulate saving corrections
  console.log('\nSimulating saving corrections...');
  for (const corr of corrections) {
    const { say, replace } = corr;
    
    // Save to textReplacements
    const rules = store.get('textReplacements') || [];
    const existingIndex = rules.findIndex(r => r.say.toLowerCase() === say.toLowerCase());
    if (existingIndex >= 0) {
      rules[existingIndex].replace = replace;
    } else {
      rules.push({ say, replace });
    }
    store.set('textReplacements', rules);
    console.log(`✅ Saved replacement: "${say}" -> "${replace}"`);
    
    // Save to aiPersonalDictionary
    let dict = store.get('aiPersonalDictionary') || '';
    let words = dict.split(',').map(w => w.trim()).filter(Boolean);
    if (!words.some(w => w.toLowerCase() === replace.toLowerCase())) {
      words.push(replace);
      store.set('aiPersonalDictionary', words.join(', '));
      console.log(`✅ Added to AI dictionary: "${replace}"`);
    }
  }
  
  // 5. Test if future dictation automatically replaces Johan -> Johon
  const testInput = "Tell Johan to call me back.";
  const testOutput = applyTextReplacements(testInput);
  console.log(`\nTesting future dictation:`);
  console.log(`Input:  "${testInput}"`);
  console.log(`Output: "${testOutput}"`);
  
  if (testOutput.includes('Johon')) {
    console.log('\n🎉 SUCCESS: The correction was learned and successfully applied!');
  } else {
    console.error('\n❌ Failed: The correction was not applied.');
  }
}

runTest();
