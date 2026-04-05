const store = require('../../store/config');

/**
 * Returns the timestamp for today's midnight (start of today) in local time.
 */
function getTodayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Resets the free-tier daily word counter if we've crossed into a new day.
 * Safe to call multiple times — only acts when the day has changed.
 */
function checkAndResetDailyWords() {
  const todayMidnight = getTodayMidnight();
  const lastReset = store.get('freeDailyReset') || 0;
  if (lastReset < todayMidnight) {
    store.set('freeDailyWords', 0);
    store.set('freeDailyReset', todayMidnight);
  }
}

async function checkAuthStatus() {
  const key = store.get('licenseKey');
  if (key) {
    try {
      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: 'LpMFpNqkVgE8E0V8o-Q92w==',
          license_key: key,
          increment_uses_count: 'false'
        })
      });
      const data = await response.json();
      if (!data.success) {
        store.set('licenseStatus', 'expired');
        store.set('licensePurchase', {});
      } else {
        store.set('licenseStatus', 'active');
        if (data.purchase) store.set('licensePurchase', data.purchase);
      }
    } catch (e) {
      // Offline fallback — keep current status
    }
  } else {
    let firstLaunch = store.get('firstLaunchDate');
    if (!firstLaunch || firstLaunch === 0) {
      firstLaunch = Date.now();
      store.set('firstLaunchDate', firstLaunch);
    }
    const daysUsed = (Date.now() - firstLaunch) / (1000 * 60 * 60 * 24);
    if (daysUsed > 7) {
      // Free tier: trial ended, no paid license — gets 300 words/day
      store.set('licenseStatus', 'free');
    } else {
      store.set('licenseStatus', 'trial');
    }
  }
}

async function verifyLicense(key) {
  try {
    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: 'LpMFpNqkVgE8E0V8o-Q92w==',
        license_key: key,
        increment_uses_count: 'true'
      })
    });
    const data = await response.json();
    
    if (data.success) {
      store.set('licenseKey', key);
      store.set('licenseStatus', 'active');
      // Record when this license was first activated (don't overwrite if already set)
      if (!store.get('licenseActivatedDate')) {
        store.set('licenseActivatedDate', Date.now());
      }
      if (data.purchase) store.set('licensePurchase', data.purchase);
      return { success: true, message: 'License verified successfully!' };
    } else {
      store.set('licenseStatus', 'expired');
      return { success: false, message: data.message || 'Invalid or expired key.' };
    }
  } catch (err) {
    return { success: false, message: 'Server error. Please check your internet connection.' };
  }
}

module.exports = {
  checkAuthStatus,
  verifyLicense,
  checkAndResetDailyWords,
  getTodayMidnight,
};
