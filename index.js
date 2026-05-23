// Daycation Agent v3.1.1 — Full Arabic Support + English
// Gemini model: gemini-2.0-flash (gemini-1.5-flash was shut down by Google in 2026)
// Arabic: keywords, normalization, number extraction, greetings, RTL-safe responses
// Fixed: ALL quote collisions using backslash escaping

require("dotenv").config();
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const Fuse = require("fuse.js");
const chrono = require("chrono-node");
const morgan = require("morgan");
const { getTourRecommendation } = require('./llm');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan("combined"));

/* ============================================
   UNIVERSAL BODY EXTRACTOR
   ============================================ */
function extractBody(req) {
  if (req.body?.Body) return req.body.Body.trim();
  try {
    const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (messages && messages[0]?.text?.body) return messages[0].text.body.trim();
  } catch (e) {}
  if (req.body?.body) return req.body.body.trim();
  if (req.body?.message) return req.body.message.trim();
  if (req.body?.text) return req.body.text.trim();
  return "";
}

function extractFrom(req) {
  if (req.body?.From) return req.body.From;
  try {
    const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (messages && messages[0]?.from) return messages[0].from;
  } catch (e) {}
  return "unknown";
}

/* ============================================
   ARABIC UTILITIES
   ============================================ */

// Detect if text contains Arabic characters
function containsArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

// Normalize Arabic: remove diacritics, unify alef/ya variants
function normalizeArabic(text) {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')           // remove tashkeel/diacritics
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')     // alef variants -> ا
    .replace(/\u0649/g, '\u064A')                    // alif maqsura -> ya
    .replace(/\u0624/g, '\u0648')                    // hamza on waw -> و
    .replace(/\u0626/g, '\u064A')                    // hamza on ya -> ي
    .trim();
}

// Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) -> Western (0123456789)
const EASTERN_TO_WESTERN = {
  '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4',
  '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9'
};

function convertEasternNumerals(text) {
  return text.split('').map(c => EASTERN_TO_WESTERN[c] || c).join('');
}

// Arabic word numbers -> digits
const ARABIC_WORD_NUMBERS = {
  'واحد': 1, 'واحدة': 1, 'شخص': 1, 'فرد': 1,
  'اثنان': 2, 'اثنين': 2, 'شخصين': 2, 'فردين': 2,
  'ثلاثة': 3, 'ثلاث': 3, 'اربعة': 4, 'أربعة': 4,
  'خمسة': 5, 'خمس': 5, 'ستة': 6, 'ست': 6,
  'سبعة': 7, 'سبع': 7, 'ثمانية': 8, 'ثمان': 8, 'ثماني': 8,
  'تسعة': 9, 'تسع': 9, 'عشرة': 10, 'عشر': 10,
  'عشرون': 20, 'ثلاثون': 30, 'اربعون': 40, 'خمسون': 50
};

function extractArabicWordNumber(text) {
  const lower = normalizeArabic(text.toLowerCase());
  for (const [word, num] of Object.entries(ARABIC_WORD_NUMBERS)) {
    if (lower.includes(word)) return num;
  }
  return null;
}

/* ============================================
   LOAD TOURS
   ============================================ */
const possiblePaths = [
  path.join(__dirname, "..", "src", "data", "tours.json"),
  path.join(__dirname, "src", "data", "tours.json"),
  path.join(__dirname, "tours.json"),
  path.join(process.cwd(), "src", "data", "tours.json"),
  path.join(process.cwd(), "tours.json"),
];

let TOURS = [];
let toursLoaded = false;

for (const toursFile of possiblePaths) {
  try {
    if (fs.existsSync(toursFile)) {
      TOURS = JSON.parse(fs.readFileSync(toursFile, "utf8"));
      console.log(`Loaded ${TOURS.length} tours from ${toursFile}`);
      toursLoaded = true;
      break;
    }
  } catch (err) {
    console.error(`Error loading from ${toursFile}:`, err.message);
  }
}

if (!toursLoaded) {
  console.error('CRITICAL: Could not load tours.json from any path!');
}

const fuse = new Fuse(TOURS, {
  keys: ["ACTIVITIES"],
  threshold: 0.5,
  minMatchCharLength: 2
});

/* ============================================
   KEYWORDS — ENGLISH + ARABIC
   ============================================ */

