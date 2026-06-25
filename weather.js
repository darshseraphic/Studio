import { registerTool, print } from './main.js';

let weatherSessionLines = JSON.parse(localStorage.getItem('weather')) || [];

const weather = {
    helpText: "fetch current weather forecast table for a location (use: weather/cityname)",
    prompt: "weather>",
    onEnter: async () => {
        weatherSessionLines = [];
        localStorage.removeItem('weather');
        print("system: weather mode activated. type 'weather/cityname' to see weather data. press CTRL + E to exit, type 'save' to download.");
    },
    handleInput: async (input) => {
        print(`weather>${input}`);
        if (input.trim() === '') return;

        const parts = input.split('/');
        if (parts[0].trim().toLowerCase() !== 'weather' || !parts[1] || parts[1].trim() === '') {
            print("error: invalid format. please use weather/cityname");
            return;
        }

        const locationName = parts[1].trim();
        print(`system: searching for coordinates of ${locationName}...`);

        try {
            const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`);
            if (!geoResponse.ok) throw new Error();
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                print(`error: could not find location "${locationName}"`);
                return;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
            print(`system: fetching data for ${name}, ${country}...`);

            const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_180m`);
            if (!weatherResponse.ok) throw new Error();
            const data = await weatherResponse.json();

            if (data && data.hourly) {
                const times = data.hourly.time || [];
                const temps = data.hourly.temperature_2m || [];
                const humidity = data.hourly.relative_humidity_2m || [];
                const precip = data.hourly.precipitation || [];
                const wind = data.hourly.wind_speed_180m || [];

                const titleText = `${name}, ${country}`;
                
                const now = new Date();
                const currentIsoHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
                    .toISOString()
                    .slice(0, 13) + ":00";

                let foundData = false;

                for (let i = 0; i < times.length; i++) {
                    if (times[i] === currentIsoHour) {
                        const dateParts = times[i].split('T');
                        const dateStr = dateParts[0];
                        const timeStr = dateParts[1] || '00:00';

                        const t = temps[i] !== undefined ? temps[i].toString() : 'N/A';
                        const h = humidity[i] !== undefined ? humidity[i].toString() : 'N/A';
                        const p = precip[i] !== undefined ? precip[i].toString() : 'N/A';
                        const w = wind[i] !== undefined ? wind[i].toString() : 'N/A';

                        print("---------------------------------------");
                        print(`| title    | ${titleText.padEnd(24)} |`);
                        print(`| date/time| ${(dateStr + " " + timeStr).padEnd(24)} |`);
                        print(`| temp     | ${(t + " °C").padEnd(24)} |`);
                        print(`| humidity | ${(h + " %").padEnd(24)} |`);
                        print(`| percip   | ${(p + " mm").padEnd(24)} |`);
                        print(`| wind     | ${(w + " km/h").padEnd(24)} |`);
                        print("---------------------------------------");

                        weatherSessionLines.push(`title,${titleText}`);
                        weatherSessionLines.push(`date_time,${dateStr} ${timeStr}`);
                        weatherSessionLines.push(`temp,${t}`);
                        weatherSessionLines.push(`humidity,${h}`);
                        weatherSessionLines.push(`percip,${p}`);
                        weatherSessionLines.push(`wind,${w}`);
                        
                        foundData = true;
                        break;
                    }
                }

                if (!foundData) {
                    print("error: could not find meteorological tracking details for the current hour.");
                } else {
                    localStorage.setItem('weather', JSON.stringify(weatherSessionLines));
                }
            } else {
                print("error: malformed weather data structural payload.");
            }
        } catch (err) {
            print("error: failed to fetch meteorological data statistics.");
        }
    },
    onExit: () => {
        print("system: exited weather mode.");
    },
    getLines: () => {
        return weatherSessionLines.join('\n');
    }
};

registerTool('weather', weather);