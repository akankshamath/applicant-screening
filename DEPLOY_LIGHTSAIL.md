# AWS Lightsail Deployment Guide

## Step 1: Create a Lightsail Instance

1. Go to [AWS Lightsail Console](https://lightsail.aws.amazon.com/)
2. Click **"Create instance"**
3. Choose instance location: **Select region closest to your users**
4. Pick your instance image:
   - Platform: **Linux/Unix**
   - Blueprint: **OS Only** → **Ubuntu 22.04 LTS**
5. Choose your instance plan:
   - **$3.50/month** (512 MB RAM, 1 vCPU) - Good for light usage
   - **$5/month** (1 GB RAM, 1 vCPU) - Recommended
6. Name your instance: `linkedin-screener`
7. Click **"Create instance"**

Wait 1-2 minutes for the instance to start.

---

## Step 2: Configure Firewall (Networking)

1. Click on your instance name
2. Go to **"Networking"** tab
3. Under **"Firewall"**, click **"Add rule"**
4. Add this rule:
   - Application: **Custom**
   - Protocol: **TCP**
   - Port: **5055**
   - Click **"Create"**

Now port 5055 is accessible from the internet.

---

## Step 3: Connect to Your Server

1. In the Lightsail console, click **"Connect using SSH"** (orange button)
2. A terminal window will open in your browser

Alternatively, use your own terminal:
```bash
# Download the SSH key from Lightsail
# Then connect:
ssh -i /path/to/LightsailDefaultKey.pem ubuntu@YOUR_INSTANCE_IP
```

---

## Step 4: Install Node.js and Dependencies

In the SSH terminal, run these commands:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x
npm --version   # Should show 10.x

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

---

## Step 5: Upload Your Application

**Option A: Using Git (Recommended)**

If your code is on GitHub:
```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/applicant-screening.git
cd applicant-screening

# Install dependencies
npm ci

# Build TypeScript
npm run build
```

**Option B: Upload Files Manually**

From your local computer, upload files using SCP:
```bash
# On your local machine (in the project directory):
scp -i /path/to/LightsailDefaultKey.pem -r ./* ubuntu@YOUR_INSTANCE_IP:~/applicant-screening/

# Then SSH into the server and install:
cd ~/applicant-screening
npm ci
npm run build
```

---

## Step 6: Configure Environment Variables

On the server, create the `.env` file:

```bash
cd ~/applicant-screening
nano .env
```

Add your credentials:
```
LI_AT_COOKIE=your_linkedin_cookie_here
EXA_API_KEY=your_exa_key_here (optional)
PORT=5055
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

**Security tip:** Make sure the file is only readable by you:
```bash
chmod 600 .env
```

---

## Step 7: Start the Application with PM2

```bash
# Start the app
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs

# Save PM2 configuration (auto-restart on reboot)
pm2 save
pm2 startup
# Follow the command it gives you (copy-paste and run)
```

---

## Step 8: Test Your Deployment

1. Find your public IP in the Lightsail console (top of instance page)
2. Open in browser: `http://YOUR_PUBLIC_IP:5055`
3. You should see the LinkedIn Screener interface!

**Share this URL with your users:**
```
http://YOUR_PUBLIC_IP:5055
```

---

## Step 9: Monitor and Manage

**View application logs:**
```bash
pm2 logs linkedin-screener
```

**Restart the application:**
```bash
pm2 restart linkedin-screener
```

**Stop the application:**
```bash
pm2 stop linkedin-screener
```

**Update your code:**
```bash
cd ~/applicant-screening
git pull  # If using Git
npm run build
pm2 restart linkedin-screener
```

**Update environment variables:**
```bash
nano .env
# Make changes, then save
pm2 restart linkedin-screener
```

---

## Optional: Set Up a Domain Name

Instead of using IP address, you can use a custom domain:

1. Buy a domain (Namecheap, Google Domains, etc.)
2. In Lightsail, go to **"Networking"** tab
3. Create a **Static IP** (free)
4. Attach it to your instance
5. In your domain registrar, add an **A record**:
   - Type: `A`
   - Name: `@` (or `screener`)
   - Value: `YOUR_STATIC_IP`
   - TTL: `3600`

Now users can access: `http://yourdomain.com:5055`

---

## Optional: Add HTTPS (SSL)

For production, you should use HTTPS. This requires:
1. A domain name (see above)
2. Installing Nginx as a reverse proxy
3. Using Let's Encrypt for free SSL certificate

Let me know if you need help with this!

---

## Troubleshooting

**Can't connect to the URL?**
- Check firewall rules (port 5055 should be open)
- Check PM2 status: `pm2 status`
- Check logs: `pm2 logs`

**Application crashed?**
- Check logs: `pm2 logs linkedin-screener --lines 100`
- Check environment variables: `cat .env`
- Restart: `pm2 restart linkedin-screener`

**Out of memory?**
- Upgrade to larger Lightsail plan ($5 or $10/month)
- Check memory usage: `free -h`

**Need to update LinkedIn cookie?**
```bash
nano .env
# Update LI_AT_COOKIE value
pm2 restart linkedin-screener
```

---

## Costs

- **Lightsail instance:** $3.50-5/month
- **Static IP:** Free (while attached to instance)
- **Data transfer:** First 1 TB/month free

**Total:** ~$5/month

---

## Security Notes

⚠️ **IMPORTANT:**
- This deployment has **NO authentication** by default
- Anyone with the URL can use your LinkedIn credentials
- Consider adding:
  - Basic authentication (password protection)
  - IP whitelisting
  - VPN access only

Let me know when you need to add authentication!
