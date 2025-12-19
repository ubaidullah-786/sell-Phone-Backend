/**
 * AI SEO Enhancement Service
 * Uses OpenAI GPT OSS 120B to generate optimized meta titles, descriptions, and keywords
 */

const AI_API_URL = 'https://inference.do-ai.run/v1/chat/completions';
const AI_API_KEY =
  process.env.AI_API_KEY ||
  'sk-do-y1ufpvJfQ2R_pmvw2hVa-2t7kDEA2tQiLC78OLK1qMy7rnGEsE5e_IHH9_';

/**
 * Generate SEO-optimized metadata for a phone ad
 * @param {Object} adData - The ad data
 * @returns {Promise<Object>} - Enhanced meta title, description, and keywords
 */
async function generateSeoMetadata(adData) {
  const { title, description, brand, model, price, condition, city } = adData;

  console.log('Generating SEO metadata for:', {
    title,
    brand,
    model,
    price,
    condition,
    city,
  });

  const prompt = `You are an SEO expert for a phone marketplace in Pakistan. Generate optimized metadata for this phone ad listing.

Ad Details:
- Title: ${title}
- Brand: ${brand}
- Model: ${model}
- Price: Rs ${price?.toLocaleString() || 'N/A'}
- Condition: ${condition}
- Location: ${city}
- Description: ${description}

Generate a JSON response with:
1. "metaTitle": An SEO-optimized title (max 60 characters) that includes the phone model and key selling point
2. "metaDescription": A compelling description (max 155 characters) that encourages clicks and includes price and location
3. "metaKeywords": An array of 5-8 relevant keywords for search engines

Respond ONLY with valid JSON, no markdown or explanation:`;

  try {
    console.log('Calling AI API at:', AI_API_URL);

    const requestBody = {
      model: 'openai-gpt-oss-120b',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1000, // Increased for reasoning models
    };

    console.log('AI API request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'AI API error:',
        response.status,
        response.statusText,
        errorText,
      );
      return generateFallbackMetadata(adData);
    }

    const result = await response.json();
    console.log('AI API raw response:', JSON.stringify(result, null, 2));

    const message = result?.choices?.[0]?.message;
    let content = message?.content;

    // For reasoning models, try to extract JSON from reasoning_content if content is null
    if (!content && message?.reasoning_content) {
      console.log('Attempting to extract from reasoning_content...');
      const reasoning = message.reasoning_content;

      // Try to find JSON-like content in reasoning
      // Look for metaTitle pattern to extract partial data
      const titleMatch = reasoning.match(/metaTitle['":\s]+["']([^"']+)["']/i);
      const descMatch = reasoning.match(
        /metaDescription['":\s]+["']([^"']+)["']/i,
      );

      if (titleMatch || descMatch) {
        return {
          metaTitle: (titleMatch?.[1] || '').slice(0, 70),
          metaDescription: (descMatch?.[1] || '').slice(0, 160),
          metaKeywords: [],
        };
      }

      // Try to extract from the reasoning text itself
      const titleFromReasoning = reasoning.match(
        /metaTitle like ["']([^"']+)["']/i,
      );
      const descFromReasoning = reasoning.match(
        /Something like: ["']([^"']+)["']/i,
      );

      if (titleFromReasoning || descFromReasoning) {
        return {
          metaTitle: (titleFromReasoning?.[1] || '').slice(0, 70),
          metaDescription: (descFromReasoning?.[1] || '').slice(0, 160),
          metaKeywords: [],
        };
      }
    }

    if (!content) {
      console.error(
        'No content in AI response. Full result:',
        JSON.stringify(result),
      );
      return generateFallbackMetadata(adData);
    }

    // Parse JSON from response (handle potential markdown code blocks)
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.slice(7);
    }
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.slice(3);
    }
    if (cleanContent.endsWith('```')) {
      cleanContent = cleanContent.slice(0, -3);
    }

    const metadata = JSON.parse(cleanContent.trim());

    // Validate and sanitize the response
    return {
      metaTitle: (metadata.metaTitle || '').slice(0, 70),
      metaDescription: (metadata.metaDescription || '').slice(0, 160),
      metaKeywords: Array.isArray(metadata.metaKeywords)
        ? metadata.metaKeywords.slice(0, 10)
        : [],
    };
  } catch (error) {
    console.error('AI SEO generation error:', error.message);
    return generateFallbackMetadata(adData);
  }
}

/**
 * Generate fallback metadata without AI
 * @param {Object} adData - The ad data
 * @returns {Object} - Basic meta title, description, and keywords
 */
function generateFallbackMetadata(adData) {
  const { title, brand, model, price, condition, city } = adData;

  const metaTitle =
    `${brand} ${model} for Sale in ${city} - Rs ${price?.toLocaleString() || ''}`.slice(
      0,
      70,
    );

  const metaDescription =
    `Buy ${condition} ${brand} ${model} at Rs ${price?.toLocaleString() || ''} in ${city}. ${title}`.slice(
      0,
      160,
    );

  const metaKeywords = [
    brand,
    model,
    `${brand} ${model}`,
    'buy phone',
    'sell phone',
    `phone in ${city}`,
    condition?.toLowerCase(),
    'mobile for sale',
  ].filter(Boolean);

  return { metaTitle, metaDescription, metaKeywords };
}

module.exports = { generateSeoMetadata, generateFallbackMetadata };
