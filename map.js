import { registerTool, print } from './main.js';

let openedWindow = null;

const mapTool = {
    helpText: "open an interactive map centered on a location (use: map/[location])",
    prompt: "map>",
    onEnter: async () => {
        print("system: map mode activated. type a location name or map/[location]. press CTRL + E to exit.");
    },
    handleInput: async (input) => {
        print(`map>${input}`);
        
        let locationName = input.trim();
        if (locationName === '') return;

        if (locationName.toLowerCase().startsWith('map/')) {
            locationName = locationName.substring(4).trim();
        }

        if (locationName === '') {
            print("error: please specify a valid location.");
            return;
        }

        print(`system: locating geocoding coordinates for "${locationName}"...`);

        try {
            const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`);
            if (!geoResponse.ok) throw new Error();
            
            const geoData = await geoResponse.json();
            if (!geoData || !Array.isArray(geoData.results) || geoData.results.length === 0) {
                print(`error: could not resolve coordinates for "${locationName}".`);
                return;
            }

            const locationRecord = geoData.results[0];
            const lat = locationRecord.latitude;
            const lon = locationRecord.longitude;
            const displayName = locationRecord.name + (locationRecord.country ? `, ${locationRecord.country}` : '');

            print(`system: found ${displayName} at [Lat: ${lat}, Lon: ${lon}].`);

            const isInverseTheme = document.body.classList.contains('theme-inverse');
            const styleUrl = isInverseTheme 
                ? 'https://tiles.openfreemap.org/styles/positron' 
                : 'https://tiles.openfreemap.org/styles/dark';

            const pinColor = isInverseTheme ? '#000000' : '#ffffff';
            const circleColor = isInverseTheme ? '#ffffff' : '#000000';

            print("system: generating map viewport instance and launching workspace tab...");

            if (openedWindow && !openedWindow.closed) {
                openedWindow.close();
            }

            const mapHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Map View - ${displayName.replace(/"/g, '&quot;')}</title>
    <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no">
    <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
    <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet">
    <style>
        body { margin: 0; padding: 0; }
        #map { position: absolute; top: 0; bottom: 0; width: 100%; }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        const map = new maplibregl.Map({
            container: 'map',
            style: '${styleUrl}',
            center: [${lon}, ${lat}],
            zoom: 13
        });
        map.addControl(new maplibregl.NavigationControl());

        const container = document.createElement('div');
        container.innerHTML = '<svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg"><path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 28 16 28s16-17 16-28c0-8.8-7.2-16-16-16z" fill="${pinColor}"/><circle cx="16" cy="16" r="5.5" fill="${circleColor}"/></svg>';
        
        new maplibregl.Marker({ element: container.firstElementChild })
            .setLngLat([${lon}, ${lat}])
            .addTo(map);

        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                window.close();
            }
        });
    </script>
</body>
</html>`;

            const blob = new Blob([mapHtml], { type: 'text/html' });
            const viewerUrl = URL.createObjectURL(blob);
            openedWindow = window.open(viewerUrl, '_blank');

        } catch (err) {
            print("error: failed to securely communicate with the geocoding service framework.");
        }
    },
    onExit: () => {
        if (openedWindow && !openedWindow.closed) {
            openedWindow.close();
        }
        print("system: exited map engine console interface layout.");
    }
};

registerTool('map', mapTool);