const ACTIVITY_KEYWORDS = [
  "desert safari", "dhow cruise", "quad bike", "skydiving", "city tour",
  "museum", "beach", "mountain", "burj khalifa", "abu dhabi", "ferrari world",
  "yacht", "snorkeling", "dubai frame", "global village", "miracle garden",
  "hot air balloon", "sandboarding", "camel ride", "henna", "bbq dinner",
  "aquaventure", "atlantis", "burj al arab", "dubai opera", "img worlds",
  "legoland", "motiongate", "wild wadi", "ski dubai", "dubai mall",
  "safari", "dhow", "cruise", "burj", "khalifa", "balloon", "aquarium",
  "water park", "theme park", "jet ski", "helicopter", "zipline",
  "sky dive", "skydive", "deep dive", "scuba", "crocodile park",
  "opera", "frame", "view at the palm", "palm view", "lost chamber",
  "warner bros", "yas water world", "louvre", "grand mosque",
  "qasr al watan", "emirates palace", "hatta", "musandam", "fujairah",
  "al ain", "sharjah", "muscat", "khasab", "dubai park", "real madrid",
  "madame tussauds", "kidzania", "ice rink", "flying dress",
  "dinner in the sky", "jack sparrow", "ocean express", "house boat",
  "mega yacht", "super yacht", "sunset yacht", "sunrise safari",
  "morning safari", "evening safari", "overnight safari", "red dune",
  "dune bashing", "dune buggy", "sand boarding", "fossil rock",
  "wadi shawaka", "mleiha", "stargazing", "wildlife", "gyrocopter",
  "jet car", "dubai harbour", "marina", "creek", "canal", "gold souk",
  "expo city", "play dubai", "aya", "arte museum", "balloon ride",
  "burj club", "at the top", "observation deck", "lounge",
  "fountain boardwalk", "chauffeur", "airport transfer", "cruise port",
  "inter-hotel", "layover", "stopover", "shore excursion", "self-drive",
  "trekking", "cultural tour", "night tour", "modern dubai", "old dubai",
  "combo", "half day", "full day", "tour", "activity", "experience",
  "adventure", "excursion"
];

// Arabic activity keywords mapped to English equivalents
const ARABIC_ACTIVITY_KEYWORDS = [
  { ar: "سفاري", en: "desert safari" },
  { ar: "سفاري الصحراء", en: "desert safari" },
  { ar: "رحلة بحرية", en: "dhow cruise" },
  { ar: "رحلة بالقارب", en: "dhow cruise" },
  { ar: "برج خليفة", en: "burj khalifa" },
  { ar: "برج", en: "burj" },
  { ar: "خليفة", en: "khalifa" },
  { ar: "جولة مدينة", en: "city tour" },
  { ar: "جولة", en: "tour" },
  { ar: "منطاد", en: "hot air balloon" },
  { ar: "منطاد هواء", en: "hot air balloon" },
  { ar: "يخت", en: "yacht" },
  { ar: "يخوت", en: "yacht" },
  { ar: "صحراء", en: "desert" },
  { ar: "صحاري", en: "desert" },
  { ar: "عشاء", en: "dinner" },
  { ar: "غداء", en: "lunch" },
  { ar: "فطور", en: "breakfast" },
  { ar: "عشاء مشاوي", en: "bbq dinner" },
  { ar: "مطعم", en: "restaurant" },
  { ar: "متحف", en: "museum" },
  { ar: "شاطئ", en: "beach" },
  { ar: "جبل", en: "mountain" },
  { ar: "ابوظبي", en: "abu dhabi" },
  { ar: "أبوظبي", en: "abu dhabi" },
  { ar: "فيراري", en: "ferrari world" },
  { ar: "عالم فيراري", en: "ferrari world" },
  { ar: "غطس", en: "snorkeling" },
  { ar: "دبي فريم", en: "dubai frame" },
  { ar: "القرية العالمية", en: "global village" },
  { ar: "حديقة الزهور", en: "miracle garden" },
  { ar: "ركوب الجمال", en: "camel ride" },
  { ar: "جمل", en: "camel ride" },
  { ar: "تزلج على الرمال", en: "sandboarding" },
  { ar: "حناء", en: "henna" },
  { ar: "أكوافنتشر", en: "aquaventure" },
  { ar: "أتلانتس", en: "atlantis" },
  { ar: "برج العرب", en: "burj al arab" },
  { ar: "أوبرا دبي", en: "dubai opera" },
  { ar: "آي ام جي", en: "img worlds" },
  { ar: "ليجولاند", en: "legoland" },
  { ar: "موشن جيت", en: "motiongate" },
  { ar: "وايلد وادي", en: "wild wadi" },
  { ar: "سكي دبي", en: "ski dubai" },
  { ar: "دبي مول", en: "dubai mall" },
  { ar: "حديقة مائية", en: "water park" },
  { ar: "جيت سكي", en: "jet ski" },
  { ar: "هليكوبتر", en: "helicopter" },
  { ar: "زيب لاين", en: "zipline" },
  { ar: "سكوبا", en: "scuba" },
  { ar: "حديقة التماسيح", en: "crocodile park" },
  { ar: "ذا فيو", en: "view at the palm" },
  { ar: "النخلة", en: "palm view" },
  { ar: "الغرفة المفقودة", en: "lost chamber" },
  { ar: "وارنر بروس", en: "warner bros" },
  { ar: "ياس ووتروورلد", en: "yas water world" },
  { ar: "اللوفر", en: "louvre" },
  { ar: "جامع", en: "grand mosque" },
  { ar: "قصر الوطن", en: "qasr al watan" },
  { ar: "قصر الامارات", en: "emirates palace" },
  { ar: "حتا", en: "hatta" },
  { ar: "مسندم", en: "musandam" },
  { ar: "الفجيرة", en: "fujairah" },
  { ar: "العين", en: "al ain" },
  { ar: "الشارقة", en: "sharjah" },
  { ar: "مسقط", en: "muscat" },
  { ar: "خصب", en: "khasab" },
  { ar: "مدام توسو", en: "madame tussauds" },
  { ar: "كيدزانيا", en: "kidzania" },
  { ar: "حلبة تزلج", en: "ice rink" },
  { ar: "فستان طائر", en: "flying dress" },
  { ar: "عشاء في السماء", en: "dinner in the sky" },
  { ar: "قارب منزل", en: "house boat" },
  { ar: "يخت ضخم", en: "mega yacht" },
  { ar: "يخت غروب", en: "sunset yacht" },
  { ar: "سفاري فجر", en: "sunrise safari" },
  { ar: "سفاري صباح", en: "morning safari" },
  { ar: "سفاري مساء", en: "evening safari" },
  { ar: "سفاري ليلة", en: "overnight safari" },
  { ar: "تطعيس", en: "dune bashing" },
  { ar: "ديون باجي", en: "dune buggy" },
  { ar: "صخور أحفورية", en: "fossil rock" },
  { ar: "وادي شوكة", en: "wadi shawaka" },
  { ar: "مليحة", en: "mleiha" },
  { ar: "رصد النجوم", en: "stargazing" },
  { ar: "حياة برية", en: "wildlife" },
  { ar: "جايروكوبتر", en: "gyrocopter" },
  { ar: "جيت كار", en: "jet car" },
  { ar: "مرسى دبي", en: "dubai harbour" },
  { ar: "المارينا", en: "marina" },
  { ar: "الخور", en: "creek" },
  { ar: "قناة", en: "canal" },
  { ar: "سوق الذهب", en: "gold souk" },
  { ar: "اكسبو سيتي", en: "expo city" },
  { ar: "آيا", en: "aya" },
  { ar: "متحف آرت", en: "arte museum" },
  { ar: "نادي البرج", en: "burj club" },
  { ar: "في الأعلى", en: "at the top" },
  { ar: "سطح مراقبة", en: "observation deck" },
  { ar: "لاونج", en: "lounge" },
  { ar: "ممر النافورة", en: "fountain boardwalk" },
  { ar: "سائق خاص", en: "chauffeur" },
  { ar: "نقل مطار", en: "airport transfer" },
  { ar: "ميناء كروز", en: "cruise port" },
  { ar: "توقف", en: "layover" },
  { ar: "جولة شاطئ", en: "shore excursion" },
  { ar: "قيادة ذاتية", en: "self-drive" },
  { ar: "مشي جبال", en: "trekking" },
  { ar: "جولة ثقافية", en: "cultural tour" },
  { ar: "جولة ليلية", en: "night tour" },
  { ar: "دبي الحديثة", en: "modern dubai" },
  { ar: "دبي القديمة", en: "old dubai" },
  { ar: "باقة", en: "combo" },
  { ar: "نصف يوم", en: "half day" },
  { ar: "يوم كامل", en: "full day" },
  { ar: "نشاط", en: "activity" },
  { ar: "تجربة", en: "experience" },
  { ar: "مغامرة", en: "adventure" },
  { ar: "رحلة", en: "excursion" },
  { ar: "فندق", en: "hotel" },
  { ar: "سيارة", en: "car" },
  { ar: "تاكسي", en: "taxi" }
];

