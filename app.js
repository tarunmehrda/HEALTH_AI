const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Validate API keys
if (!process.env.USDA_API_KEY) {
  console.error('❌ USDA_API_KEY is not set in .env file');
  process.exit(1);
}

// Middleware to extract and validate userId
app.use((req, res, next) => {
  req.userId = req.headers['x-user-id'] || req.body.userId || req.query.userId;
  if (!req.userId || typeof req.userId !== 'string' || req.userId.trim() === '') {
    return res.status(401).json({ error: 'Missing or invalid userId. Please provide a valid userId via x-user-id header, body, or query.' });
  }
  next();
});

// Function to extract food and quantity from text
function extractFoodAndQuantity(text) {
  const input = text.toLowerCase().trim();
  const patterns = [
    // ml patterns
    /(\d+(?:\.\d+)?)\s*ml\s+(?:of\s+)?(.+)/,
    /(\d+(?:\.\d+)?)\s*milliliters?\s+(?:of\s+)?(.+)/,
    /(\d+(?:\.\d+)?)\s*millilitres?\s+(?:of\s+)?(.+)/,
    // kg patterns
    /(\d+(?:\.\d+)?)\s*kg\s+(?:of\s+)?(.+)/,
    /(\d+(?:\.\d+)?)\s*kilograms?\s+(?:of\s+)?(.+)/,
    // g patterns
    /(\d+(?:\.\d+)?)\s*g\s+(?:of\s+)?(.+)/,
    /(\d+(?:\.\d+)?)\s*grams?\s+(?:of\s+)?(.+)/,
    // default (pieces)
    /(\d+(?:\.\d+)?)\s+(.+)/
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      let quantity = parseFloat(match[1]);
      let foodName = match[2].trim();
      let unit = 'pieces';
      let originalUnit = 'pieces';

      if (pattern.source.includes('ml') || pattern.source.includes('milliliter')) {
        unit = 'ml';
        originalUnit = 'ml';
      } else if (pattern.source.includes('kg') || pattern.source.includes('kilogram')) {
        unit = 'grams';
        originalUnit = 'kg';
        quantity = quantity * 1000; // Convert kg to grams
      } else if (pattern.source.includes('g') || pattern.source.includes('gram')) {
        unit = 'grams';
        originalUnit = 'grams';
      }

      return {
        originalText: text,
        food: foodName,
        quantity: quantity,
        unit: unit,
        originalQuantity: parseFloat(match[1]),
        originalUnit: originalUnit
      };
    }
  }

  return {
    originalText: text,
    food: input,
    quantity: 1,
    unit: 'pieces',
    originalQuantity: 1,
    originalUnit: 'pieces'
  };
}

// Function to calculate nutrition based on quantity
function calculateNutrition(baseNutrients, quantity, unit, foodName) {
  const getNutrientValue = (name) => {
    const n = baseNutrients.find(n => n.nutrient?.name?.toLowerCase().includes(name.toLowerCase()));
    return n ? { amount: n.amount || 0, unit: n.nutrient.unitName || 'N/A' } : { amount: 0, unit: 'N/A' };
  };

  const baseCalories = getNutrientValue('Energy');
  const baseProtein = getNutrientValue('Protein');
  const baseFat = getNutrientValue('Total lipid');
  const baseCarbs = getNutrientValue('Carbohydrate');
  const baseSugar = getNutrientValue('Sugars');
  const baseFiber = getNutrientValue('Fiber');
  const baseCalcium = getNutrientValue('Calcium');
  const baseIron = getNutrientValue('Iron');
  const baseSodium = getNutrientValue('Sodium');

  let multiplier = 1;

  if (unit === 'grams' || unit === 'ml') {
    multiplier = quantity / 100;
  } else {
    const avgWeights = {
      'apple': 182,
      'banana': 118,
      'orange': 154,
      'egg': 50,
      'slice of bread': 25,
      'bread': 25,
      'chicken breast': 174,
      'potato': 173
    };
    const avgWeight = avgWeights[foodName.toLowerCase()] || 100;
    multiplier = (quantity * avgWeight) / 100;
  }

  return {
    calories: Math.round(baseCalories.amount * multiplier),
    protein: Math.round(baseProtein.amount * multiplier * 10) / 10,
    fat: Math.round(baseFat.amount * multiplier * 10) / 10,
    carbohydrates: Math.round(baseCarbs.amount * multiplier * 10) / 10,
    sugar: Math.round(baseSugar.amount * multiplier * 10) / 10,
    fiber: Math.round(baseFiber.amount * multiplier * 10) / 10,
    calcium: Math.round(baseCalcium.amount * multiplier),
    iron: Math.round(baseIron.amount * multiplier * 100) / 100,
    sodium: Math.round(baseSodium.amount * multiplier),
    units: {
      calories: baseCalories.unit,
      protein: baseProtein.unit,
      fat: baseFat.unit,
      carbohydrates: baseCarbs.unit,
      sugar: baseSugar.unit,
      fiber: baseFiber.unit,
      calcium: baseCalcium.unit,
      iron: baseIron.unit,
      sodium: baseSodium.unit
    }
  };
}

