const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function testTextEndpoint() {
  console.log('🧪 Testing text-based nutrition endpoint...');
  
  try {
    const response = await axios.post('http://localhost:3000/nutrition', {
      foodName: 'banana'
    });
    
    console.log('✅ Text endpoint working!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('❌ Text endpoint failed:', error.response?.data || error.message);
  }
}

async function testHealthEndpoint() {
  console.log('\n🧪 Testing health endpoint...');
  
  try {
    const response = await axios.get('http://localhost:3000/health');
    console.log('✅ Health endpoint working!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('❌ Health endpoint failed:', error.response?.data || error.message);
  }
}

async function testImageEndpoint() {
  console.log('\n🧪 Testing image endpoint...');
  
  // Create a simple test image (1x1 pixel PNG)
  const testImageBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
    0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  
  // Write test image to file
  fs.writeFileSync('test-image.png', testImageBuffer);
  
  try {
    const form = new FormData();
    form.append('image', fs.createReadStream('test-image.png'));
    
    const response = await axios.post('http://localhost:3000/nutrition/image', form, {
      headers: form.getHeaders(),
      timeout: 30000 // 30 second timeout for image processing
    });
    
    console.log('✅ Image endpoint working!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('❌ Image endpoint failed:', error.response?.data || error.message);
  } finally {
    // Clean up test image
    if (fs.existsSync('test-image.png')) {
      fs.unlinkSync('test-image.png');
    }
  }
}

async function runAllTests() {
  console.log('🚀 Starting API endpoint tests...\n');
  
  await testHealthEndpoint();
  await testTextEndpoint();
  await testImageEndpoint();
  
  console.log('\n✨ All tests completed!');
}

runAllTests();
