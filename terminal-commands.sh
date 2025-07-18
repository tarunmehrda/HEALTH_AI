# Initialize git repository (if not already done)
git init

# Add all files to staging
git add .

# Commit your changes
git commit -m "Initial commit of USDA Nutrition API with streak tracking"

# Add the remote repository
git remote add origin https://github.com/tarunmehrda/HEALTH_AI.git

# Push your code to GitHub
git push -u origin master
# If your main branch is called 'main' instead of 'master', use:
# git push -u origin main