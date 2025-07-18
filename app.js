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



// Function to extract food and quantity from text
function extractFoodAndQuantity(text) {
  const input = text.toLowerCase().trim();

  // Patterns for different quantity formats
  const patterns = [
    // "1.5 kg of rice", "2 kg chicken", "0.5 kilograms rice"
    /(\d+(?:\.\d+)?)\s*(?:kilograms?|kg)\s+(?:of\s+)?([a-zA-Z\s]+?)$/,
    // "200 grams of rice", "100g of rice", "150 grams rice"
    /(\d+(?:\.\d+)?)\s*(?:grams?|g)\s+(?:of\s+)?([a-zA-Z\s]+?)$/,
    // "I had 1.5 kg of rice", "I ate 2 kg chicken"
    /(?:i\s+(?:had|ate|consumed)\s+)?(\d+(?:\.\d+)?)\s*(?:kilograms?|kg)\s+(?:of\s+)?([a-zA-Z\s]+?)$/,
    // "I had 200 grams of rice", "I ate 100g rice"
    /(?:i\s+(?:had|ate|consumed)\s+)?(\d+(?:\.\d+)?)\s*(?:grams?|g)\s+(?:of\s+)?([a-zA-Z\s]+?)$/,
    // "2 apples", "3 bananas"
    /(\d+(?:\.\d+)?)\s+([a-zA-Z\s]+?)s?$/,
    // "I had 2 apples", "I ate 3 bananas"
    /(?:i\s+(?:had|ate|consumed)\s+)?(\d+(?:\.\d+)?)\s+([a-zA-Z\s]+?)s?$/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      const quantity = parseFloat(match[1]);
      const food = match[2].trim();

      // Determine unit type and convert kg to grams
      let finalQuantity = quantity;
      let unit = 'pieces';

      if (/kilograms?|kg/.test(input)) {
        finalQuantity = quantity * 1000; // Convert kg to grams
        unit = 'grams';
      } else if (/grams?|g/.test(input)) {
        unit = 'grams';
      }

      return {
        food: food,
        quantity: finalQuantity,
        unit: unit,
        originalQuantity: quantity,
        originalUnit: /kilograms?|kg/.test(input) ? 'kg' : (/grams?|g/.test(input) ? 'grams' : 'pieces'),
        originalText: text
      };
    }
  }

  // If no quantity found, assume 1 piece
  return {
    food: input.replace(/^(?:i\s+(?:had|ate|consumed)\s+)?/, ''),
    quantity: 1,
    unit: 'pieces',
    originalQuantity: 1,
    originalUnit: 'pieces',
    originalText: text
  };
}

