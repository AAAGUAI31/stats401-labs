// Lab 10 Assignment: extend the Lab 2 scatterplot with voice and hand gestures.

const DATA_URL = "../data/cities_multivariate.csv";
const DEVELOPMENT_LEVELS = ["Low", "Medium", "High"];
const REGIONS = ["North", "South", "East", "West"];

const state = {
    development: null,
    region: null
};

let allData = [];
let cityPoints = d3.select(null);
let regionLegendItems = d3.select(null);
let sizeLegendItems = d3.select(null);

const tooltip = d3.select("#tooltip");
const errorMessage = d3.select("#chart-error");

const colorScale = d3.scaleOrdinal()
    .domain(REGIONS)
    .range(["#3b82f6", "#ef4444", "#10b981", "#f59e0b"]);

const sizeScale = d3.scaleOrdinal()
    .domain(DEVELOPMENT_LEVELS)
    .range([7, 11, 15]);

// -----------------------------------------------------------------------------
// Shared interaction state
// Buttons, speech recognition, and gestures all call these same functions.
// -----------------------------------------------------------------------------

function matchesCurrentSelection(datum) {
    const developmentMatches =
        state.development === null || datum.development_level === state.development;
    const regionMatches = state.region === null || datum.region === state.region;
    return developmentMatches && regionMatches;
}

function applyPointStyles(duration = 260) {
    const hasSelection = state.development !== null || state.region !== null;
    const selection = duration > 0
        ? cityPoints.interrupt().transition().duration(duration)
        : cityPoints.interrupt();

    selection
        .attr("fill-opacity", d => {
            if (!hasSelection) return 0.78;
            return matchesCurrentSelection(d) ? 0.96 : 0.12;
        })
        .attr("stroke", d => {
            if (hasSelection && matchesCurrentSelection(d)) return "#0f172a";
            return "#ffffff";
        })
        .attr("stroke-width", d => {
            if (hasSelection && matchesCurrentSelection(d)) return 3;
            return 1.5;
        });
}

function updateLegendStyles() {
    regionLegendItems
        .classed("is-selected", d => state.region === d)
        .attr("aria-pressed", d => String(state.region === d))
        .attr("aria-label", d => state.region === d
            ? `Clear ${d} region selection`
            : `Select ${d} region`)
        .attr("opacity", d => state.region === null || state.region === d ? 1 : 0.28);

    sizeLegendItems
        .classed("is-selected", d => state.development === d)
        .attr("aria-pressed", d => String(state.development === d))
        .attr("aria-label", d => state.development === d
            ? `Clear ${d} development selection`
            : `Select ${d} development`)
        .attr("opacity", d => state.development === null || state.development === d ? 1 : 0.28);
}

function updateHighlight() {
    const matches = allData.filter(matchesCurrentSelection);
    const hasSelection = state.development !== null || state.region !== null;

    applyPointStyles();
    updateLegendStyles();

    d3.select("#development-status").text(state.development || "All");
    d3.select("#region-status").text(state.region || "All");
    d3.select("#match-count").text(`${matches.length} of ${allData.length}`);

    const selectionMessage = d3.select("#selection-message");
    selectionMessage.classed("is-empty", hasSelection && matches.length === 0);

    if (!hasSelection) {
        selectionMessage.text("All cities are visible.");
    } else if (matches.length === 0) {
        selectionMessage.text(
            `No cities match Development: ${state.development || "All"} and Region: ${state.region || "All"}.`
        );
    } else {
        const noun = matches.length === 1 ? "city matches" : "cities match";
        selectionMessage.text(
            `${matches.length} ${noun} Development: ${state.development || "All"} and Region: ${state.region || "All"}.`
        );
    }

}

function setDevelopment(level, source = "Button") {
    if (level !== null && !DEVELOPMENT_LEVELS.includes(level)) return false;
    state.development = level;
    updateHighlight(`${source}: development set to ${level || "All"}`);
    return true;
}

function toggleDevelopment(level, source = "Development legend") {
    // Clicking the active legend item again clears only this filter.
    return setDevelopment(state.development === level ? null : level, source);
}

