const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3001';

// Test functions
async function testHealthCheck() {
  console.log('\n🔍 Testing Health Check...');
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testRootEndpoint() {
  console.log('\n🔍 Testing Root Endpoint...');
  try {
    const response = await axios.get(`${BASE_URL}/`);
    console.log('✅ Root endpoint passed');
    console.log('📋 Available endpoints:', Object.keys(response.data.endpoints));
    return true;
  } catch (error) {
    console.error('❌ Root endpoint failed:', error.message);
    return false;
  }
}

async function testNutritionEndpoint() {
  console.log('\n🔍 Testing Nutrition Endpoint...');
  
  const testCases = [
    { foodName: 'apple', description: 'Simple food' },
    { foodName: '2 apples', description: 'Multiple pieces' },
    { foodName: '200 grams of rice', description: 'Weight in grams' },
    { foodName: '1.5 kg chicken', description: 'Weight in kilograms' }
  ];

  let passed = 0;
  
  for (const testCase of testCases) {
    try {
      console.log(`  Testing: ${testCase.description} - "${testCase.foodName}"`);
      const response = await axios.post(`${BASE_URL}/nutrition`, {
        foodName: testCase.foodName
      });
      
      if (response.data.calculatedNutrition && response.data.calculatedNutrition.calories) {
        console.log(`  ✅ ${testCase.description}: ${response.data.calculatedNutrition.calories}`);
        passed++;
      } else {
        console.log(`  ❌ ${testCase.description}: Invalid response format`);
      }
    } catch (error) {
      console.error(`  ❌ ${testCase.description}: ${error.response?.data?.error || error.message}`);
    }
  }
  
  console.log(`\n📊 Nutrition tests: ${passed}/${testCases.length} passed`);
  return passed === testCases.length;
}

async function testCartFunctionality() {
  console.log('\n🔍 Testing Cart Functionality...');
  
  try {
    // First, get nutrition data for an apple
    const nutritionResponse = await axios.post(`${BASE_URL}/nutrition`, {
      foodName: '2 apples'
    });
    
    if (!nutritionResponse.data.calculatedNutrition) {
      console.error('❌ Failed to get nutrition data for cart test');
      return false;
    }
    
    // Add to cart
    const cartData = encodeURIComponent(JSON.stringify(nutritionResponse.data));
    const addResponse = await axios.get(`${BASE_URL}/api/addtocart?data=${cartData}`);
    
    if (addResponse.data.success) {
      console.log('✅ Successfully added to cart');
      console.log(`📊 Cart summary: ${addResponse.data.cartSummary.totalItems} items, ${addResponse.data.cartSummary.totalCalories} calories`);
      
      // View cart
      const cartResponse = await axios.get(`${BASE_URL}/api/cart`);
      console.log(`✅ Cart viewed: ${cartResponse.data.summary.totalItems} items`);
      
      // Clear cart
      const clearResponse = await axios.delete(`${BASE_URL}/api/cart`);
      console.log('✅ Cart cleared successfully');
      
      return true;
    } else {
      console.error('❌ Failed to add to cart');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Cart test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function testStreakFunctionality() {
  console.log('\n🔍 Testing Streak Functionality...');
  
  try {
    // Get current streak
    const streakResponse = await axios.get(`${BASE_URL}/api/streak`);
    console.log(`✅ Current streak: ${streakResponse.data.currentStreak} days`);
    
    // Get today's nutrition
    const todayResponse = await axios.get(`${BASE_URL}/api/nutrition/today`);
    console.log(`✅ Today's nutrition: ${todayResponse.data.data.totalCalories} calories`);
    
    return true;
  } catch (error) {
    console.error('❌ Streak test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting API Tests...');
  console.log(`📍 Testing against: ${BASE_URL}`);
  
  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Root Endpoint', fn: testRootEndpoint },
    { name: 'Nutrition Endpoint', fn: testNutritionEndpoint },
    { name: 'Cart Functionality', fn: testCartFunctionality },
    { name: 'Streak Functionality', fn: testStreakFunctionality }
  ];
  
  let passed = 0;
  
  for (const test of tests) {
    const result = await test.fn();
    if (result) passed++;
  }
  
  console.log('\n📋 Test Summary:');
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${tests.length - passed}/${tests.length}`);
  
  if (passed === tests.length) {
    console.log('\n🎉 All tests passed! API is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above for details.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testHealthCheck,
  testRootEndpoint,
  testNutritionEndpoint,
  testCartFunctionality,
  testStreakFunctionality
};
