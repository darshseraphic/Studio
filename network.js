export const networkTool = {
    async handleInput(rawInput) {
        const segments = rawInput.split('/');
        const action = segments[1] ? segments[1].trim().toLowerCase() : '';

        if (action === 'ip') {
            this.getIP();
        } else if (action === 'location') {
            this.getLocation();
        } else if (action === 'speed') {
            this.trackSpeed();
        } else {
            window.print('network: unrecognized option ' + (action || 'none'));
        }
    },

    getIP() {
        window.print('Security Notice: To prevent unauthorized data exposure, we do not perform automatic background IP lookups.');
        window.print('Run this command to check manually: open/www.google.com/search?q=what+is+my+ip');
        window.print('Warning: You are navigating to an external domain. Please manage your own privacy settings accordingly.');
    },

    getLocation() {
        window.print('Security Notice: Native geolocation access is disabled to protect your coordinates.');
        window.print('Run this command to check manually: open/www.iplocation.net');
        window.print('Warning: You are navigating to an external domain. Only share location data with trusted services.');
    },

    trackSpeed() {
        window.print('Security Notice: Automated bandwidth testing can inadvertently share device telemetry.');
        window.print('Run this command to check manually: open/fast.com');
        window.print('Warning: You are navigating to an external domain to perform diagnostics.');
    },

    async pushLogToGitHub(logEntry) {
        const repo = localStorage.getItem('repository');
        if (!repo) return;

        try {
            const { registry, getFullFilePath } = await import('./main.js');
            if (registry['github']) {
                const path = getFullFilePath('network.md');
                const existing = await registry['github'].pull(path) || '';
                await registry['github'].sync(path, existing + '\n' + logEntry);
            }
        } catch (e) {
            return;
        }
    }
};