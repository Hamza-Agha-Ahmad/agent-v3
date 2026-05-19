const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getTourRecommendation(userMessage, availableTours) {
  try {
    const tourList = availableTours.slice(0, 20).map(t => t.ACTIVITIES).join(', ');

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a UAE tourism expert. 
Available tours (ONLY these exist): ${tourList}

CRITICAL RULES:
1. ONLY recommend tours from the list above
2. NEVER make up tours that don't exist
3. If no match, say exactly: NO_MATCH
4. Return ONLY tour names separated by commas

User asks: "${userMessage}"

Recommend 1-3 best matching tours from the EXACT list above.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    if (response === 'NO_MATCH' || response.includes('NO_MATCH')) return null;

    const names = response.split(',').map(s => s.trim()).filter(Boolean);
    
    // STRICT VALIDATION: Only return tours that actually exist
    const validResults = [];
    for (const name of names) {
      const matchedTour = availableTours.find(t => {
        const tourName = t.ACTIVITIES.toLowerCase();
        const suggestedName = name.toLowerCase();
        return tourName.includes(suggestedName) || suggestedName.includes(tourName);
      });
      
      if (matchedTour && !validResults.includes(matchedTour)) {
        validResults.push(matchedTour);
      }
    }
    
    return validResults.length > 0 ? validResults : null;

  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}

module.exports = { getTourRecommendation };
