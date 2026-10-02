import { registerTool, print, setMode, getSystemPrompt } from './main.js';

let openedWindow = null;

const closeOpenedMapWindow = () => {
    if (openedWindow && !openedWindow.closed) {
        openedWindow.close();
    }

    openedWindow = null;
};

window.addEventListener('message', (e) => {
    if (e.data === 'close-map-environment') {
        closeOpenedMapWindow();
        print("system: closing active tool environment session [map].");
        setMode("main", getSystemPrompt());
        const cmdInput = document.getElementById('cmd-input');
        if (cmdInput) {
            cmdInput.value = '';
            cmdInput.style.height = '26px';
        }
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
            openedWindow = window.open(targetUrl, '_blank');

            if (!openedWindow) {
                print("error: the browser blocked the new tab. allow pop-ups for Studio and try again.");
                return;
            }

            return;
        }

        print(`system: locating geocoding coordinates for "${locationName}"...`);


        try {
            closeOpenedMapWindow();
            openedWindow = window.open('about:blank', '_blank');
            if (!openedWindow) {
                print("error: the browser blocked the new tab. allow pop-ups for Studio and try again.");
                return;
            }

            const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`);
            if (!geoResponse.ok) throw new Error('geocoding request failed');

            const geoData = await geoResponse.json();
            if (!geoData || !Array.isArray(geoData.results) || geoData.results.length === 0) {
                if (openedWindow && !openedWindow.closed) openedWindow.close();
                openedWindow = null;
                print(`error: could not resolve coordinates for "${locationName}".`);
                return;
            }

            const locationRecord = geoData.results[0];
            const lat = Number(locationRecord.latitude);
            const lon = Number(locationRecord.longitude);
            const displayName = locationRecord.name + (locationRecord.country ? `, ${locationRecord.country}` : '');

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                if (openedWindow && !openedWindow.closed) openedWindow.close();
                openedWindow = null;
                print(`error: received invalid coordinates for "${locationName}".`);
                return;
            }

            print(`system: found ${displayName} at [Lat: ${lat}, Lon: ${lon}].`);
            print("system: opening Google Maps in a dedicated workspace tab...");
            const mapQuery = encodeURIComponent(displayName);
            const mapUrl =
                `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

            if (openedWindow && !openedWindow.closed) {
                openedWindow.location.replace(mapUrl);
                try {
                    openedWindow.focus();
                } catch {
                }
            } else {
                openedWindow = window.open(mapUrl, '_blank');
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