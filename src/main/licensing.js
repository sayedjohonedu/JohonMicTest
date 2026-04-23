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
    if (daysUsed > 15) {
      // Free tier: trial ended, no paid license — gets 500 words/day
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

/**
 * Checks whether the free AI trial (15 days) has expired for non-licensed users.
 * If expired, auto-disables AI mode.
 * Returns { expired: true, daysUsed } if the trial is over, or { expired: false, daysLeft } if still valid.
 */
function checkAiTrialExpiry() {
  const status = store.get('licenseStatus');
  // Licensed users — no trial restriction
  if (status === 'active') return { expired: false, daysLeft: Infinity };

  const firstEnabled = store.get('aiFirstEnabledDate') || 0;
  if (!firstEnabled) return { expired: false, daysLeft: 15 }; // Never enabled yet

  const daysUsed = (Date.now() - firstEnabled) / (1000 * 60 * 60 * 24);
  if (daysUsed > 15) {
    // Trial is over — force-disable AI mode
    store.set('aiModeEnabled', false);
    return { expired: true, daysUsed: Math.floor(daysUsed) };
  }
  return { expired: false, daysLeft: Math.ceil(15 - daysUsed) };
}

/**
 * Checks whether the free Offline Mode trial (15 days) has expired for non-licensed users.
 * If expired, auto-disables offline mode.
 * Returns { expired: true, daysUsed } if the trial is over, or { expired: false, daysLeft } if still valid.
 */
function checkOfflineTrialExpiry() {
  const status = store.get('licenseStatus');
  // Licensed users — no trial restriction
  if (status === 'active') return { expired: false, daysLeft: Infinity };

  const firstEnabled = store.get('offlineFirstEnabledDate') || 0;
  if (!firstEnabled) return { expired: false, daysLeft: 15 }; // Never enabled yet

  const daysUsed = (Date.now() - firstEnabled) / (1000 * 60 * 60 * 24);
  if (daysUsed > 15) {
    // Trial is over — force-disable offline mode
    store.set('offlineModeEnabled', false);
    return { expired: true, daysUsed: Math.floor(daysUsed) };
  }
  return { expired: false, daysLeft: Math.ceil(15 - daysUsed) };
}

module.exports = {
  checkAuthStatus,
  verifyLicense,
  checkAndResetDailyWords,
  getTodayMidnight,
  checkAiTrialExpiry,
  checkOfflineTrialExpiry,
};
