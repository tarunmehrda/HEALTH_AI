# Deployment Guide for Render

This guide will help you deploy your USDA Nutrition API to Render.com for free.

## Pre-Deployment Checklist

### ✅ 1. Get USDA API Key
- [ ] Visit [USDA API Key Signup](https://fdc.nal.usda.gov/api-key-signup.html)
- [ ] Sign up for a free API key
- [ ] Copy your API key (you'll need it for Render)

### ✅ 2. Test Locally
```bash
# Make sure your API works locally first
npm install
npm start

# Test the API
node test-api.js
```

### ✅ 3. Prepare Repository
- [ ] Ensure all files are committed to Git
- [ ] Push to GitHub/GitLab
- [ ] Verify package.json has correct start script: `"start": "node app.js"`

## Render Deployment Steps

### Step 1: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub/GitLab
3. Connect your repository

### Step 2: Create Web Service
1. Click "New +" → "Web Service"
2. Select your repository
3. Configure the service:

**Basic Settings:**
- **Name:** `usda-nutrition-api` (or your preferred name)
- **Environment:** `Node`
- **Region:** Choose closest to your users
- **Branch:** `main` (or your default branch)

**Build & Deploy:**
- **Build Command:** `npm install`
- **Start Command:** `npm start`

### Step 3: Set Environment Variables
In the Render dashboard, add these environment variables:

| Key | Value | Notes |
|-----|-------|-------|
| `USDA_API_KEY` | `your_actual_api_key_here` | Replace with your real API key |
| `NODE_ENV` | `production` | Sets production mode |

### Step 4: Deploy
1. Click "Create Web Service"
2. Wait for deployment (usually 2-5 minutes)
3. Your API will be available at: `https://your-app-name.onrender.com`

## Post-Deployment Testing

### Test Your Deployed API

```bash
# Replace with your actual Render URL
export API_URL="https://your-app-name.onrender.com"

# Test health check
curl $API_URL/health

# Test root endpoint
curl $API_URL/

# Test nutrition endpoint
curl -X POST $API_URL/nutrition \
  -H "Content-Type: application/json" \
  -d '{"foodName": "apple"}'
```

### Update Your Apps
Update any mobile apps or frontend applications to use your new Render URL:
- Replace `http://localhost:3001` with `https://your-app-name.onrender.com`

## Render Free Tier Limitations

### What's Included (Free):
- ✅ 750 hours/month (enough for most personal projects)
- ✅ Automatic HTTPS
- ✅ Custom domains
- ✅ Git-based deployments
- ✅ Environment variables

### Limitations:
- ⚠️ **Sleep after 15 minutes of inactivity** (first request after sleep takes ~30 seconds)
- ⚠️ **512 MB RAM limit**
- ⚠️ **No persistent disk storage** (use external database for production data)

### Handling Sleep Mode:
The free tier "sleeps" after 15 minutes of inactivity. To minimize impact:

1. **For Development:** Accept the 30-second wake-up time
2. **For Production:** Consider upgrading to paid plan ($7/month) for always-on service
3. **Workaround:** Use a service like [UptimeRobot](https://uptimerobot.com) to ping your API every 14 minutes

## Troubleshooting

### Common Issues:

**1. "Build failed" Error:**
- Check that `package.json` has correct dependencies
- Ensure `"start": "node app.js"` in scripts
- Verify all files are committed to Git

**2. "Application failed to start" Error:**
- Check environment variables are set correctly
- Verify USDA_API_KEY is valid
- Check Render logs for specific error messages

**3. "USDA API authentication failed" Error:**
- Double-check your USDA_API_KEY in Render environment variables
- Ensure no extra spaces or quotes around the API key

**4. API responds slowly:**
- This is normal for free tier after sleep
- First request after 15+ minutes of inactivity takes ~30 seconds
- Subsequent requests are fast

### Viewing Logs:
1. Go to your Render dashboard
2. Click on your service
3. Click "Logs" tab to see real-time logs

## Updating Your Deployment

### Automatic Updates:
- Push changes to your Git repository
- Render automatically rebuilds and deploys
- No manual intervention needed

### Manual Redeploy:
1. Go to Render dashboard
2. Click your service
3. Click "Manual Deploy" → "Deploy latest commit"

## Production Considerations

### For Serious Production Use:

1. **Upgrade to Paid Plan** ($7/month):
   - Always-on service (no sleep)
   - More RAM and CPU
   - Priority support

2. **Add Database:**
   - Current app uses in-memory storage
   - Add PostgreSQL/MongoDB for persistent data
   - Render offers managed databases

3. **Add Monitoring:**
   - Set up health check monitoring
   - Use services like UptimeRobot or Pingdom
   - Monitor API response times

4. **Custom Domain:**
   - Add your own domain in Render settings
   - Automatic SSL certificate included

## Support

- **Render Documentation:** [render.com/docs](https://render.com/docs)
- **Render Community:** [community.render.com](https://community.render.com)
- **API Issues:** Check the logs and test locally first

---

🎉 **Congratulations!** Your USDA Nutrition API is now live and accessible worldwide!
