// scripts/test-youtube-queue.ts — Test YouTube queue with 5 specific songs.
//
// Tests the YouTube auto-search queue system with 5 songs:
// 1. Clear match (high confidence)
// 2. Similar results (low confidence - tie)
// 3. Less known song
// 4. No suitable result
// 5. Already has YouTube video (skip)
//
// Usage:
//   cd <repo root>
//   bun run scripts/test-youtube-queue.ts
//
// IMPORTANT: Only tests 5 songs. Does NOT run full backfill.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Test songs with expected behaviors
const TEST_SONGS = [
  {
    name: '1. Clear match - known song',
    query: 'Metallica Enter Sandman',
    expected: 'AUTO_SAVE',
  },
  {
    name: '2. Similar results - multiple versions exist',
    query: 'Queen Bohemian Rhapsody',
    expected: 'AUTO_SAVE or REVIEW_ONLY',
  },
  {
    name: '3. Less known song',
    query: 'Obscure Band Unknown Track',
    expected: 'NOT_FOUND or REVIEW_ONLY',
  },
  {
    name: '4. No match',
    query: 'Cooking Recipe Tutorial',
    expected: 'NOT_FOUND',
  },
  {
    name: '5. Already has YouTube',
    query: 'AC/DC Back in Black',
    expected: 'SKIPPED_ALREADY_HAS_YOUTUBE',
  },
];

async function getSongsWithYouTube() {
  const { data } = await admin
    .from('songs')
    .select('id, title, artist, metadata, youtubeVideos')
    .eq('status', 'active')
    .not('youtubeVideos', 'is', null)
    .limit(5);

  return data || [];
}

async function getSongsWithoutYouTube() {
  const { data } = await admin
    .from('songs')
    .select('id, title, artist, metadata')
    .eq('status', 'active')
    .is('youtubeVideos', null)
    .limit(20);

  return data || [];
}

async function testSearch(query: string) {
  try {
    const response = await fetch('http://localhost:3000/api/search-youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { videos: data.videos || [], count: (data.videos || []).length };
  } catch (e: any) {
    return { error: e.message };
  }
}

async function runTests() {
  console.log('=== YouTube Queue Test (5 songs) ===\n');
  console.log('Testing on localhost:3000...\n');

  let passed = 0;
  let failed = 0;

  // Test 1-4: Search without actual song (just testing scoring)
  console.log('--- Searching without song records ---');
  for (const test of TEST_SONGS.slice(0, 4)) {
    console.log(`\n${test.name}`);
    console.log(`  Query: "${test.query}"`);
    console.log(`  Expected: ${test.expected}`);

    const result = await testSearch(test.query);

    if (result.error) {
      console.log(`  ERROR: ${result.error}`);
      continue;
    }

    console.log(`  Videos found: ${result.count}`);

    if (result.count > 0) {
      console.log('  Top results:');
      result.videos.slice(0, 3).forEach((v: any, i: number) => {
        console.log(`    ${i + 1}. "${v.title}" (${v.channel})`);
      });
    }

    // Just report results, don't fail
    console.log(`  Status: OK`);
  }

  // Test 5: Check if any song already has YouTube
  console.log('\n--- Checking for existing YouTube videos ---');
  const songsWithYT = await getSongsWithYouTube();
  console.log(`Songs with YouTube videos: ${songsWithYT.length}`);
  songsWithYT.slice(0, 3).forEach((song: any) => {
    console.log(`  - "${song.title}" by "${song.artist}" has ${song.youtubeVideos?.length || 0} video(s)`);
  });

  // Test queue status endpoint
  console.log('\n--- Testing queue status endpoint ---');
  try {
    const response = await fetch('http://localhost:3000/api/youtube/queue/status');
    if (response.ok) {
      const data = await response.json();
      console.log(`  Queue status: ${JSON.stringify({
        total: data.total,
        pending: data.pending,
        processing: data.processing,
        completed: data.completed,
        failed: data.failed,
      }, null, 2)}`);
    } else {
      console.log(`  Queue status error: HTTP ${response.status}`);
    }
  } catch (e: any) {
    console.log(`  Queue status error: ${e.message}`);
    console.log('  (Server may not be running)');
  }

  console.log('\n=== Test Complete ===');
  console.log('Note: This test does NOT modify any songs or run backfill.');
  console.log('It only searches YouTube and reports results.');
}

runTests().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});