function stepDevelopment(direction, source = "Gesture") {
    const movingLarger = direction > 0;
    let nextIndex;

    if (state.development === null) {
        // From All, start at the nearest boundary in the requested direction.
        nextIndex = movingLarger ? 0 : DEVELOPMENT_LEVELS.length - 1;
    } else {
        const currentIndex = DEVELOPMENT_LEVELS.indexOf(state.development);
        nextIndex = Math.max(
            0,
            Math.min(DEVELOPMENT_LEVELS.length - 1, currentIndex + (movingLarger ? 1 : -1))
        );

        if (nextIndex === currentIndex) {
            const boundary = movingLarger ? "largest" : "smallest";
            const message = `${source}: ${state.development} is already the ${boundary} development level`;
            updateHighlight(message);
            return message;
        }
    }

    state.development = DEVELOPMENT_LEVELS[nextIndex];
    const message = `${source}: selected ${state.development} development`;
    updateHighlight(message);
    return message;
}

function setRegion(region, source = "Button") {
    if (region !== null && !REGIONS.includes(region)) return false;
    state.region = region;
    updateHighlight(`${source}: region set to ${region || "All"}`);
    return true;
}

function toggleRegion(region, source = "Region legend") {
    // Clicking the active legend item again clears only this filter.
    return setRegion(state.region === region ? null : region, source);
}

function resetInteraction(source = "Button") {
    state.development = null;
    state.region = null;
    updateHighlight(`${source}: all selections reset`);
}

// -----------------------------------------------------------------------------
// Reused Lab 2 D3 scatterplot
// -----------------------------------------------------------------------------

function showTooltip(event, datum) {
    tooltip
        .style("opacity", 1)
        .html(`<strong>${datum.city}</strong><br>
            Population: ${datum.population} million<br>
            Temperature: ${datum.temp_c} °C<br>
            Development: ${datum.development_level}<br>
            Region: ${datum.region}`);

    if (event?.pageX !== undefined) {
        tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
    }
}

function hideTooltip() {
    tooltip.style("opacity", 0);
    applyPointStyles(160);
}

function drawChart(data) {
    const width = 900;
    const height = 560;
    const margin = { top: 40, right: 230, bottom: 75, left: 80 };

    d3.select("#chart-loading").remove();

    const svg = d3.select("#chart")
        .append("svg")
        .attr("class", "chart-svg lab10-chart")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr(
            "aria-label",
            "Scatterplot of city population and temperature, colored by region and sized by development level"
        );

    const xScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.population)])
        .nice()
        .range([margin.left, width - margin.right]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.temp_c))
        .nice()
        .range([height - margin.bottom, margin.top]);

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(
            d3.axisBottom(xScale)
                .tickSize(-(height - margin.top - margin.bottom))
                .tickFormat("")
        );

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(
            d3.axisLeft(yScale)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat("")
        );

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).ticks(7));

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale));

    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 22)
        .attr("text-anchor", "middle")
        .text("Population (millions)");

    svg.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height - margin.bottom) / 2)
        .attr("y", 24)
        .attr("text-anchor", "middle")
        .text("Average Temperature (°C)");

    cityPoints = svg.selectAll(".city-point")
        .data(data)
        .join("circle")
        .attr("class", "city-point")
        .attr("cx", d => xScale(d.population))
        .attr("cy", d => yScale(d.temp_c))
        .attr("r", d => sizeScale(d.development_level))
        .attr("fill", d => colorScale(d.region))
        .attr("fill-opacity", 0.78)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1.5)
        .attr("tabindex", 0)
        .attr(
            "aria-label",
            d => `${d.city}: ${d.population} million people, ${d.temp_c} degrees Celsius, ${d.development_level} development, ${d.region} region`
        )
        .on("mouseenter focus", function (event, d) {
            d3.select(this)
                .interrupt()
                .attr("fill-opacity", 1)
                .attr("stroke", "#111827")
                .attr("stroke-width", 3);
            showTooltip(event, d);
        })
        .on("mousemove", event => {
            tooltip
                .style("left", `${event.pageX + 12}px`)
                .style("top", `${event.pageY + 12}px`);
        })
        .on("mouseleave blur", hideTooltip);

    const regionLegend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width - margin.right + 45}, 60)`);

    regionLegend.append("text")
        .attr("class", "legend-title")
        .text("Region (color)");

    regionLegendItems = regionLegend.selectAll(".region-item")
        .data(REGIONS)
        .join("g")
        .attr("class", "legend-item region-item")
        .attr("role", "button")
        .attr("tabindex", 0)
        .attr("aria-label", d => `Select ${d} region`)
        .attr("transform", (_, i) => `translate(0, ${30 + i * 30})`)
        .on("click", (_, region) => toggleRegion(region))
        .on("keydown", (event, region) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleRegion(region);
            }
        });

    regionLegendItems.append("circle")
        .attr("r", 7)
        .attr("fill", d => colorScale(d));

    regionLegendItems.append("text")
        .attr("x", 15)
        .attr("y", 4)
        .text(d => d);

    const sizeLegend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width - margin.right + 45}, 245)`);

    sizeLegend.append("text")
        .attr("class", "legend-title")
        .text("Development (size)");

    sizeLegendItems = sizeLegend.selectAll(".size-item")
        .data(DEVELOPMENT_LEVELS)
        .join("g")
        .attr("class", "legend-item size-item")
        .attr("role", "button")
        .attr("tabindex", 0)
        .attr("aria-label", d => `Select ${d} development`)
        .attr("transform", (_, i) => `translate(15, ${40 + i * 48})`)
        .on("click", (_, level) => toggleDevelopment(level))
        .on("keydown", (event, level) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleDevelopment(level);
            }
        });

    sizeLegendItems.append("circle")
        .attr("r", d => sizeScale(d))
        .attr("fill", "#94a3b8")
        .attr("fill-opacity", 0.75);

    sizeLegendItems.append("text")
        .attr("x", 25)
        .attr("y", 4)
        .text(d => d);

    updateHighlight();
}

