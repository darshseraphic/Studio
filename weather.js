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
            // Get the user's exact system timezone (e.g., "Asia/Kolkata", "America/New_York")
            const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`);
            if (!geoResponse.ok) throw new Error();
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                print(`error: could not find location "${locationName}"`);
                return;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
            print(`system: fetching data for ${name}, ${country}...`);

            // Added &timezone=${userTimeZone} to ensure the hourly payload aligns with user's system clock
            const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_180m,weather_code,is_day&timezone=${encodeURIComponent(userTimeZone)}`);
            if (!weatherResponse.ok) throw new Error();
            const data = await weatherResponse.json();

            if (data && data.hourly) {
                const times = data.hourly.time || [];
                const temps = data.hourly.temperature_2m || [];
                const humidity = data.hourly.relative_humidity_2m || [];
                const precip = data.hourly.precipitation || [];
                const wind = data.hourly.wind_speed_180m || [];
                const weatherCodes = data.hourly.weather_code || [];
                const isDayValues = data.hourly.is_day || [];

                const titleText = `${name}, ${country}`;
                
                // Construct target string that perfectly matches the local API hour format (YYYY-MM-DDTHH:00)
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hour = String(now.getHours()).padStart(2, '0');
                const currentLocalHourStr = `${year}-${month}-${day}T${hour}:00`;

                let foundData = false;

                for (let i = 0; i < times.length; i++) {
                    if (times[i] === currentLocalHourStr) {
                        const dateParts = times[i].split('T');
                        const dateStr = dateParts[0];
                        const timeStr = dateParts[1] || '00:00';

                        const t = temps[i] !== undefined ? temps[i].toString() : 'N/A';
                        const h = humidity[i] !== undefined ? humidity[i].toString() : 'N/A';
                        const p = precip[i] !== undefined ? precip[i].toString() : 'N/A';
                        const w = wind[i] !== undefined ? wind[i].toString() : 'N/A';
                        
                        const code = weatherCodes[i] !== undefined ? weatherCodes[i] : 0;
                        const isDay = isDayValues[i] !== undefined ? isDayValues[i] : 1;

                        // 1. Clean, borderless text columns (using uniform spacing alignment)
                        const leftRows = [
                            `  Location  : ${titleText.slice(0, 22).padEnd(22)}`,
                            `  Date/Time : ${(dateStr + " " + timeStr).slice(0, 22).padEnd(22)}`,
                            `  Temperature: ${(t + " °C").slice(0, 22).padEnd(22)}`,
                            `  Humidity  : ${(h + " %").slice(0, 22).padEnd(22)}`,
                            `  Precip    : ${(p + " mm").slice(0, 22).padEnd(22)}`,
                            `  Wind Speed: ${(w + " km/h").slice(0, 22).padEnd(22)}`
                        ];

                        let rRows = [];

                        // 2. High-quality staggered ASCII art variants (Strictly 20 characters wide)
                        if (isDay === 0 && (code === 0 || code === 1)) {
                            // Night / Clear Sky
                            rRows = [
                                "                    ",
                                "       .--.          ",
                                "     (    )         ",
                                "       `--’          ",
                                "                    ",
                                "                    "
                            ];
                        } else if (code === 0) {
                            // Sunny / Clear Day
                            rRows = [
                                "       \\ | /         ",
                                "       .---.          ",
                                "  ── (    ) ──       ",
                                "       `---’          ",
                                "       / | \\         ",
                                "                    "
                            ];
                        } else if (code === 1 || code === 2 || code === 3) {
                            // Cloudy (Staggered Multi-Cloud)
                            rRows = [
                                "    .--.            ",
                                "  .(    ).   .--.    ",
                                " (_.__.__).(    ).  ",
                                "           (_.__.___) ",
                                "                    ",
                                "                    "
                            ];
                        } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) {
                            // Rainy (Raining from staggered clouds)
                            rRows = [
                                "    .--.            ",
                                "  .(    ).   .--.    ",
                                " (_.__.__).(    ).  ",
                                "   ' ' '  (_.__.___) ",
                                "    ' ' '  ' ' '    ",
                                "            ' ' '   "
                            ];
                        } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
                            // Snowy (Snowing from staggered clouds)
                            rRows = [
                                "    .--.            ",
                                "  .(    ).   .--.    ",
                                " (_.__.__).(    ).  ",
                                "   * *    (_.__.___)   ",
                                "  * * * * * * ",
                                "            * * "
                            ];
                        } else {
                            // Default Fallback / Partly Cloudy
                            rRows = [
                                "     \\  /           ",
                                "   _ /\"\".-.         ",
                                "     \\_(_   ).      ",
                                "     /(___.___)     ",
                                "                    ",
                                "                    "
                            ];
                        }

                        // 3. Print the data and visuals side-by-side with open breathing room
                        print(""); 
                        for (let j = 0; j < 6; j++) {
                            print(`${leftRows[j]}      ${rRows[j]}`);
                        }
                        print("");

                        // Save session analytics data
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
                    print("error: could not find meteorological tracking details for your current local hour.");
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

onExit: () => {
        // Clear the active session array so it doesn't get swept up by a later global save
        weatherSessionLines = []; 
        print("system: exited weather mode.");
    }