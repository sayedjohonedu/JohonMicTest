const store = require('../../store/config');

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
      // Offline fallback
    }
  } else {
    let firstLaunch = store.get('firstLaunchDate');
    if (!firstLaunch || firstLaunch === 0) {
      firstLaunch = Date.now();
      store.set('firstLaunchDate', firstLaunch);
    }
    const daysUsed = (Date.now() - firstLaunch) / (1000 * 60 * 60 * 24);
    if (daysUsed > 7) {
      store.set('licenseStatus', 'expired');
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
  verifyLicense
};