d3.csv(DATA_URL, d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
}))
    .then(data => {
        allData = data;
        drawChart(data);
    })
    .catch(error => {
        console.error("Unable to load cities_multivariate.csv:", error);
        d3.select("#chart-loading").remove();
        errorMessage
            .text("The city data could not be loaded. Open this page through localhost or GitHub Pages.")
            .attr("hidden", null);
    });

document.getElementById("reset-button")
    .addEventListener("click", () => resetInteraction("Button"));

// -----------------------------------------------------------------------------
// Voice interaction: map spoken region names to the shared state functions.
// -----------------------------------------------------------------------------

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceStartButton = document.getElementById("voice-start-button");
const voiceStopButton = document.getElementById("voice-stop-button");
let recognition = null;

function setVoiceFeedback({ status, heard, action }) {
    if (status !== undefined) d3.select("#voice-status").text(status);
    if (heard !== undefined) d3.select("#voice-heard").text(heard);
    if (action !== undefined) d3.select("#voice-action").text(action);
}

function handleVoiceCommand(rawCommand) {
    const command = rawCommand.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

    if (command.includes("reset")) {
        resetInteraction("Voice");
        setVoiceFeedback({ action: "All selections reset" });
        return true;
    }

    if (/\bshow\s+all\s+regions?\b/.test(command)) {
        setRegion(null, "Voice");
        setVoiceFeedback({ action: "Showing all regions" });
        return true;
    }

    const match = command.match(/\b(?:show|highlight)\s+(north|south|east|west)\b/);
    if (match) {
        const region = match[1][0].toUpperCase() + match[1].slice(1);
        setRegion(region, "Voice");
        setVoiceFeedback({ action: `Highlighting ${region}` });
        return true;
    }

    setVoiceFeedback({
        action: "Command not recognized. Try “Show North,” “Show all regions,” or “Reset.”"
    });
    return false;
}

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    d3.select("#voice-support").text("Web Speech API available");

    recognition.onstart = () => {
        voiceStartButton.disabled = true;
        setVoiceFeedback({ status: "Listening…", heard: "—", action: "Waiting for a command" });
    };

    recognition.onresult = event => {
        const transcript = event.results[0][0].transcript.trim();
        setVoiceFeedback({ status: "Command received", heard: `“${transcript}”` });
        handleVoiceCommand(transcript);
    };

    recognition.onerror = event => {
        setVoiceFeedback({
            status: "Recognition failed",
            action: `${event.error}. Use the chart legend as a fallback.`
        });
    };

    recognition.onend = () => {
        voiceStartButton.disabled = false;
        if (document.getElementById("voice-status").textContent === "Listening…") {
            setVoiceFeedback({ status: "No command detected" });
        }
    };
} else {
    voiceStartButton.disabled = true;
    d3.select("#voice-support").text("Not supported; use the chart legend");
}

