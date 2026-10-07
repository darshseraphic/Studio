import { registerTool, print, setMode, getSystemPrompt } from './main.js';
import { secureFetch, openExternalUrl } from './network-security.js';

let openedWindow = null;
let openedWindowOrigin = null;

const MAP_CLOSE_MESSAGE = Object.freeze({
    type: 'studio.map',
    version: 1,
    action: 'close'
});

const closeOpenedMapWindow = () => {
    if (openedWindow && !openedWindow.closed) {
        openedWindow.close();
    }

    openedWindow = null;
    openedWindowOrigin = null;
};

const rememberOpenedMapWindow = (windowRef, expectedOrigin = null) => {
    openedWindow = windowRef;
    openedWindowOrigin = expectedOrigin;
};

const isValidMapCloseMessage = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const keys = Object.keys(data).sort();
    if (keys.length !== 3 || keys[0] !== 'action' || keys[1] !== 'type' || keys[2] !== 'version') return false;
    return data.type === MAP_CLOSE_MESSAGE.type
        && data.version === MAP_CLOSE_MESSAGE.version
        && data.action === MAP_CLOSE_MESSAGE.action;
};

window.addEventListener('message', (event) => {
    if (!openedWindow || event.source !== openedWindow) return;
    if (!openedWindowOrigin || event.origin !== openedWindowOrigin) return;
    if (!isValidMapCloseMessage(event.data)) return;

    closeOpenedMapWindow();
    print("system: closing active tool environment session [map].");
    setMode("main", getSystemPrompt());
    const cmdInput = document.getElementById('cmd-input');
    if (cmdInput) {
        cmdInput.value = '';
        cmdInput.style.height = '26px';
    }
});

const mapTool = {
    helpText: "open an interactive map centered on a location (use: map/[location] or map/road/[location])",
    prompt: "map>",
    onEnter: async () => {
        print("system: map mode activated. type a location name or map/[location] (or road/[location]). type exit to return to the main terminal or press CTRL + E.");
    },
    handleInput: async (input) => {
        print(`map>${input}`);

        let cleanInput = input.trim();
        if (cleanInput === '') return;

        if (cleanInput.toLowerCase() === 'exit') {
            closeOpenedMapWindow();
            print("system: closing active tool environment session [map].");
            setMode("main", getSystemPrompt());

            const cmdInput = document.getElementById('cmd-input');
            if (cmdInput) {
                cmdInput.value = '';
                cmdInput.style.height = '26px';
            }

            return;
        }

        if (cleanInput.toLowerCase().startsWith('map/')) {
            cleanInput = cleanInput.substring(4).trim();
        }

        if (cleanInput === '') {
            print("error: please specify a valid location.");
            return;
        }

        let isRoadMode = false;
        let locationName = cleanInput;

        if (locationName.toLowerCase().startsWith('road/')) {
            isRoadMode = true;
            locationName = locationName.substring(5).trim();
        } else if (locationName.toLowerCase().startsWith('road ')) {
            isRoadMode = true;
            locationName = locationName.substring(5).trim();
        }

        if (locationName === '') {
            print("error: please specify a valid location.");
            return;
        }

        if (isRoadMode) {
            print(`system: opening city roads visualization for "${locationName}"...`);
            closeOpenedMapWindow();

            const targetUrl = `https://anvaka.github.io/city-roads/?q=${encodeURIComponent(locationName)}`;
            try {
                rememberOpenedMapWindow(openExternalUrl(targetUrl), new URL(targetUrl).origin);
            } catch (errorValue) {
                print(`error: ${errorValue instanceof Error ? errorValue.message : 'external map navigation was rejected.'}`);
                return;
            }

            return;
        }

        print(`system: locating geocoding coordinates for "${locationName}"...`);


        try {
            closeOpenedMapWindow();

            // Open the new tab immediately from the user command so browser popup blockers
            // are less likely to reject it while geocoding runs asynchronously.
            const initialMapWindow = window.open('about:blank', '_blank');
            if (initialMapWindow) {
                rememberOpenedMapWindow(initialMapWindow);
                try {
                    openedWindow.opener = null;
                } catch {
                    try { openedWindow.close(); } catch { /* best-effort cleanup */ }
                    openedWindow = null;
                    openedWindowOrigin = null;
                }
            }
            if (!openedWindow) {
                print("error: the browser blocked the new tab. allow pop-ups for Studio and try again.");
                return;
            }

            const geoResponse = await secureFetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`);
            if (!geoResponse.ok) throw new Error('geocoding request failed');

            const geoData = await geoResponse.json();
            if (!geoData || !Array.isArray(geoData.results) || geoData.results.length === 0) {
                closeOpenedMapWindow();
                print(`error: could not resolve coordinates for "${locationName}".`);
                return;
            }

            const locationRecord = geoData.results[0];
            const lat = Number(locationRecord.latitude);
            const lon = Number(locationRecord.longitude);
            const displayName = locationRecord.name + (locationRecord.country ? `, ${locationRecord.country}` : '');

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                closeOpenedMapWindow();
                print(`error: received invalid coordinates for "${locationName}".`);
                return;
            }

            print(`system: found ${displayName} at [Lat: ${lat}, Lon: ${lon}].`);
            print("system: opening Google Maps in a dedicated workspace tab...");

            // Google Maps URLs use a search query to open a real Maps page for
            // the resolved place. The geocoding step above gives us a canonical
            // display name, which is preferable to sending bare coordinates when
            // we want Google Maps to identify the place itself.
            const mapQuery = encodeURIComponent(displayName);
            const mapUrl =
                `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
            const mapOrigin = new URL(mapUrl).origin;

            if (openedWindow && !openedWindow.closed) {
                openedWindowOrigin = mapOrigin;
                openedWindow.location.replace(mapUrl);
                try {
                    openedWindow.focus();
                } catch {
                    // Focusing a cross-origin tab can be denied by the browser.
                }
            } else {
                // The first tab may have been closed while geocoding was in progress.
                rememberOpenedMapWindow(openExternalUrl(mapUrl), mapOrigin);
            }

            if (!openedWindow) {
                print("error: failed to open the map tab.");
                return;
            }
        } catch (err) {
            if (openedWindow && !openedWindow.closed) openedWindow.close();
            openedWindow = null;
            print("error: failed to resolve the location or open the map workspace.");
        }
    },
    onExit: () => {
        closeOpenedMapWindow();
        print("system: exited map engine console interface layout.");
    }
};

registerTool('map', mapTool);