// Function to calculate nutrition based on quantity
function calculateNutrition(baseNutrients, quantity, unit, foodName) {
  const getNutrientValue = (name) => {
    const n = baseNutrients.find(n => n.nutrient?.name?.toLowerCase().includes(name.toLowerCase()));
    if (!n) return { amount: 0, unit: 'N/A' };
    return { amount: n.amount || 0, unit: n.nutrient.unitName || 'N/A' };
  };

  // Base nutrition values (typically per 100g)
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

  if (unit === 'grams') {
    // USDA data is typically per 100g, so calculate multiplier
    multiplier = quantity / 100;
  } else {
    // For pieces, estimate average weight
    const avgWeights = {
      'apple': 182, // grams
      'banana': 118,
      'orange': 154,
      'egg': 50,
      'slice of bread': 25,
      'bread': 25,
      'chicken breast': 174,
      'potato': 173
    };

    const avgWeight = avgWeights[foodName.toLowerCase()] || 100; // default 100g
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

// Endpoint: POST /api/nutrition (text-based food search with quantity)
app.post('/api/nutrition', async (req, res) => {
  // Debug logging
  console.log('Request body:', req.body);
  console.log('Content-Type:', req.get('Content-Type'));

  // Check if req.body exists
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
        grams: 'I had 200 grams of rice',
        kilograms: 'I ate 1.5 kg chicken'
      }
    });
  }

  try {
    // Extract food and quantity from the input
    const parsed = extractFoodAndQuantity(foodName);
    console.log("🧠 Parsed input:", parsed);

    // Search USDA database for the food
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

    // Get detailed nutrition information
    const detailRes = await axios.get(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}`, {
      params: { api_key: process.env.USDA_API_KEY }
    });

    const nutrients = detailRes.data.foodNutrients || [];

    // Calculate nutrition based on quantity
    const calculatedNutrition = calculateNutrition(nutrients, parsed.quantity, parsed.unit, parsed.food);

    const result = {
      originalInput: parsed.originalText,
      parsedFood: parsed.food,
      inputQuantity: `${parsed.originalQuantity} ${parsed.originalUnit}`,
      calculationQuantity: `${parsed.quantity} ${parsed.unit}`,
      foodName: detailRes.data.description,
      nutritionPer100g: {
        note: "Base nutrition values from USDA (typically per 100g)"
      },
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
        note: parsed.originalUnit === 'kg' ?
          `Converted ${parsed.originalQuantity}kg to ${parsed.quantity}g for calculation` :
          parsed.unit === 'pieces' ?
            `Estimated average weight used for ${parsed.food}` :
            'Weight-based calculation'
      }
    };

    res.json(result);

  } catch (err) {
    console.error('Error details:', err.response?.data || err.message);

    if (err.response?.status === 403) {
      return res.status(403).json({
        error: 'USDA API authentication failed',
        details: 'Check your USDA API key'
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
});

// Endpoint: GET /api/nutrition - Simple food search (for testing)
app.get('/api/nutrition', (req, res) => {
  res.json({
    message: 'Use POST method to search for nutrition data',
    usage: 'POST /api/nutrition with JSON body: {"foodName": "apple"}',
    examples: {
      simple: 'apple',
      pieces: '2 apples', 
      grams: 'I had 200 grams of rice',
      kilograms: 'I ate 1.5 kg chicken'
    }
  });
});

// In-memory cart storage (in production, use a database)
let cart = [];

// In-memory streak tracking storage (in production, use a database)
let userStreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
  streakLog: [], // Array of dates in YYYY-MM-DD format
  totalDaysLogged: 0,
  streakStartDate: null,
  dailyNutritionData: {} // New: Store daily nutrition data by date
};

// Function to add nutrition data to daily log
function addToDailyLog(nutritionData) {
  const today = getCurrentDate();
  
  // Initialize today's data if it doesn't exist
  if (!userStreakData.dailyNutritionData[today]) {
    userStreakData.dailyNutritionData[today] = {
      date: today,
      foods: [],
      totalCalories: 0,
      totalProtein: 0,
      totalFat: 0,
      totalCarbs: 0,
      addedAt: new Date().toISOString()
    };
  }

  // Add food to today's log
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

  userStreakData.dailyNutritionData[today].foods.push(foodEntry);

  // Update daily totals
  userStreakData.dailyNutritionData[today].totalCalories += extractNumericValue(nutritionData.calculatedNutrition.calories);
  userStreakData.dailyNutritionData[today].totalProtein += extractNumericValue(nutritionData.calculatedNutrition.protein);
  userStreakData.dailyNutritionData[today].totalFat += extractNumericValue(nutritionData.calculatedNutrition.fat);
  userStreakData.dailyNutritionData[today].totalCarbs += extractNumericValue(nutritionData.calculatedNutrition.carbohydrates);

  return userStreakData.dailyNutritionData[today];
}

// Function to get nutrition data for a specific date
function getDailyNutritionData(date) {
  return userStreakData.dailyNutritionData[date] || null;
}

// Function to get nutrition data for date range
function getNutritionDataRange(startDate, endDate) {
  const result = {};
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    if (userStreakData.dailyNutritionData[dateStr]) {
      result[dateStr] = userStreakData.dailyNutritionData[dateStr];
    }
  }
  
  return result;
}

// Helper function to get current date in YYYY-MM-DD format
function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

// Helper function to get date from days ago
function getDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// Helper function to calculate days between two dates
function daysBetweenDates(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
  const firstDate = new Date(date1);
  const secondDate = new Date(date2);
  return Math.round(Math.abs((firstDate - secondDate) / oneDay));
}

// Function to update streak when user adds to cart
function updateStreak() {
  const today = getCurrentDate();

  // If already logged today, don't update streak
  if (userStreakData.streakLog.includes(today)) {
    return {
      streakUpdated: false,
      reason: 'Already logged today',
      currentStreak: userStreakData.currentStreak
    };
  }

  // Add today to the log
  userStreakData.streakLog.push(today);
  userStreakData.totalDaysLogged++;
  userStreakData.lastActiveDate = today;

  if (userStreakData.currentStreak === 0) {
    // First time logging
    userStreakData.currentStreak = 1;
    userStreakData.streakStartDate = today;
  } else {
    const yesterday = getDateDaysAgo(1);

    if (userStreakData.streakLog.includes(yesterday)) {
      // Consecutive day - increase streak
      userStreakData.currentStreak++;
    } else {
      // Not consecutive - reset streak
      userStreakData.currentStreak = 1;
      userStreakData.streakStartDate = today;
    }
  }

  // Update longest streak if current is higher
  if (userStreakData.currentStreak > userStreakData.longestStreak) {
    userStreakData.longestStreak = userStreakData.currentStreak;
  }

  return {
    streakUpdated: true,
    reason: 'Streak updated successfully',
    currentStreak: userStreakData.currentStreak,
    isNewRecord: userStreakData.currentStreak === userStreakData.longestStreak
  };
}

// Helper function to extract numeric value from nutrition string (e.g., "189 kcal" -> 189)
function extractNumericValue(nutritionString) {
  if (typeof nutritionString !== 'string') return 0;
  const match = nutritionString.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

// Helper function to get unit from nutrition string (e.g., "189 kcal" -> "kcal")
function extractUnit(nutritionString) {
  if (typeof nutritionString !== 'string') return '';
  const match = nutritionString.match(/^[\d.]+\s*(.+)$/);
  return match ? match[1].trim() : '';
}

// Helper function to combine nutrition values
function combineNutritionValues(existing, additional) {
  const existingValue = extractNumericValue(existing);
  const additionalValue = extractNumericValue(additional);
  const unit = extractUnit(existing) || extractUnit(additional);

  const combined = Math.round((existingValue + additionalValue) * 100) / 100;
  return `${combined} ${unit}`;
}

// Endpoint: GET /api/addtocart - Store nutrition data directly (supports multiple items)
app.get('/api/addtocart', async (req, res) => {
  console.log('Add to cart request:', req.query);

  if (!req.query || Object.keys(req.query).length === 0) {
    return res.status(400).json({ error: 'Query parameters are missing' });
  }

  // Expect nutrition data as query parameters or JSON in query
  let nutritionDataArray = [];

  // Check if data is passed as JSON string in query parameter
  if (req.query.data) {
    try {
      const parsedData = JSON.parse(req.query.data);

      // Support both single item and array of items
      if (Array.isArray(parsedData)) {
        nutritionDataArray = parsedData;
      } else {
        nutritionDataArray = [parsedData];
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON in data parameter' });
    }
  } else {
    // Use query parameters directly (single item only)
    nutritionDataArray = [req.query];
  }

  // Validate each nutrition data item
  for (let i = 0; i < nutritionDataArray.length; i++) {
    const nutritionData = nutritionDataArray[i];
    if (!nutritionData.originalInput || !nutritionData.parsedFood || !nutritionData.calculatedNutrition) {
      return res.status(400).json({
        error: `Invalid nutrition data format for item ${i + 1}. Please send data from /api/nutrition endpoint`,
        examples: {
          singleItem: 'GET /api/addtocart?data={"originalInput":"2 apples","parsedFood":"apple","calculatedNutrition":{"calories":"189 kcal"}}',
          multipleItems: 'GET /api/addtocart?data=[{"originalInput":"2 apples","parsedFood":"apple","calculatedNutrition":{"calories":"189 kcal"}},{"originalInput":"200g rice","parsedFood":"rice","calculatedNutrition":{"calories":"278 kcal"}}]',
          note: 'Send complete JSON data from /api/nutrition response(s)'
        },
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

  try {
    const results = [];
    const errors = [];
    const dailyLogEntries = [];

    // Process each nutrition data item
    for (let i = 0; i < nutritionDataArray.length; i++) {
      const nutritionData = nutritionDataArray[i];

      try {
        // Add to daily nutrition log
        const dailyEntry = addToDailyLog(nutritionData);
        dailyLogEntries.push(dailyEntry);

        // Create a normalized name for comparison (remove quantities)
        const normalizedName = nutritionData.parsedFood.toLowerCase().trim();

        // Check if item already exists in cart
        const existingItemIndex = cart.findIndex(cartItem =>
          cartItem.normalizedName === normalizedName
        );

        if (existingItemIndex !== -1) {
          // Update existing item - combine quantities and nutrition values
          const existingItem = cart[existingItemIndex];

          // Combine nutrition values
          const updatedNutrition = {
            calories: combineNutritionValues(existingItem.calculatedNutrition.calories, nutritionData.calculatedNutrition.calories),
            protein: combineNutritionValues(existingItem.calculatedNutrition.protein, nutritionData.calculatedNutrition.protein),
            fat: combineNutritionValues(existingItem.calculatedNutrition.fat, nutritionData.calculatedNutrition.fat),
            carbohydrates: combineNutritionValues(existingItem.calculatedNutrition.carbohydrates, nutritionData.calculatedNutrition.carbohydrates),
            sugar: combineNutritionValues(existingItem.calculatedNutrition.sugar, nutritionData.calculatedNutrition.sugar),
            fiber: combineNutritionValues(existingItem.calculatedNutrition.fiber, nutritionData.calculatedNutrition.fiber),
            calcium: combineNutritionValues(existingItem.calculatedNutrition.calcium, nutritionData.calculatedNutrition.calcium),
            iron: combineNutritionValues(existingItem.calculatedNutrition.iron, nutritionData.calculatedNutrition.iron),
            sodium: combineNutritionValues(existingItem.calculatedNutrition.sodium, nutritionData.calculatedNutrition.sodium)
          };

          // Update the existing item
          cart[existingItemIndex] = {
            ...existingItem,
            originalInputs: [...existingItem.originalInputs, nutritionData.originalInput],
            inputQuantity: existingItem.inputQuantity + ' + ' + nutritionData.inputQuantity,
            calculationQuantity: existingItem.calculationQuantity + ' + ' + nutritionData.calculationQuantity,
            calculatedNutrition: updatedNutrition,
            lastUpdated: new Date().toISOString()
          };

          results.push({
            action: 'updated',
            item: normalizedName,
            message: `Updated existing ${normalizedName} in cart`
          });

        } else {
          // Add new item to cart
          const cartItem = {
            id: Date.now() + Math.random() + i, // Simple ID generation with index
            normalizedName: normalizedName,
            originalInputs: [nutritionData.originalInput],
            ...nutritionData,
            addedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          };

          cart.push(cartItem);

          results.push({
            action: 'added',
            item: normalizedName,
            message: `Added ${normalizedName} to cart`
          });
        }

      } catch (itemError) {
        errors.push({
          item: i + 1,
          originalInput: nutritionData.originalInput || 'Unknown',
          error: itemError.message
        });
      }
    }

    // Update streak tracking
    const streakUpdate = updateStreak();
    const todayData = getDailyNutritionData(getCurrentDate());

    // Return comprehensive response
    const response = {
      success: errors.length === 0,
      message: `Processed ${nutritionDataArray.length} item(s): ${results.length} successful, ${errors.length} failed`,
      results: results,
      cartSummary: {
        totalItems: cart.length,
        totalCalories: cart.reduce((sum, item) => sum + extractNumericValue(item.calculatedNutrition.calories), 0),
        totalProtein: Math.round(cart.reduce((sum, item) => sum + extractNumericValue(item.calculatedNutrition.protein), 0) * 10) / 10
      },
      todayNutrition: {
        date: getCurrentDate(),
        totalFoods: todayData ? todayData.foods.length : 0,
        totalCalories: todayData ? Math.round(todayData.totalCalories) : 0,
        totalProtein: todayData ? Math.round(todayData.totalProtein * 10) / 10 : 0,
        totalFat: todayData ? Math.round(todayData.totalFat * 10) / 10 : 0,
        totalCarbs: todayData ? Math.round(todayData.totalCarbs * 10) / 10 : 0,
        foods: todayData ? todayData.foods : []
      },
      streakInfo: {
        currentStreak: userStreakData.currentStreak,
        longestStreak: userStreakData.longestStreak,
        lastActiveDate: userStreakData.lastActiveDate,
        streakUpdated: streakUpdate.streakUpdated,
        streakMessage: streakUpdate.reason,
        isNewRecord: streakUpdate.isNewRecord || false,
        totalDaysLogged: userStreakData.totalDaysLogged
      }
    };

    if (errors.length > 0) {
      response.errors = errors;
      response.success = errors.length < nutritionDataArray.length; // Partial success if some items failed
    }

    res.json(response);

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Endpoint: GET /api/cart - View current cart with streak info
app.get('/api/cart', (req, res) => {
  const totalCalories = cart.reduce((sum, item) => sum + extractNumericValue(item.calculatedNutrition.calories), 0);
  const totalProtein = cart.reduce((sum, item) => sum + extractNumericValue(item.calculatedNutrition.protein), 0);
  
  const today = getCurrentDate();
  const yesterday = getDateDaysAgo(1);

  // Calculate recent week data for cart response
  const recentDays = [];
  for (let i = 6; i >= 0; i--) {
    const date = getDateDaysAgo(i);
    recentDays.push({
      date: date,
      logged: userStreakData.streakLog.includes(date),
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
      currentStreak: userStreakData.currentStreak,
      longestStreak: userStreakData.longestStreak,
      lastActiveDate: userStreakData.lastActiveDate,
      totalDaysLogged: userStreakData.totalDaysLogged,
      streakStartDate: userStreakData.streakStartDate,
      todayLogged: userStreakData.streakLog.includes(today),
      yesterdayLogged: userStreakData.streakLog.includes(yesterday),
      recentWeek: recentDays,
      streakStatus: {
        canLogToday: !userStreakData.streakLog.includes(today),
        streakAtRisk: !userStreakData.streakLog.includes(today) && userStreakData.currentStreak > 0,
        message: userStreakData.streakLog.includes(today)
          ? `Great! You've already logged today. Current streak: ${userStreakData.currentStreak} days!`
          : userStreakData.currentStreak > 0
            ? `Don't break your ${userStreakData.currentStreak}-day streak! Log your nutrition today.`
            : 'Start your nutrition tracking streak today!'
      },
      achievements: {
        firstDay: userStreakData.totalDaysLogged >= 1,
        weekStreak: userStreakData.longestStreak >= 7,
        monthStreak: userStreakData.longestStreak >= 30,
        hundredDays: userStreakData.totalDaysLogged >= 100
      }
    }
  });
});