const CS_KEYWORDS = ["agent", "human", "support", "help", "representative", "call", "talk"];

const ARABIC_CS_KEYWORDS = [
  "وكيل", "موظف", "دعم", "مساعدة", "ممثل", "اتصال", "تحدث", "شخص",
  "عميل", "خدمة", "مسؤول", "مشكلة", "شكوى", "استفسار"
];

const RELATED_KEYWORDS = {
  'hotel booking': 'hotel', 'book a hotel': 'hotel', 'hotel room': 'hotel', 'stay at': 'hotel',
  'car rental': 'car', 'rent a car': 'car', 'hire car': 'car',
  'taxi': 'car', 'taxi service': 'car', 'cab': 'car',
  'transport only': 'car', 'just transport': 'car', 'only pickup': 'car',
  'restaurant': 'restaurant', 'restaurant booking': 'restaurant',
  'lunch reservation': 'restaurant', 'dinner reservation': 'restaurant',
  'food delivery': 'restaurant', 'order food': 'restaurant',
  'flight': 'flight', 'flight booking': 'flight', 'air ticket': 'flight',
  'plane ticket': 'flight', 'airport flight': 'flight',
  'visa': 'visa', 'visa application': 'visa', 'passport': 'visa',
  'entry permit': 'visa', 'visit visa': 'visa',
  'wedding planner': 'event', 'birthday party': 'event',
  'event planning': 'event', 'corporate event': 'event',
  'helicopter rental': 'luxury', 'limousine': 'luxury', 'limo': 'luxury',
  'private jet': 'luxury', 'luxury car': 'luxury',
  'photographer hire': 'photo', 'videographer hire': 'photo',
  'camera man': 'photo', 'photo shoot booking': 'photo',
  'custom itinerary': 'private', 'personal guide hire': 'private',
  'exclusive access': 'private', 'vip service': 'private'
};

