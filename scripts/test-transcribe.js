const fs = require('fs');
const path = require('path');
const store = require('../store/config');
const whisperApiEngine = require('../src/main/whisper-api-engine');
const apiVault = require('../src/main/api-vault');

async function main() {
  const wavPath = path.join(__dirname, '../last_recording.wav');
  if (!fs.existsSync(wavPath)) {
    console.error(`❌ Error: WAV file not found at: ${wavPath}`);
    console.log('Please make a recording using the Whisper key first, or copy a WAV file there.');
    process.exit(1);
  }

  console.log(`Reading audio file from: ${wavPath}...`);
  const buffer = fs.readFileSync(wavPath);
  
  // Basic check for WAV header size
  if (buffer.length < 44) {
    console.error('❌ Error: Invalid WAV file (too small)');
    process.exit(1);
  }

  // Parse 16-bit mono PCM samples
  const numSamples = (buffer.length - 44) / 2;
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const pcm16 = buffer.readInt16LE(44 + i * 2);
    samples[i] = pcm16 / 32768.0;
  }

  console.log(`Loaded ${samples.length} samples (mono, 16kHz).`);
  
  // Retrieve API profiles from store
  const profiles = apiVault.getFallbackChain('whisper-stt');
  if (!profiles || !profiles.length) {
    console.error('❌ Error: No Whisper API profiles configured in Settings.');
    process.exit(1);
  }

  const activeProfile = profiles[0];
  console.log(`Using active Whisper profile: "${activeProfile.name}" (${activeProfile.provider}/${activeProfile.model})`);
  
  try {
    console.log('Sending audio to transcription endpoint...');
    const result = await whisperApiEngine.transcribe(samples, 16000, activeProfile);
    console.log('\n--- TRANSCRIPTION RESULT ---');
    console.log(result);
    console.log('----------------------------\n');
  } catch (err) {
    console.error('❌ Transcription request failed:', err.message);
  }
}

main().catch(console.error);
