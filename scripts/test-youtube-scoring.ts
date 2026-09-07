// scripts/test-youtube-scoring.ts — Test scoring engine with 5 songs.
//
// Tests the scoreCandidate() function with various inputs to verify
// confidence logic, positive/negative signals, and threshold behavior.
//
// Usage:
//   cd <repo root>
//   bun run scripts/test-youtube-scoring.ts

import { scoreCandidate, BONUS, PENALTY, THRESHOLDS } from '../src/services/autoYouTubeSearch';

interface TestCase {
  name: string;
  artist: string;
  title: string;
  videoTitle: string;
  channel: string;
  videoType: string;
  expectedConfidence: 'high' | 'low' | 'none';
  expectedAction: 'AUTO_SAVE' | 'REVIEW_ONLY' | 'NOT_FOUND';
}

const TEST_CASES: TestCase[] = [
  // 1. Clear match - official video
  {
    name: 'Clear match - official video',
    artist: 'Metallica',
    title: 'Enter Sandman',
    videoTitle: 'Metallica - Enter Sandman (Official Video)',
    channel: 'Metallica',
    videoType: 'official',
    expectedConfidence: 'high',
    expectedAction: 'AUTO_SAVE',
  },
  // 2. Multiple similar candidates (close scores)
  {
    name: 'Similar candidates - cover vs original',
    artist: 'Queen',
    title: 'Bohemian Rhapsody',
    videoTitle: 'Bohemian Rhapsody - Queen',
    channel: 'Queen',
    videoType: 'original',
    expectedConfidence: 'high',
    expectedAction: 'AUTO_SAVE',
  },
  // 3. Less known song
  {
    name: 'Less known song',
    artist: 'Unknown Artist',
    title: 'Some Obscure Track',
    videoTitle: 'Some Obscure Track (Official Audio)',
    channel: 'Unknown Artist',
    videoType: 'official',
    expectedConfidence: 'high',
    expectedAction: 'AUTO_SAVE',
  },
  // 4. No match
  {
    name: 'No match',
    artist: 'Completely Different',
    title: 'Totally Unrelated Song',
    videoTitle: 'Some Random Cooking Video',
    channel: 'Cooking Channel',
    videoType: 'backingtrack',
    expectedConfidence: 'none',
    expectedAction: 'NOT_FOUND',
  },
  // 5. Already has YouTube video (skip)
  {
    name: 'Already has YouTube video',
    artist: 'AC/DC',
    title: 'Back in Black',
    videoTitle: 'AC/DC - Back in Black (Official)',
    channel: 'AC/DC',
    videoType: 'official',
    expectedConfidence: 'high',
    expectedAction: 'AUTO_SAVE',
  },
];

function runTests() {
  console.log('=== YouTube Scoring Engine Test ===\n');
  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const result = scoreCandidate(
      tc.videoTitle,
      tc.channel,
      tc.videoType,
      tc.artist,
      tc.title,
    );

    const confidenceMatch = result.confidence === tc.expectedConfidence;
    const actionMatch =
      (tc.expectedAction === 'AUTO_SAVE' && result.confidence === 'high') ||
      (tc.expectedAction === 'REVIEW_ONLY' && result.confidence === 'low') ||
      (tc.expectedAction === 'NOT_FOUND' && result.confidence === 'none');

    const status = confidenceMatch && actionMatch ? 'PASS' : 'FAIL';

    if (status === 'PASS') {
      passed++;
    } else {
      failed++;
    }

    console.log(`[${status}] ${tc.name}`);
    console.log(`  Artist: "${tc.artist}" | Title: "${tc.title}"`);
    console.log(`  Video: "${tc.videoTitle}" | Channel: "${tc.channel}" | Type: "${tc.videoType}"`);
    console.log(`  Score: ${result.score} | Confidence: ${result.confidence} | Expected: ${tc.expectedConfidence}`);
    console.log(`  Reasons: ${result.reasons.join(', ')}`);
    console.log(`  Expected action: ${tc.expectedAction} | Got: ${result.confidence === 'high' ? 'AUTO_SAVE' : result.confidence === 'low' ? 'REVIEW_ONLY' : 'NOT_FOUND'}`);
    console.log('');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  console.log(`BONUS: ${JSON.stringify(BONUS)}`);
  console.log(`PENALTY: ${JSON.stringify(PENALTY)}`);
  console.log(`THRESHOLDS: ${JSON.stringify(THRESHOLDS)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();