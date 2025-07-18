const express = require('express');
const axios = require('axios');
const router = express.Router();

// Load keys from .env
const USDA_API_KEY = process.env.USDA_API_KEY;

// POST /api/nutrition (text-based food search)
router.post('/', async (req, res) => {
  const { foodName } = req.body;
  if (!foodName || typeof foodName !== 'string') {
    return res.status(400).json({ error: 'Invalid food name' });
  }

  try {
    const searchRes = await axios.get('https://api.nal.usda.gov/fdc/v1/foods/search', {
      params: {
        query: foodName,
        pageSize: 1,
        api_key: USDA_API_KEY
      }
    });

    if (!searchRes.data.foods?.length) {
      return res.status(404).json({ error: 'Food not found in USDA database' });
    }

    const fdcId = searchRes.data.foods[0].fdcId;

    const detailRes = await axios.get(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}`, {
      params: { api_key: USDA_API_KEY }
    });

    const nutrients = detailRes.data.foodNutrients || [];

    const getNutrientValue = (name) => {
      const n = nutrients.find(n =>
        n.nutrient?.name?.toLowerCase().includes(name.toLowerCase())
      );
      return n ? `${n.amount} ${n.nutrient.unitName}` : 'N/A';
    };

    const result = {
      foodName: detailRes.data.description,
      calories: getNutrientValue('Energy'),
      protein: getNutrientValue('Protein'),
      fat: getNutrientValue('Total lipid'),
      carbohydrates: getNutrientValue('Carbohydrate'),
      sugar: getNutrientValue('Sugars'),
      fiber: getNutrientValue('Fiber'),
      calcium: getNutrientValue('Calcium'),
      iron: getNutrientValue('Iron'),
      sodium: getNutrientValue('Sodium')
    };

    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error fetching nutrition info' });
  }
});

module.exports = router;
