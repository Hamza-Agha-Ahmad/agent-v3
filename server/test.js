const Fuse = require('fuse.js');
const fs = require('fs');

const tours = JSON.parse(fs.readFileSync('../src/data/tours.json', 'utf8'));
console.log('Total tours:', tours.length);

const fuse = new Fuse(tours, {
  keys: ["ACTIVITIES"],
  threshold: 0.5,
  minMatchCharLength: 2
});

// Test 1: Exact word
console.log('\n--- Test "safari" ---');
const r1 = fuse.search('safari');
console.log('Results:', r1.length);
if (r1[0]) console.log('Top:', r1[0].item.ACTIVITIES, '| score:', r1[0].score);

// Test 2: Typo
console.log('\n--- Test "sfari" ---');
const r2 = fuse.search('sfari');
console.log('Results:', r2.length);
if (r2[0]) console.log('Top:', r2[0].item.ACTIVITIES, '| score:', r2[0].score);

// Test 3: Full typo phrase
console.log('\n--- Test "desrt sfari" ---');
const r3 = fuse.search('desrt sfari');
console.log('Results:', r3.length);
if (r3[0]) console.log('Top:', r3[0].item.ACTIVITIES, '| score:', r3[0].score);

// Test 4: Check if any tour has "safari"
console.log('\n--- Tours with "safari" ---');
const safariTours = tours.filter(t => t.ACTIVITIES.toLowerCase().includes('safari'));
console.log('Count:', safariTours.length);
if (safariTours[0]) console.log('First:', safariTours[0].ACTIVITIES);
