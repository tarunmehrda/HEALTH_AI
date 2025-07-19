# USDA Nutrition API with Streak Tracking

A complete nutrition analysis API that integrates with the USDA nutrition database, featuring quantity parsing, cart management, and daily streak tracking.

## Features

- 🥗 **USDA Nutrition Database Integration** - Access comprehensive nutrition data
- 📊 **Smart Quantity Parsing** - Supports pieces, grams, and kilograms
- 🛒 **Cart Management** - Add, view, and manage nutrition items
- 🔥 **Daily Streak Tracking** - Track consecutive days of nutrition logging
- 📈 **Nutrition History** - View daily and historical nutrition data
- 🏆 **Achievement System** - Unlock achievements for consistent tracking
- 🌐 **Render-Ready** - Optimized for cloud deployment

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd usda-api
npm install
```

### 2. Get USDA API Key

1. Visit [USDA API Key Signup](https://fdc.nal.usda.gov/api-key-signup.html)
2. Sign up for a free API key
3. Copy your API key

### 3. Configure Environment

Create or update `.env` file:

```env
USDA_API_KEY=your_actual_api_key_here
PORT=3001
NODE_ENV=development
```

### 4. Start the Server

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

### 5. Test the API

```bash
# Run comprehensive tests
node test-api.js

# Or test manually
curl http://localhost:3001/health
```

## API Endpoints

### 🏠 Root & Health
- `GET /` - API documentation and endpoint list
- `GET /health` - Health check with system info

### 🥗 Nutrition Analysis
- `POST /nutrition` - Get nutrition data for food items

**Example Request:**
```json
{
  "foodName": "2 apples"
}
```

**Supported Formats:**
- Simple: `"apple"`
- Pieces: `"2 apples"`
- Grams: `"200 grams of rice"`
- Kilograms: `"1.5 kg chicken"`
- Natural language: `"I had 200g rice"`

### 🛒 Cart Management
- `GET /api/addtocart?data={nutritionData}` - Add nutrition data to cart
- `GET /api/cart` - View current cart and streak info
- `DELETE /api/cart` - Clear entire cart
- `DELETE /api/cart/:id` - Remove specific item

### 🔥 Streak Tracking
- `GET /api/streak` - Get detailed streak information
- `POST /api/streak/reset` - Reset streak data
- `GET /api/streak/history` - Complete streak and nutrition history

### 📊 Nutrition History
- `GET /api/nutrition/today` - Today's nutrition data
- `GET /api/nutrition/history` - Nutrition history by date range
- `GET /api/nutrition/history?date=2024-01-17` - Specific date
- `GET /api/nutrition/history?startDate=2024-01-15&endDate=2024-01-20` - Date range

## Usage Examples

### Basic Nutrition Lookup
```bash
curl -X POST http://localhost:3001/nutrition \
  -H "Content-Type: application/json" \
  -d '{"foodName": "apple"}'
```

### Add to Cart
```bash
# First get nutrition data, then add to cart
NUTRITION_DATA='{"originalInput":"2 apples","parsedFood":"apple","calculatedNutrition":{"calories":"189 kcal"}}'
curl "http://localhost:3001/api/addtocart?data=$(echo $NUTRITION_DATA | jq -r @uri)"
```

### View Streak
```bash
curl http://localhost:3001/api/streak
```

## Deployment to Render

### 1. Prepare for Deployment

Ensure your `.env` file has the correct USDA API key:
```env
USDA_API_KEY=your_actual_api_key_here
NODE_ENV=production
```

### 2. Deploy to Render

1. **Connect Repository:**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service:**
   - **Name:** `usda-nutrition-api`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

3. **Set Environment Variables:**
   - Add `USDA_API_KEY` with your actual API key
   - Add `NODE_ENV` set to `production`

4. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment to complete

### 3. Test Deployed API

```bash
# Replace with your actual Render URL
curl https://your-app-name.onrender.com/health
```

## Development

### Project Structure
```
usda-api/
├── app.js              # Main application file
├── package.json        # Dependencies and scripts
├── .env               # Environment variables
├── test-api.js        # API test suite
├── README.md          # This file
└── public/            # Static files (if any)
```

### Running Tests
```bash
# Start server first
npm start

# In another terminal, run tests
node test-api.js
```

### Adding New Features

The API is modular and easy to extend:
- Add new endpoints in `app.js`
- Nutrition calculation logic is in `calculateNutrition()` function
- Streak tracking logic is in `updateStreak()` function
- Cart management uses in-memory storage (consider database for production)

## Troubleshooting

### Common Issues

1. **"USDA_API_KEY is not set"**
   - Ensure `.env` file exists with valid API key
   - Check that `.env` is in the project root

2. **"Food not found in USDA database"**
   - Try simpler food names (e.g., "rice" instead of "basmati rice")
   - Check spelling and try common food names

3. **Port already in use**
   - Change PORT in `.env` file
   - Kill existing processes: `pkill -f node`

4. **Render deployment fails**
   - Ensure `package.json` has correct start script
   - Check that all dependencies are listed
   - Verify environment variables are set in Render dashboard

### Support

For issues or questions:
1. Check the API documentation at the root endpoint (`/`)
2. Run the test suite to identify specific problems
3. Check server logs for detailed error messages

## License

MIT License - feel free to use and modify as needed.