// Endpoint: DELETE /api/cart - Clear cart
app.delete('/api/cart', (req, res) => {
  const itemCount = cart.length;
  cart = [];
  res.json({
    success: true,
    message: `Cleared ${itemCount} item(s) from cart`,
    cart: []
  });
});

// Endpoint: DELETE /api/cart/:id - Remove specific item from cart
app.delete('/api/cart/:id', (req, res) => {
  const itemId = parseFloat(req.params.id);
  const itemIndex = cart.findIndex(item => item.id === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }

  const removedItem = cart.splice(itemIndex, 1)[0];
  res.json({
    success: true,
    message: 'Item removed from cart',
    removedItem: removedItem,
    cartSummary: {
      totalItems: cart.length,
      totalCalories: cart.reduce((sum, item) => sum + extractNumericValue(item.calculatedNutrition.calories), 0)
    }
  });
});

// Endpoint: GET /api/streak - Get detailed streak information
app.get('/api/streak', (req, res) => {
  const today = getCurrentDate();
  const yesterday = getDateDaysAgo(1);

  // Calculate streak statistics
  const recentDays = [];
  for (let i = 6; i >= 0; i--) {
    const date = getDateDaysAgo(i);
    recentDays.push({
      date: date,
      logged: userStreakData.streakLog.includes(date),
      isToday: date === today
    });
  }

  res.json({
    currentStreak: userStreakData.currentStreak,
    longestStreak: userStreakData.longestStreak,
    totalDaysLogged: userStreakData.totalDaysLogged,
    lastActiveDate: userStreakData.lastActiveDate,
    streakStartDate: userStreakData.streakStartDate,
    todayLogged: userStreakData.streakLog.includes(today),
    yesterdayLogged: userStreakData.streakLog.includes(yesterday),
    recentWeek: recentDays,
    streakStatus: {
      canLogToday: !userStreakData.streakLog.includes(today),
      streakAtRisk: !userStreakData.streakLog.includes(today) && userStreakData.currentStreak > 0,
      message: userStreakData.streakLog.includes(today)
        ? `Great! You've already logged today. Current streak: ${userStreakData.currentStreak} days!`
        : userStreakData.currentStreak > 0
          ? `Don't break your ${userStreakData.currentStreak}-day streak! Log your nutrition today.`
          : 'Start your nutrition tracking streak today!'
    },
    achievements: {
      firstDay: userStreakData.totalDaysLogged >= 1,
      weekStreak: userStreakData.longestStreak >= 7,
      monthStreak: userStreakData.longestStreak >= 30,
      hundredDays: userStreakData.totalDaysLogged >= 100
    }
  });
});