const ARABIC_RELATED_KEYWORDS = {
  'حجز فندق': 'hotel', 'غرفة فندق': 'hotel', 'إقامة': 'hotel',
  'تأجير سيارة': 'car', 'استئجار سيارة': 'car', 'سيارة أجرة': 'car',
  'نقل فقط': 'car', 'استلام فقط': 'car',
  'حجز مطعم': 'restaurant', 'حجز غداء': 'restaurant', 'حجز عشاء': 'restaurant',
  'توصيل طعام': 'restaurant', 'طلب أكل': 'restaurant',
  'حجز طيران': 'flight', 'تذكرة طيران': 'flight', 'تذكرة طائرة': 'flight',
  'تأشيرة': 'visa', 'طلب تأشيرة': 'visa', 'جواز': 'visa',
  'تصريح دخول': 'visa', 'تأشيرة زيارة': 'visa',
  'منظم زفاف': 'event', 'حفلة عيد ميلاد': 'event',
  'تخطيط فعاليات': 'event', 'فعالية شركات': 'event',
  'تأجير هليكوبتر': 'luxury', 'ليموزين': 'luxury',
  'طائرة خاصة': 'luxury', 'سيارة فاخرة': 'luxury',
  'تأجير مصور': 'photo', 'تأجير مصور فيديو': 'photo',
  'مصور': 'photo', 'جلسة تصوير': 'photo',
  'برنامج مخصص': 'private', 'مرشد شخصي': 'private',
  'دخول حصري': 'private', 'خدمة في أي بي': 'private'
};

/* ============================================
   INTENT CLASSIFICATION — BILINGUAL
   ============================================ */
function classifyIntent(text) {
  const lower = text.toLowerCase().trim();
  const normalizedAr = normalizeArabic(lower);

  // Urgent detection (works for both languages)
  const urgentWords = ['complaint', 'refund', 'bad', 'terrible', 'angry', 'problem', 'issue', 'fraud', 'scam',
    'شكوى', 'استرجاع', 'سيء', 'فظيع', 'غاضب', 'مشكلة', 'احتيال', 'نصب'];
  if (urgentWords.some(w => lower.includes(w) || normalizedAr.includes(w))) {
    return { type: 'URGENT' };
  }

  // CS detection
  if (CS_KEYWORDS.some(w => lower.includes(w))) {
    return { type: 'CS' };
  }
  if (ARABIC_CS_KEYWORDS.some(w => normalizedAr.includes(w))) {
    return { type: 'CS' };
  }

  // Tourism detection — English keywords
  const hasTourismKeyword = ACTIVITY_KEYWORDS.some(kw => lower.includes(kw));
  if (hasTourismKeyword) {
    return { type: 'TOURISM' };
  }

  // Tourism detection — Arabic keywords
  const hasArabicTourism = ARABIC_ACTIVITY_KEYWORDS.some(kw => normalizedAr.includes(kw.ar));
  if (hasArabicTourism) {
    return { type: 'TOURISM' };
  }

  // Related services — English
  for (const [keyword, service] of Object.entries(RELATED_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return { type: 'RELATED', service: service };
    }
  }

  // Related services — Arabic
  for (const [keyword, service] of Object.entries(ARABIC_RELATED_KEYWORDS)) {
    if (normalizedAr.includes(keyword)) {
      return { type: 'RELATED', service: service };
    }
  }

  // Off-topic
  const offTopic = ['joke', 'weather', 'news', 'politics', 'sports', 'who is', 'what is the capital', 'tell me about', 'how to',
    'نكتة', 'طقس', 'أخبار', 'سياسة', 'رياضة', 'من هو', 'ما هي عاصمة', 'أخبرني عن', 'كيف'];
  if (offTopic.some(w => lower.includes(w) || normalizedAr.includes(w))) {
    return { type: 'OFF_TOPIC' };
  }

  return { type: 'TOURISM' };
}

/* ============================================
   ENTITY EXTRACTION — BILINGUAL
   ============================================ */
function extractActivity(text) {
  if (text.includes('<') || text.includes('>') || text.includes('/')) {
    return null;
  }

  const lower = text.toLowerCase().trim();
  const normalizedAr = normalizeArabic(lower);

  // Try Arabic keywords first (longest match)
  const sortedArKeywords = [...ARABIC_ACTIVITY_KEYWORDS].sort((a, b) => b.ar.length - a.ar.length);
  for (const kw of sortedArKeywords) {
    if (normalizedAr.includes(kw.ar)) return kw.en;
  }

  // Then English keywords
  const sortedKeywords = [...ACTIVITY_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const kw of sortedKeywords) {
    if (lower.includes(kw)) return kw;
  }

  // Fuse.js fallback
  const results = fuse.search(text);
  if (results.length > 0) {
    return results[0].item.ACTIVITIES;
  }

  const words = lower.split(/\W+/).filter(w => w.length > 2);
  for (const word of words) {
    const wordResults = fuse.search(word);
    if (wordResults.length > 0) {
      return wordResults[0].item.ACTIVITIES;
    }
  }

  return null;
}

