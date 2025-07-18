// Correct - use "foodName" not "food"
const response = await fetch('https://health-ai-crvi.onrender.com/nutrition', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    foodName: 'cake'  // Changed from "food" to "foodName"
  })
});

const data = await response.json();
console.log(data);