// Endpoint: POST /api/streak/reset - Reset streak (for testing or user request)
app.post('/api/streak/reset', (req, res) => {
  const oldStreak = { ...userStreakData };
  const savedDailyNutritionData = { ...userStreakData.dailyNutritionData };

  userStreakData = {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    streakLog: [],
    totalDaysLogged: 0,
    streakStartDate: null,
    dailyNutritionData: savedDailyNutritionData // Preserve the nutrition history
  };

  res.json({
    success: true,
    message: 'Streak data has been reset but nutrition history preserved',
    previousData: {
      currentStreak: oldStreak.currentStreak,
      longestStreak: oldStreak.longestStreak,
      totalDaysLogged: oldStreak.totalDaysLogged
    },
    newData: {
      ...userStreakData,
      nutritionHistoryPreserved: true,
      daysWithData: Object.keys(savedDailyNutritionData).length
    }
  });
});

// Endpoint: GET /api/nutrition/history - Get nutrition history by date range
app.get('/api/nutrition/history', (req, res) => {
  const { startDate, endDate, date } = req.query;

  if (date) {
    // Get specific date
    const dayData = getDailyNutritionData(date);
    if (!dayData) {
      return res.status(404).json({ 
        error: `No nutrition data found for ${date}`,
        date: date
      });
    }
    return res.json({
      date: date,
      data: dayData
    });
  }

  if (startDate && endDate) {
    // Get date range
    const rangeData = getNutritionDataRange(startDate, endDate);
    return res.json({
      startDate: startDate,
      endDate: endDate,
      data: rangeData,
      totalDays: Object.keys(rangeData).length
    });
  }

  // Get last 7 days by default
  const today = getCurrentDate();
  const weekAgo = getDateDaysAgo(7);
  const weekData = getNutritionDataRange(weekAgo, today);

  res.json({
    message: 'Last 7 days nutrition history',
    startDate: weekAgo,
    endDate: today,
    data: weekData,
    totalDays: Object.keys(weekData).length,
    usage: {
      specificDate: '/api/nutrition/history?date=2024-01-17',
      dateRange: '/api/nutrition/history?startDate=2024-01-15&endDate=2024-01-20'
    }
  });
});