function extractGuests(text) {
  // Convert Eastern Arabic numerals first
  const converted = convertEasternNumerals(text);

  // Western numeral patterns
  const patterns = [
    /(\d+)\s*(pax|people|guests|persons|adults|kids|children|travelers)/i,
    /(\d+)\s*(person|guest|adult|kid|child)/i,
    /for\s+(\d+)/i,
    /group\s+of\s+(\d+)/i,
    /(\d+)\s*(?:person|people|guest)/i
  ];
  for (const pattern of patterns) {
    const match = converted.match(pattern);
    if (match) return parseInt(match[1]);
  }

  // Arabic word numbers
  const arNum = extractArabicWordNumber(text);
  if (arNum) return arNum;

  // Eastern Arabic numerals directly
  const easternMatch = text.match(/[\u0660-\u0669]+/);
  if (easternMatch) {
    const digits = easternMatch[0].split('').map(c => EASTERN_TO_WESTERN[c]).join('');
    return parseInt(digits);
  }

  return null;
}

function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractDate(text) {
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedAr = normalizeArabic(lower);
  const today = new Date();

  // English date keywords
  if (lower.includes('tomorrow') || lower.includes('tomrrow') || lower.includes('tomoro')) {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t.toISOString().split('T')[0];
  }
  if (lower.includes('today')) {
    return today.toISOString().split('T')[0];
  }
  if (lower.includes('next week')) {
    const t = new Date(today);
    t.setDate(t.getDate() + 7);
    return t.toISOString().split('T')[0];
  }

  // Arabic date keywords
  if (normalizedAr.includes('غدا') || normalizedAr.includes('بكرة')) {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t.toISOString().split('T')[0];
  }
  if (normalizedAr.includes('اليوم') || normalizedAr.includes('النهاردة')) {
    return today.toISOString().split('T')[0];
  }
  if (normalizedAr.includes('الأسبوع القادم') || normalizedAr.includes('اسبوع جاي')) {
    const t = new Date(today);
    t.setDate(t.getDate() + 7);
    return t.toISOString().split('T')[0];
  }

  const parsed = chrono.parse(text);
  if (parsed.length > 0) {
    const date = parsed[0].start.date();
    return date.toISOString().split('T')[0];
  }

  return null;
}

function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/[\x00-\x1F\x7F]/g, '').substring(0, 500);
}

function sanitizeForXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrefilledUrl(baseUrl, date, time, guests, email) {
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (time) params.append('time', time);
  if (guests) params.append('guests', guests);
  if (email) params.append('email', email);
  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

/* ============================================
   MESSAGE TEMPLATES — BILINGUAL
   ============================================ */

const WELCOME_EN = `Welcome to Daycation Tours!
Discover amazing UAE experiences instantly.

Just tell me what you want:
- "desert safari tomorrow 3 pax"
- "dhow cruise next weekend 2 people"
- "burj khalifa today hamza@email.com"

Or send "0" for this menu.`;

const WELCOME_AR = `أهلاً بك في Daycation Tours!
اكتشف تجارب الإمارات المذهلة فوراً.

قل لي ما تريد:
- "سفاري صحراوي غداً ٣ أشخاص"
- "رحلة بحرية عطلة نهاية الأسبوع ٢ شخص"
- "برج خليفة اليوم hamza@email.com"

أرسل "0" للقائمة.`;

function getWelcome(lang) {
  return lang === 'ar' ? WELCOME_AR : WELCOME_EN;
}

const RESULTS_TPL_EN = (count, keyword, date, guests, tours) => {
  let header = `Found ${count} tours for "${keyword}"`;
  if (date) header += ` on ${date}`;
  if (guests) header += ` for ${guests} guests`;
  header += `:\n\n`;
  return header + tours + `\n\nWant more? Send another activity or "0" for menu.`;
};

const RESULTS_TPL_AR = (count, keyword, date, guests, tours) => {
  let header = `وجدت ${count} رحلة لـ "${keyword}"`;
  if (date) header += ` بتاريخ ${date}`;
  if (guests) header += ` لـ ${guests} ضيوف`;
  header += `:\n\n`;
  return header + tours + `\n\nتريد المزيد؟ أرسل نشاط آخر أو "0" للقائمة.`;
};

function getResultsTpl(lang, count, keyword, date, guests, tours) {
  return lang === 'ar'
    ? RESULTS_TPL_AR(count, keyword, date, guests, tours)
    : RESULTS_TPL_EN(count, keyword, date, guests, tours);
}

const NO_RESULTS_TPL_EN = `No tours found. Try: "desert safari", "dhow cruise", "burj khalifa"
Or our team will contact you soon.`;

const NO_RESULTS_TPL_AR = `لم أجد رحلات. جرب: "سفاري صحراوي"، "رحلة بحرية"، "برج خليفة"
أو سيتواصل معك فريقنا قريباً.`;

function getNoResultsTpl(lang) {
  return lang === 'ar' ? NO_RESULTS_TPL_AR : NO_RESULTS_TPL_EN;
}

const CS_HANDOFF_TPL_EN = `Connecting you to a human agent...
Expected response time: under 5 minutes.

Meanwhile, visit: www.daycationtour.com`;

const CS_HANDOFF_TPL_AR = `جاري توصيلك بموظف...
وقت الاستجابة المتوقع: أقل من 5 دقائق.

زورنا: www.daycationtour.com`;

function getCsHandoffTpl(lang) {
  return lang === 'ar' ? CS_HANDOFF_TPL_AR : CS_HANDOFF_TPL_EN;
}

const OFF_TOPIC_CAPTURE_TPL_EN = (service) =>
`We don't offer ${service} directly, but our team will check if we can arrange something related for you. Our representative will contact you within 24 hours.`;

const OFF_TOPIC_CAPTURE_TPL_AR = (service) =>
`لا نقدم ${service} مباشرة، لكن فريقنا سيتحقق إذا أمكن ترتيب شيء مشابه. سيتواصل معك ممثلنا خلال 24 ساعة.`;

function getOffTopicCaptureTpl(lang, service) {
  return lang === 'ar'
    ? OFF_TOPIC_CAPTURE_TPL_AR(service)
    : OFF_TOPIC_CAPTURE_TPL_EN(service);
}

const PRICING_GENERIC_TPL_EN = `Prices vary by tour and date. Tell me what you are interested in (e.g., "desert safari", "dhow cruise") and I will show you options with live pricing!\n\nOr send "0" for our full menu.`;

const PRICING_GENERIC_TPL_AR = `الأسعار تختلف حسب الرحلة والتاريخ. أخبرني بما تهتم به (مثلاً "سفاري صحراوي"، "رحلة بحرية") وسأعرض لك الخيارات بالأسعار المباشرة!\n\nأو أرسل "0" للقائمة الكاملة.`;

function getPricingGenericTpl(lang) {
  return lang === 'ar' ? PRICING_GENERIC_TPL_AR : PRICING_GENERIC_TPL_EN;
}

const THANKS_TPL_EN = `You\'re welcome! Happy to help with your UAE adventure. Send "0" for the menu anytime.`;
const THANKS_TPL_AR = `عفواً! سعيد بمساعدتك في مغامرتك بالإمارات. أرسل "0" للقائمة في أي وقت.`;

function getThanksTpl(lang) {
  return lang === 'ar' ? THANKS_TPL_AR : THANKS_TPL_EN;
}

const OFF_TOPIC_REDIRECT_TPL_EN = `I\'m your UAE tour assistant! I can help you book desert safaris, dhow cruises, city tours, and more. What would you like to explore?`;
const OFF_TOPIC_REDIRECT_TPL_AR = `أنا مساعدك للجولات في الإمارات! يمكنني مساعدتك في حجز سفاري صحراوي، رحلة بحرية، جولات مدينة، وأكثر. ماذا تريد أن تستكشف؟`;

function getOffTopicRedirectTpl(lang) {
  return lang === 'ar' ? OFF_TOPIC_REDIRECT_TPL_AR : OFF_TOPIC_REDIRECT_TPL_EN;
}

const URGENT_HANDOFF_TPL_EN = `I understand this is important. Connecting you to our team immediately...`;
const URGENT_HANDOFF_TPL_AR = `أفهم أن هذا مهم. جاري توصيلك بفريقنا فوراً...`;

function getUrgentHandoffTpl(lang) {
  return lang === 'ar' ? URGENT_HANDOFF_TPL_AR : URGENT_HANDOFF_TPL_EN;
}

const NO_MATCH_CAPTURE_TPL_EN = `We don\'t have an exact match, but our team will check if we can arrange something for you. Our representative will contact you within 24 hours.`;
const NO_MATCH_CAPTURE_TPL_AR = `ليس لدينا تطابق دقيق، لكن فريقنا سيتحقق إذا أمكن ترتيب شيء لك. سيتواصل معك ممثلنا خلال 24 ساعة.`;

function getNoMatchCaptureTpl(lang) {
  return lang === 'ar' ? NO_MATCH_CAPTURE_TPL_AR : NO_MATCH_CAPTURE_TPL_EN;
}

const PRICING_NO_TOURS_TPL_EN = `I don\'t have exact pricing for that right now. Connecting you to our team for a quick quote...`;
const PRICING_NO_TOURS_TPL_AR = `ليس لدي أسعار دقيقة لهذا حالياً. جاري توصيلك بفريقنا للحصول على عرض سريع...`;

function getPricingNoToursTpl(lang) {
  return lang === 'ar' ? PRICING_NO_TOURS_TPL_AR : PRICING_NO_TOURS_TPL_EN;
}

/* ============================================
   AUDIT & STORAGE
   ============================================ */
const auditLog = [];
const AUDIT_FILE = path.join(__dirname, "..", "storage", "audit.json");

async function saveAudit() {
  try {
    await fs.ensureDir(path.dirname(AUDIT_FILE));
    await fs.writeJson(AUDIT_FILE, auditLog.slice(0, 100), { spaces: 2 });
  } catch (err) {
    console.error("Audit save error:", err.message);
  }
}

async function saveLead(leadData) {
  try {
    const leadsDir = path.join(__dirname, "..", "storage", "leads");
    await fs.ensureDir(leadsDir);
    const filename = `lead_${Date.now()}.json`;
    await fs.writeJson(path.join(leadsDir, filename), leadData, { spaces: 2 });
  } catch (err) {
    console.error("Lead save error:", err.message);
  }
}

/* ============================================
   WEBHOOK VERIFICATION (GET)
   ============================================ */
app.get("/webhook", (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Webhook verification attempt:', { mode, token: token ? '***' : 'missing', challenge });

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verification failed');
    res.sendStatus(403);
  }
});

