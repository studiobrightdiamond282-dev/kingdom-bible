/* KINGDOM BIBLE — Capacitor native bridge
   Loads Capacitor plugins when running inside the native wrapper (iOS/Android),
   and degrades gracefully in a plain browser / PWA context. */
(function () {
  'use strict';

  window.KingdomNative = {
    ready: false,
    platform: 'web',
    isNative: false,

    // Plugin handles (populated on ready)
    Splash: null,
    StatusBar: null,
    Keyboard: null,
    Device: null,
    Network: null,
    Haptics: null,
    Dialog: null,
    LocalNotifications: null,
    Filesystem: null,

    // Listen for offline/online
    onOnline: null,
    onOffline: null,

    init: function (onReady) {
      if (window.Capacitor && window.Capacitor.Plugins) {
        this.isNative = true;
        this.platform = window.Capacitor.getPlatform
          ? window.Capacitor.getPlatform()
          : 'unknown';

        const Plugins = window.Capacitor.Plugins;

        this.Splash = Plugins.SplashScreen || null;
        this.StatusBar = Plugins.StatusBar || null;
        this.Keyboard = Plugins.Keyboard || null;
        this.Device = Plugins.Device || null;
        this.Network = Plugins.Network || null;
        this.Haptics = Plugins.Haptics || null;
        this.Dialog = Plugins.Dialog || null;
        this.LocalNotifications = Plugins.LocalNotifications || null;
        this.Filesystem = Plugins.Filesystem || null;

        // Hide splash screen once the app shell is ready
        if (this.Splash && this.Splash.hide) {
          setTimeout(() => this.Splash.hide().catch(() => {}), 300);
        }

        // Set status bar color to match theme
        if (this.StatusBar && this.StatusBar.setBackgroundColor) {
          this.StatusBar.setBackgroundColor({ color: '#07142f' });
        }

        // Network change listeners
        if (this.Network && this.Network.addListener) {
          this.Network.addListener('networkStatusChange', (status) => {
            const online = status.connected;
            if (online && this.onOnline) this.onOnline();
            if (!online && this.onOffline) this.onOffline();
          });
        }

        this.ready = true;
        if (onReady) onReady(this);
      } else {
        // Plain browser / PWA fallback
        this.isNative = false;
        this.platform = 'web';
        this.ready = true;

        // Use native browser online/offline events
        window.addEventListener('online', () => { if (this.onOnline) this.onOnline(); });
        window.addEventListener('offline', () => { if (this.onOffline) this.onOffline(); });

        if (onReady) onReady(this);
      }
    },

    vibrate: function (ms = 50) {
      if (this.Haptics && this.Haptics.vibrate) {
        return this.Haptics.vibrate({ duration: ms });
      }
      if (navigator.vibrate) navigator.vibrate(ms);
      return Promise.resolve();
    },

    alert: function (title, message) {
      if (this.Dialog && this.Dialog.alert) {
        return this.Dialog.alert({ title, message });
      }
      return Promise.resolve(window.alert(message));
    },

    getDeviceInfo: async function () {
      if (this.Device && this.Device.getInfo) {
        return this.Device.getInfo();
      }
      return {
        platform: 'web',
        model: navigator.platform || 'unknown',
        version: navigator.userAgent,
        manufacturer: 'browser',
      };
    },

    scheduleNotification: function (opts) {
      if (this.LocalNotifications && this.LocalNotifications.schedule) {
        return this.LocalNotifications.schedule(opts);
      }
      return Promise.resolve();
    },
  };

  // Auto-initialize when Capacitor is ready
  if (window.Capacitor && window.Capacitor.Plugins) {
    window.KingdomNative.init();
  } else {
    // Fallback for plain browser — wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => window.KingdomNative.init());
    } else {
      window.KingdomNative.init();
    }
  }
})();