// Endpoint: GET /api/nutrition/today - Get today's nutrition data
app.get('/api/nutrition/today', (req, res) => {
  const today = getCurrentDate();
  const todayData = getDailyNutritionData(today);

  if (!todayData) {
    return res.json({
      date: today,
      message: 'No nutrition data logged today',
      data: {
        date: today,
        foods: [],
        totalCalories: 0,
        totalProtein: 0,
        totalFat: 0,
        totalCarbs: 0
      }
    });
  }

  res.json({
    date: today,
    data: todayData,
    summary: {
      totalFoods: todayData.foods.length,
      totalCalories: Math.round(todayData.totalCalories),
      totalProtein: Math.round(todayData.totalProtein * 10) / 10,
      totalFat: Math.round(todayData.totalFat * 10) / 10,
      totalCarbs: Math.round(todayData.totalCarbs * 10) / 10
    }
  });
});

// Endpoint: GET /api/streak/history - Get complete streak history with nutrition data
app.get('/api/streak/history', (req, res) => {
  // Get all dates with nutrition data
  const datesWithData = Object.keys(userStreakData.dailyNutritionData).sort();
  
  // Create a summary of each day's nutrition
  const nutritionSummary = datesWithData.map(date => {
    const dayData = userStreakData.dailyNutritionData[date];
    return {
      date,
      logged: userStreakData.streakLog.includes(date),
      totalFoods: dayData.foods.length,
      totalCalories: Math.round(dayData.totalCalories),
      totalProtein: Math.round(dayData.totalProtein * 10) / 10,
      totalFat: Math.round(dayData.totalFat * 10) / 10,
      totalCarbs: Math.round(dayData.totalCarbs * 10) / 10,
      foods: dayData.foods.map(food => ({
        name: food.parsedFood,
        quantity: food.inputQuantity,
        calories: extractNumericValue(food.calculatedNutrition.calories)
      }))
    };
  });

  // Get streak periods (consecutive days)
  const streakPeriods = [];
  let currentPeriod = null;

  userStreakData.streakLog.sort().forEach(date => {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (!currentPeriod || !userStreakData.streakLog.includes(yesterdayStr)) {
      // Start new period
      currentPeriod = {
        startDate: date,
        endDate: date,
        days: 1
      };
      streakPeriods.push(currentPeriod);
    } else {
      // Extend current period
      currentPeriod.endDate = date;
      currentPeriod.days++;
    }
  });

  res.json({
    streakSummary: {
      currentStreak: userStreakData.currentStreak,
      longestStreak: userStreakData.longestStreak,
      totalDaysLogged: userStreakData.totalDaysLogged,
      streakStartDate: userStreakData.streakStartDate,
      lastActiveDate: userStreakData.lastActiveDate
    },
    streakPeriods: streakPeriods,
    nutritionHistory: nutritionSummary,
    datesWithData: datesWithData,
    streakLog: userStreakData.streakLog.sort()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'USDA Nutrition API is live' });
});

// Error handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Local IP: http://192.168.124.246:${PORT}`);
  console.log(`- Android Emulator: http://10.0.2.2:${PORT}`);
  console.log(`- Health check: http://localhost:${PORT}/health`);
});