// Endpoint: POST /nutrition
app.post('/nutrition', async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is missing. Please send JSON data with Content-Type: application/json' });
  }

  const { foodName } = req.body;

  if (!foodName || typeof foodName !== 'string') {
    return res.status(400).json({
      error: 'Please provide a valid food description',
      received: req.body,
      examples: {
        simple: 'apple',
        pieces: '2 apples',
        grams: '200 grams of rice',
        kilograms: '1.5 kg chicken'
      }
    });
  }

  try {
    const parsed = extractFoodAndQuantity(foodName);
    const searchRes = await axios.get('https://api.nal.usda.gov/fdc/v1/foods/search', {
      params: {
        query: parsed.food,
        pageSize: 1,
        api_key: process.env.USDA_API_KEY
      }
    });

    if (!searchRes.data.foods?.length) {
      return res.status(404).json({
        error: `Food '${parsed.food}' not found in USDA database`,
        parsedInput: parsed
      });
    }

    const fdcId = searchRes.data.foods[0].fdcId;
    const detailRes = await axios.get(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}`, {
      params: { api_key: process.env.USDA_API_KEY }
    });

    const nutrients = detailRes.data.foodNutrients || [];
    const calculatedNutrition = calculateNutrition(nutrients, parsed.quantity, parsed.unit, parsed.food);

    res.json({
      originalInput: parsed.originalText,
      parsedFood: parsed.food,
      inputQuantity: `${parsed.originalQuantity} ${parsed.originalUnit}`,
      calculationQuantity: `${parsed.quantity} ${parsed.unit}`,
      foodName: detailRes.data.description,
      calculatedNutrition: {
        calories: `${calculatedNutrition.calories} ${calculatedNutrition.units.calories}`,
        protein: `${calculatedNutrition.protein} ${calculatedNutrition.units.protein}`,
        fat: `${calculatedNutrition.fat} ${calculatedNutrition.units.fat}`,
        carbohydrates: `${calculatedNutrition.carbohydrates} ${calculatedNutrition.units.carbohydrates}`,
        sugar: `${calculatedNutrition.sugar} ${calculatedNutrition.units.sugar}`,
        fiber: `${calculatedNutrition.fiber} ${calculatedNutrition.units.fiber}`,
        calcium: `${calculatedNutrition.calcium} ${calculatedNutrition.units.calcium}`,
        iron: `${calculatedNutrition.iron} ${calculatedNutrition.units.iron}`,
        sodium: `${calculatedNutrition.sodium} ${calculatedNutrition.units.sodium}`
      },
      calculation: {
        method: parsed.originalUnit === 'kg' ?
          `${parsed.originalQuantity}kg → ${parsed.quantity}g ÷ 100g × base nutrition` :
          parsed.unit === 'grams' ?
            `${parsed.quantity}g ÷ 100g × base nutrition` :
            `${parsed.quantity} pieces × estimated weight × base nutrition`,
        note: parsed.unit === 'pieces' ? `Estimated average weight used for ${parsed.food}` : ''
      }
    });
  } catch (err) {
    console.error('Error details:', err.response?.data || err.message);
    if (err.response?.status === 403) {
      return res.status(403).json({ error: 'USDA API authentication failed', details: 'Check your USDA API key' });
    }
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// In-memory storage (replace with database in production)
const userCarts = {};
const userStreaks = {};

// Helper functions
function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

function getDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function extractNumericValue(nutritionString) {
  if (typeof nutritionString !== 'string') return 0;
  const match = nutritionString.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function extractUnit(nutritionString) {
  if (typeof nutritionString !== 'string') return '';
  const match = nutritionString.match(/^[\d.]+\s*(.+)$/);
  return match ? match[1].trim() : '';
}

function combineNutritionValues(existing, additional) {
  const existingValue = extractNumericValue(existing);
  const additionalValue = extractNumericValue(additional);
  const unit = extractUnit(existing) || extractUnit(additional);
  const combined = Math.round((existingValue + additionalValue) * 100) / 100;
  return `${combined} ${unit}`;
}

function addToDailyLog(nutritionData, userId) {
  const today = getCurrentDate();
  if (!userStreaks[userId]) {
    userStreaks[userId] = {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      streakLog: [],
      totalDaysLogged: 0,
      streakStartDate: null,
      dailyNutritionData: {}
    };
  }

  if (!userStreaks[userId].dailyNutritionData[today]) {
    userStreaks[userId].dailyNutritionData[today] = {
      date: today,
      foods: [],
      totalCalories: 0,
      totalProtein: 0,
      totalFat: 0,
      totalCarbs: 0,
      addedAt: new Date().toISOString()
    };
  }

  const foodEntry = {
    id: Date.now() + Math.random(),
    originalInput: nutritionData.originalInput,
    parsedFood: nutritionData.parsedFood,
    inputQuantity: nutritionData.inputQuantity,
    calculationQuantity: nutritionData.calculationQuantity,
    foodName: nutritionData.foodName,
    calculatedNutrition: nutritionData.calculatedNutrition,
    addedAt: new Date().toISOString()
  };

  userStreaks[userId].dailyNutritionData[today].foods.push(foodEntry);
  userStreaks[userId].dailyNutritionData[today].totalCalories += extractNumericValue(nutritionData.calculatedNutrition.calories);
  userStreaks[userId].dailyNutritionData[today].totalProtein += extractNumericValue(nutritionData.calculatedNutrition.protein);
  userStreaks[userId].dailyNutritionData[today].totalFat += extractNumericValue(nutritionData.calculatedNutrition.fat);
  userStreaks[userId].dailyNutritionData[today].totalCarbs += extractNumericValue(nutritionData.calculatedNutrition.carbohydrates);

  return userStreaks[userId].dailyNutritionData[today];
}

function updateStreak(userId) {
  const today = getCurrentDate();
  if (userStreaks[userId]?.streakLog.includes(today)) {
    return {
      streakUpdated: false,
      reason: 'Already logged today',
      currentStreak: userStreaks[userId].currentStreak
    };
  }

  userStreaks[userId].streakLog.push(today);
  userStreaks[userId].totalDaysLogged++;
  userStreaks[userId].lastActiveDate = today;

  if (userStreaks[userId].currentStreak === 0) {
    userStreaks[userId].currentStreak = 1;
    userStreaks[userId].streakStartDate = today;
  } else {
    const yesterday = getDateDaysAgo(1);
    if (userStreaks[userId].streakLog.includes(yesterday)) {
      userStreaks[userId].currentStreak++;
    } else {
      userStreaks[userId].currentStreak = 1;
      userStreaks[userId].streakStartDate = today;
    }
  }

  if (userStreaks[userId].currentStreak > userStreaks[userId].longestStreak) {
    userStreaks[userId].longestStreak = userStreaks[userId].currentStreak;
  }

  return {
    streakUpdated: true,
    reason: 'Streak updated successfully',
    currentStreak: userStreaks[userId].currentStreak,
    isNewRecord: userStreaks[userId].currentStreak === userStreaks[userId].longestStreak
  };
}

// Endpoint: POST /api/addtocart
app.post('/api/addtocart', async (req, res) => {
  const nutritionDataArray = Array.isArray(req.body) ? req.body : [req.body];

  if (!nutritionDataArray.length) {
    return res.status(400).json({ error: 'No nutrition data provided' });
  }

  for (let i = 0; i < nutritionDataArray.length; i++) {
    const nutritionData = nutritionDataArray[i];
    if (!nutritionData.originalInput || !nutritionData.parsedFood || !nutritionData.calculatedNutrition) {
      return res.status(400).json({
        error: `Invalid nutrition data format for item ${i + 1}. Please send data from /nutrition endpoint`,
        expectedFormat: {
          originalInput: 'string',
          parsedFood: 'string',
          inputQuantity: 'string',
          calculationQuantity: 'string',
          foodName: 'string',
          calculatedNutrition: {
            calories: 'string',
            protein: 'string',
            fat: 'string',
            carbohydrates: 'string',
            sugar: 'string',
            fiber: 'string',
            calcium: 'string',
            iron: 'string',
            sodium: 'string'
          }
        }
      });
    }
  }

  if (!userCarts[req.userId]) userCarts[req.userId] = [];

  const results = [];
  const errors = [];

  for (const nutritionData of nutritionDataArray) {
    try {
      const dailyEntry = addToDailyLog(nutritionData, req.userId);
      const normalized = nutritionData.parsedFood.toLowerCase().trim();
      const existingIndex = userCarts[req.userId].findIndex(ci => ci.normalizedName === normalized);

      if (existingIndex !== -1) {
        const existing = userCarts[req.userId][existingIndex];
        const updatedNutrition = {
          calories: combineNutritionValues(existing.calculatedNutrition.calories, nutritionData.calculatedNutrition.calories),
          protein: combineNutritionValues(existing.calculatedNutrition.protein, nutritionData.calculatedNutrition.protein),
          fat: combineNutritionValues(existing.calculatedNutrition.fat, nutritionData.calculatedNutrition.fat),
          carbohydrates: combineNutritionValues(existing.calculatedNutrition.carbohydrates, nutritionData.calculatedNutrition.carbohydrates),
          sugar: combineNutritionValues(existing.calculatedNutrition.sugar, nutritionData.calculatedNutrition.sugar),
          fiber: combineNutritionValues(existing.calculatedNutrition.fiber, nutritionData.calculatedNutrition.fiber),
          calcium: combineNutritionValues(existing.calculatedNutrition.calcium, nutritionData.calculatedNutrition.calcium),
          iron: combineNutritionValues(existing.calculatedNutrition.iron, nutritionData.calculatedNutrition.iron),
          sodium: combineNutritionValues(existing.calculatedNutrition.sodium, nutritionData.calculatedNutrition.sodium)
        };

        userCarts[req.userId][existingIndex] = {
          ...existing,
          originalInputs: [...existing.originalInputs, nutritionData.originalInput],
          inputQuantity: existing.inputQuantity + ' + ' + nutritionData.inputQuantity,
          calculationQuantity: existing.calculationQuantity + ' + ' + nutritionData.calculationQuantity,
          calculatedNutrition: updatedNutrition,
          lastUpdated: new Date().toISOString()
        };
        results.push({ action: 'updated', item: normalized, message: `Updated ${normalized}` });
      } else {
        const cartItem = {
          normalizedName: normalized,
          originalInputs: [nutritionData.originalInput],
          parsedFood: nutritionData.parsedFood,
          inputQuantity: nutritionData.inputQuantity,
          calculationQuantity: nutritionData.calculationQuantity,
          foodName: nutritionData.foodName,
          calculatedNutrition: nutritionData.calculatedNutrition,
          addedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        userCarts[req.userId].push(cartItem);
        results.push({ action: 'added', item: normalized, message: `Added ${normalized}` });
      }
    } catch (err) {
      errors.push({ originalInput: nutritionData.originalInput, error: err.message });
    }
  }

  const streakInfo = updateStreak(req.userId);
  const cart = userCarts[req.userId];
  const totalCalories = cart.reduce((sum, ci) => sum + extractNumericValue(ci.calculatedNutrition.calories), 0);
  const totalProtein = Math.round(cart.reduce((sum, ci) => sum + extractNumericValue(ci.calculatedNutrition.protein), 0) * 10) / 10;

  res.json({
    success: results.length > 0,
    results,
    errors: errors.length ? errors : undefined,
    cart: cart.map(ci => ({
      food: ci.foodName,
      inputs: ci.originalInputs,
      quantity: ci.inputQuantity,
      calculatedNutrition: ci.calculatedNutrition,
      lastUpdated: ci.lastUpdated
    })),
    cartSummary: {
      totalItems: cart.length,
      totalCalories,
      totalProtein,
      totalFat: Math.round(cart.reduce((sum, ci) => sum + extractNumericValue(ci.calculatedNutrition.fat), 0) * 10) / 10,
      totalCarbs: Math.round(cart.reduce((sum, ci) => sum + extractNumericValue(ci.calculatedNutrition.carbohydrates), 0) * 10) / 10
    },
    streakInfo: {
      currentStreak: userStreaks[req.userId].currentStreak,
      longestStreak: userStreaks[req.userId].longestStreak,
      totalDaysLogged: userStreaks[req.userId].totalDaysLogged,
      lastActiveDate: userStreaks[req.userId].lastActiveDate,
      streakUpdated: streakInfo.streakUpdated,
      streakMessage: streakInfo.reason,
      isNewRecord: streakInfo.isNewRecord ?? false
    }
  });
});

// Endpoint: GET /api/cart
app.get('/api/cart', (req, res) => {
  const cart = userCarts[req.userId] || [];
  const totalCalories = cart.reduce((sum, item) => sum + extractNumericValue(item.calculatedNutrition.calories), 0);
  const totalProtein = cart.reduce((sum, item) => sum + extractNumericValue(item.calculatedNutrition.protein), 0);
  const today = getCurrentDate();
  const yesterday = getDateDaysAgo(1);
  const recentDays = [];
  for (let i = 6; i >= 0; i--) {
    const date = getDateDaysAgo(i);
    recentDays.push({
      date: date,
      logged: userStreaks[req.userId]?.streakLog.includes(date),
      isToday: date === today
    });
  }

  res.json({
    cart: cart,
    summary: {
      totalItems: cart.length,
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein * 10) / 10,
      lastUpdated: cart.length > 0 ? Math.max(...cart.map(item => new Date(item.lastUpdated).getTime())) : null
    },
    streakInfo: {
      currentStreak: userStreaks[req.userId]?.currentStreak || 0,
      longestStreak: userStreaks[req.userId]?.longestStreak || 0,
      lastActiveDate: userStreaks[req.userId]?.lastActiveDate || null,
      totalDaysLogged: userStreaks[req.userId]?.totalDaysLogged || 0,
      streakStartDate: userStreaks[req.userId]?.streakStartDate || null,
      todayLogged: userStreaks[req.userId]?.streakLog.includes(today) || false,
      yesterdayLogged: userStreaks[req.userId]?.streakLog.includes(yesterday) || false,
      recentWeek: recentDays,
      streakStatus: {
        canLogToday: !userStreaks[req.userId]?.streakLog.includes(today),
        streakAtRisk: !userStreaks[req.userId]?.streakLog.includes(today) && userStreaks[req.userId]?.currentStreak > 0,
        message: userStreaks[req.userId]?.streakLog.includes(today)
          ? `Great! You've already logged today. Current streak: ${userStreaks[req.userId]?.currentStreak} days!`
          : userStreaks[req.userId]?.currentStreak > 0
            ? `Don't break your ${userStreaks[req.userId]?.currentStreak}-day streak! Log your nutrition today.`
            : 'Start your nutrition tracking streak today!'
      },
      achievements: {
        firstDay: userStreaks[req.userId]?.totalDaysLogged >= 1,
        weekStreak: userStreaks[req.userId]?.longestStreak >= 7,
        monthStreak: userStreaks[req.userId]?.longestStreak >= 30,
        hundredDays: userStreaks[req.userId]?.totalDaysLogged >= 100
      }
    }
  });
});

// Endpoint: DELETE /api/cart
app.delete('/api/cart', (req, res) => {
  const itemCount = userCarts[req.userId]?.length || 0;
  userCarts[req.userId] = [];
  res.json({
    success: true,
    message: `Cleared ${itemCount} item(s) from cart`,
    cart: []
  });
});

// Endpoint: GET /health
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'USDA Nutrition API is live',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});