/* ============================================
   WEBHOOK (POST) — BILINGUAL + SMART PRICING
   ============================================ */
app.post("/webhook", async (req, res) => {
  const rawFrom = extractFrom(req);
  const rawBody = extractBody(req);
  const ts = new Date().toISOString();

  const from = sanitizeInput(rawFrom);
  const body = sanitizeInput(rawBody);

  // Detect language
  const lang = containsArabic(body) ? 'ar' : 'en';

  let reply = "";
  let answered = false;
  let reason = "OK";

  const intent = classifyIntent(body);
  const activity = extractActivity(body);
  const guests = extractGuests(body);
  const email = extractEmail(body);
  const date = extractDate(body);

  console.log('\n========== WEBHOOK DEBUG ==========');
  console.log('Input:', body);
  console.log('Language:', lang);
  console.log('Intent:', intent);
  console.log('Activity:', activity);
  console.log('Guests:', guests);
  console.log('Date:', date);
  console.log('Email:', email);
  console.log('Tours loaded:', TOURS.length);
  console.log('=====================================\n');

  const leadData = { ts, from, body, guests, email, date, lang };

  try {
    // EDGE CASE: Greetings
    const greetingsEn = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
    const greetingsAr = ['مرحبا', 'السلام عليكم', 'صباح', 'مساء', 'هاي', 'أهلا', 'أهلاً', 'هلا', 'سلام'];
    const isGreeting = greetingsEn.some(g => body.toLowerCase().includes(g)) ||
                       greetingsAr.some(g => normalizeArabic(body).includes(g));

    if (isGreeting) {
      reply = getWelcome(lang);
      answered = true;
      reason = "greeting";

    // EDGE CASE: Pricing — Smart Routing
    } else if (['how much', 'price', 'cost', 'cheap', 'expensive', 'discount', 'offer', 'deal',
                'كم', 'سعر', 'تكلفة', 'رخيص', 'غالي', 'خصم', 'عرض'].some(w => {
      const norm = normalizeArabic(body.toLowerCase());
      return body.toLowerCase().includes(w) || norm.includes(w);
    })) {
      const pricingActivity = extractActivity(body);

      if (pricingActivity) {
        const results = fuse.search(pricingActivity).slice(0, 3);
        if (results.length > 0) {
          const tourList = results.map(r => {
            return `${r.item.ACTIVITIES}\n${r.item.URL}`;
          }).join("\n\n");
          const pricingHeader = lang === 'ar'
            ? `إليك خيارات ${pricingActivity} مع الأسعار المباشرة:`
            : `Here are our ${pricingActivity} options with live pricing:`;
          const pricingFooter = lang === 'ar'
            ? `\n\nاضغط على أي رابط لرؤية التفاصيل والأسعار. تريد المزيد؟ أرسل نشاط آخر أو "0" للقائمة.`
            : `\n\nClick any link to see full details and prices. Want more options? Send another activity or "0" for menu.`;
          reply = pricingHeader + '\n\n' + tourList + pricingFooter;
          answered = true;
          reason = "pricing-with-tours";
          await saveLead({ ...leadData, type: "pricing_inquiry", tours: results.map(r => r.item.ACTIVITIES) });
        } else {
          reply = getPricingNoToursTpl(lang);
          answered = true;
          reason = "pricing-no-tours";
          await saveLead({ ...leadData, type: "pricing_cs_handoff", priority: "MEDIUM" });
        }
      } else {
        reply = getPricingGenericTpl(lang);
        answered = true;
        reason = "pricing-generic";
        await saveLead({ ...leadData, type: "pricing_generic", priority: "LOW" });
      }

    } else if (body === "0" || body === "٠") {
      reply = getWelcome(lang);
      answered = true;
      reason = "menu";

    } else if (intent.type === 'URGENT') {
      reply = getUrgentHandoffTpl(lang);
      answered = true;
      reason = "urgent-handoff";
      await saveLead({ ...leadData, type: "urgent", priority: "HIGH" });

    } else if (intent.type === 'CS') {
      reply = getCsHandoffTpl(lang);
      answered = true;
      reason = "cs-handoff";
      await saveLead({ ...leadData, type: "cs_request" });

    } else if (intent.type === 'RELATED') {
      reply = getOffTopicCaptureTpl(lang, intent.service);
      answered = true;
      reason = "lead-captured";
      await saveLead({
        ...leadData,
        type: "related_inquiry",
        service: intent.service,
        priority: "MEDIUM",
        note: "User asked for related service — potential upsell"
      });

    } else if (intent.type === 'OFF_TOPIC') {
      reply = getOffTopicRedirectTpl(lang);
      reason = "off-topic";

    } else if (['thank', 'thanks', 'thx', 'shukran',
                'شكرا', 'شكراً', 'مشكور', 'تسلم', 'يسلم'].some(w => {
      const norm = normalizeArabic(body.toLowerCase());
      return body.toLowerCase().includes(w) || norm.includes(w);
    })) {
      reply = getThanksTpl(lang);
      answered = true;
      reason = "thanks";

    } else {
      // TOURISM INTENT: Search for tours
      if (!activity) {
        console.log('No activity extracted, trying LLM fallback...');
        const llmResults = await getTourRecommendation(body, TOURS);

        if (llmResults && llmResults.length > 0) {
          const tourList = llmResults.map(r => {
            const url = buildPrefilledUrl(r.URL, date, null, guests, email);
            return `${r.ACTIVITIES}\n${url}`;
          }).join("\n\n");

          const llmHeader = lang === 'ar' ? 'وجدت هذه لك:' : 'I found these for you:';
          const llmFooter = lang === 'ar'
            ? 'تريد المزيد؟ أرسل نشاط آخر أو "0" للقائمة.'
            : 'Want more? Send another activity or "0" for menu.';
          reply = `${llmHeader}\n\n${tourList}\n\n${llmFooter}`;
          answered = true;
          reason = "llm-matched";
          await saveLead({ ...leadData, type: "llm_booking", tours: llmResults.map(r => r.ACTIVITIES) });
        } else {
          reply = getNoMatchCaptureTpl(lang);
          answered = true;
          reason = "no-match-captured";
          await saveLead({ ...leadData, type: "custom_inquiry", priority: "MEDIUM" });
        }

      } else {
        console.log('Activity found:', activity, '- searching tours...');
        const results = fuse.search(activity).slice(0, 3);

        if (results.length === 0) {
          console.log('Fuse.js returned 0 results for:', activity);
          reply = getNoMatchCaptureTpl(lang);
          answered = true;
          reason = "no-match-captured";
          await saveLead({ ...leadData, type: "custom_inquiry", priority: "MEDIUM" });
        } else {
          console.log('Fuse.js found', results.length, 'results');
          const tourList = results.map(r => {
            const url = buildPrefilledUrl(r.item.URL, date, null, guests, email);
            return `${r.item.ACTIVITIES}\n${url}`;
          }).join("\n\n");

          reply = getResultsTpl(lang, results.length, activity, date, guests, tourList);
          answered = true;
          reason = "matched";
          await saveLead({ ...leadData, type: "booking", tours: results.map(r => r.item.ACTIVITIES) });
        }
      }
    }
  } catch (err) {
    console.error("Webhook error:", err.message);
    reply = lang === 'ar'
      ? "عذراً، حدث خطأ ما. سيتواصل معك فريقنا قريباً."
      : "Sorry, something went wrong. Our team will contact you shortly.";
    reason = "exception";
  }

  auditLog.unshift({
    ts, from, body: body.substring(0, 100),
    answered, reason, lang,
    entities: { activity, guests, email, date },
    reply: reply.substring(0, 200)
  });

  if (auditLog.length > 100) auditLog.pop();
  await saveAudit();

  const safeReply = sanitizeForXml(reply);
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
<Message>${safeReply}</Message>
</Response>`;

  res.type("text/xml").send(twiml);
});

/* ============================================
   HEALTH & AUDIT ENDPOINTS
   ============================================ */
const { execSync } = require('child_process');

app.get("/health", (_req, res) => {
  const gitHash = (() => {
    try { return execSync('git rev-parse --short HEAD').toString().trim(); }
    catch { return 'unknown'; }
  })();

  res.json({
    status: "ok",
    version: "3.1.1",
    gitHash: gitHash,
    tours: TOURS.length,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get("/audit", async (_req, res) => {
  try {
    const data = await fs.readJson(AUDIT_FILE);
    res.json({ totalMessages: data.length, messages: data.slice(0, 50) });
  } catch {
    res.json({ totalMessages: auditLog.length, messages: auditLog.slice(0, 50) });
  }
});

app.get("/leads", async (_req, res) => {
  try {
    const leadsDir = path.join(__dirname, "..", "storage", "leads");
    const files = await fs.readdir(leadsDir);
    const leads = await Promise.all(
      files.slice(-20).map(f => fs.readJson(path.join(leadsDir, f)))
    );
    res.json({ total: files.length, leads });
  } catch {
    res.json({ total: 0, leads: [] });
  }
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Daycation Agent v3.1.0 running on port ${PORT}`);
  console.log(`Loaded ${TOURS.length} tours`);
  console.log(`Arabic support: ENABLED`);
});