voiceStartButton.addEventListener("click", () => {
    if (!recognition) return;

    try {
        recognition.start();
    } catch (error) {
        setVoiceFeedback({ status: "Could not start", action: error.message });
    }
});

voiceStopButton.addEventListener("click", () => {
    if (recognition) recognition.stop();
    setVoiceFeedback({ status: "Stopped" });
});

// -----------------------------------------------------------------------------
// MediaPipe hand gestures: Thumb Down selects a larger development level;
// Thumb Up selects a smaller development level.
// -----------------------------------------------------------------------------

const MEDIAPIPE_VERSION = "0.10.3";
const MEDIAPIPE_MODULE_URL =
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const MEDIAPIPE_WASM_URL =
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const GESTURE_MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

const video = document.getElementById("camera");
const overlay = document.getElementById("camera-overlay");
const overlayContext = overlay.getContext("2d");
const cameraStartButton = document.getElementById("camera-start-button");
const cameraStopButton = document.getElementById("camera-stop-button");

let mediaPipeModulePromise = null;
let gestureRecognizer = null;
let cameraStream = null;
let gestureAnimationFrame = null;
let lastVideoTime = -1;
let lastInferenceTime = 0;
let lastObservedGesture = null;
let lastGestureTriggerTime = 0;

const GESTURE_SCORE_THRESHOLD = 0.65;
const GESTURE_COOLDOWN = 1000;

const handConnections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

function setGestureFeedback({ camera, model, detected, action }) {
    if (camera !== undefined) d3.select("#camera-status").text(camera);
    if (model !== undefined) d3.select("#model-status").text(model);
    if (detected !== undefined) d3.select("#gesture-detected").text(detected);
    if (action !== undefined) d3.select("#gesture-action").text(action);
}

function loadMediaPipeModule() {
    if (!mediaPipeModulePromise) {
        mediaPipeModulePromise = import(MEDIAPIPE_MODULE_URL).catch(error => {
            mediaPipeModulePromise = null;
            throw error;
        });
    }
    return mediaPipeModulePromise;
}

async function createGestureRecognizer() {
    if (gestureRecognizer) return gestureRecognizer;

    setGestureFeedback({ model: "Loading MediaPipe model…" });
    const { FilesetResolver, GestureRecognizer } = await loadMediaPipeModule();
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

    const commonOptions = {
        baseOptions: { modelAssetPath: GESTURE_MODEL_URL },
        runningMode: "VIDEO",
        numHands: 1
    };

    try {
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
            ...commonOptions,
            baseOptions: {
                ...commonOptions.baseOptions,
                delegate: "GPU"
            }
        });
        setGestureFeedback({ model: "Ready (GPU)" });
    } catch (gpuError) {
        console.warn("GPU delegate unavailable; using CPU:", gpuError);
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, commonOptions);
        setGestureFeedback({ model: "Ready (CPU fallback)" });
    }

    return gestureRecognizer;
}

function drawHandLandmarks(landmarks) {
    overlayContext.clearRect(0, 0, overlay.width, overlay.height);
    if (!landmarks) return;

    overlayContext.strokeStyle = "#5eead4";
    overlayContext.fillStyle = "#fbbf24";
    overlayContext.lineWidth = 3;

    handConnections.forEach(([startIndex, endIndex]) => {
        const start = landmarks[startIndex];
        const end = landmarks[endIndex];
        overlayContext.beginPath();
        overlayContext.moveTo(start.x * overlay.width, start.y * overlay.height);
        overlayContext.lineTo(end.x * overlay.width, end.y * overlay.height);
        overlayContext.stroke();
    });

    landmarks.forEach(point => {
        overlayContext.beginPath();
        overlayContext.arc(
            point.x * overlay.width,
            point.y * overlay.height,
            4,
            0,
            Math.PI * 2
        );
        overlayContext.fill();
    });
}

function handleGesture(label) {
    let message;

    if (label === "Thumb_Down") {
        message = stepDevelopment(1, "Thumb Down");
    } else if (label === "Thumb_Up") {
        message = stepDevelopment(-1, "Thumb Up");
    } else {
        return false;
    }

    setGestureFeedback({ action: message });
    return true;
}

function triggerGesture(label) {
    const now = Date.now();
    const elapsed = now - lastGestureTriggerTime;

    if (elapsed < GESTURE_COOLDOWN) {
        setGestureFeedback({ action: `Cooldown: wait ${GESTURE_COOLDOWN - elapsed} ms` });
        return false;
    }

    lastGestureTriggerTime = now;
    return handleGesture(label);
}

function processGestureResult(result) {
    const landmarks = result.landmarks?.[0];
    drawHandLandmarks(landmarks);

    if (!landmarks) {
        lastObservedGesture = null;
        setGestureFeedback({ detected: "No hand detected" });
        return;
    }

    const topGesture = result.gestures?.[0]?.[0];
    const label = topGesture?.categoryName || "None";
    const score = topGesture?.score || 0;
    const recognizedThumb = label === "Thumb_Down" || label === "Thumb_Up";

    setGestureFeedback({ detected: `${label} · ${Math.round(score * 100)}%` });

    if (!recognizedThumb || score < GESTURE_SCORE_THRESHOLD) {
        // A neutral/other pose rearms the same gesture for the next deliberate command.
        lastObservedGesture = null;
        return;
    }

    if (label !== lastObservedGesture) {
        lastObservedGesture = label;
        triggerGesture(label);
    }
}

function predictGestures(timestamp) {
    if (!cameraStream || !gestureRecognizer) return;

    if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTime &&
        timestamp - lastInferenceTime >= 80
    ) {
        lastVideoTime = video.currentTime;
        lastInferenceTime = timestamp;

        try {
            const result = gestureRecognizer.recognizeForVideo(video, timestamp);
            processGestureResult(result);
        } catch (error) {
            console.error("Gesture recognition failed:", error);
            setGestureFeedback({ action: `Recognition error: ${error.message}` });
        }
    }

    gestureAnimationFrame = requestAnimationFrame(predictGestures);
}

async function startCamera() {
    if (cameraStream) return;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setGestureFeedback({
            camera: "Unavailable",
            action: "Use localhost or HTTPS, or use the chart legend."
        });
        return;
    }

    cameraStartButton.disabled = true;
    setGestureFeedback({ camera: "Requesting permission…", action: "Waiting for camera access" });

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });

        video.srcObject = cameraStream;
        await video.play();
        document.getElementById("camera-placeholder").style.display = "none";
        setGestureFeedback({ camera: "Running", detected: "Waiting for a hand…" });

        await createGestureRecognizer();
        lastVideoTime = -1;
        lastInferenceTime = 0;
        gestureAnimationFrame = requestAnimationFrame(predictGestures);
    } catch (error) {
        stopCamera();
        setGestureFeedback({
            camera: "Could not start",
            action: `${error.message}. Use the chart legend.`
        });
    } finally {
        cameraStartButton.disabled = false;
    }
}

function stopCamera() {
    if (gestureAnimationFrame) cancelAnimationFrame(gestureAnimationFrame);
    gestureAnimationFrame = null;

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }

    cameraStream = null;
    video.srcObject = null;
    lastObservedGesture = null;
    overlayContext.clearRect(0, 0, overlay.width, overlay.height);
    document.getElementById("camera-placeholder").style.display = "grid";
    setGestureFeedback({ camera: "Stopped", detected: "—" });
}

cameraStartButton.addEventListener("click", startCamera);
cameraStopButton.addEventListener("click", stopCamera);

window.addEventListener("beforeunload", () => {
    if (recognition) recognition.abort();
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    if (gestureRecognizer) gestureRecognizer.close();
});
