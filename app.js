/**
 * AgriSmoke AI - Main Application Controller
 * 
 * Orchestrates UI tabs, interactive prediction calculator, map engine,
 * SVG charts, alerts system, scenario presets, and data export.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Engines
    const model = new AgriSmokePredictionModel();
    const charts = new AgriSmokeChartsEngine();
    let map = null;

    // Current State
    let currentInputs = {
        fireCount: 1684,
        windSpeed: 11.5,
        windDirectionDeg: 305,
        pblHeight: 480,
        burnAreaHectares: 75000,
        urbanBaselineAqi: 180,
        bioDecomposerAdoption: 25,
        happySeederAdoption: 30
    };

    let activeAlertThreshold = {
        aqi: 400,
        fires: 2000
    };

    let liveSimulationInterval = null;

    // 2. Setup Navigation Tabs
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    function switchTab(tabId) {
        navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
        tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `tab-${tabId}`);
        });

        // If map tab is selected, trigger resize to ensure proper canvas scale
        if (tabId === 'map' && map) {
            setTimeout(() => map.resize(), 50);
        }

        // Render charts if tab contains them
        if (tabId === 'dashboard' || tabId === 'calculator') {
            updateVisualizations();
        }
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // 3. Initialize Map Engine
    try {
        map = new AgriSmokeMapEngine('geospatial-canvas', 'map-container');
        map.updateWind(currentInputs.windSpeed, currentInputs.windDirectionDeg);
    } catch (err) {
        console.error("Map initialization error:", err);
    }

    // Handle Map item clicks
    window.addEventListener('map-item-selected', (e) => {
        const item = e.detail;
        showDetailModal(item);
    });

    // 4. Bind Calculator Sliders & Controls
    const sliderFireCount = document.getElementById('input-fire-count');
    const valFireCount = document.getElementById('val-fire-count');

    const sliderWindSpeed = document.getElementById('input-wind-speed');
    const valWindSpeed = document.getElementById('val-wind-speed');

    const sliderWindDir = document.getElementById('input-wind-dir');
    const valWindDir = document.getElementById('val-wind-dir');
    const compassWindLabel = document.getElementById('compass-wind-label');

    const sliderPbl = document.getElementById('input-pbl-height');
    const valPbl = document.getElementById('val-pbl-height');

    const sliderUrbanBase = document.getElementById('input-urban-base');
    const valUrbanBase = document.getElementById('val-urban-base');

    const sliderBioDec = document.getElementById('input-bio-decomposer');
    const valBioDec = document.getElementById('val-bio-decomposer');

    const sliderHappySeed = document.getElementById('input-happy-seeder');
    const valHappySeed = document.getElementById('val-happy-seeder');

    function syncInputsFromUI() {
        if (sliderFireCount) currentInputs.fireCount = parseInt(sliderFireCount.value, 10);
        if (sliderWindSpeed) currentInputs.windSpeed = parseFloat(sliderWindSpeed.value);
        if (sliderWindDir) currentInputs.windDirectionDeg = parseInt(sliderWindDir.value, 10);
        if (sliderPbl) currentInputs.pblHeight = parseInt(sliderPbl.value, 10);
        if (sliderUrbanBase) currentInputs.urbanBaselineAqi = parseInt(sliderUrbanBase.value, 10);
        if (sliderBioDec) currentInputs.bioDecomposerAdoption = parseInt(sliderBioDec.value, 10);
        if (sliderHappySeed) currentInputs.happySeederAdoption = parseInt(sliderHappySeed.value, 10);

        // Update labels
        if (valFireCount) valFireCount.textContent = currentInputs.fireCount.toLocaleString();
        if (valWindSpeed) valWindSpeed.textContent = `${currentInputs.windSpeed.toFixed(1)} km/h`;
        if (valWindDir) {
            const dirLabel = getCompassDirection(currentInputs.windDirectionDeg);
            valWindDir.textContent = `${currentInputs.windDirectionDeg}° (${dirLabel})`;
            if (compassWindLabel) compassWindLabel.textContent = dirLabel;
        }
        if (valPbl) valPbl.textContent = `${currentInputs.pblHeight} m`;
        if (valUrbanBase) valUrbanBase.textContent = `${currentInputs.urbanBaselineAqi} AQI`;
        if (valBioDec) valBioDec.textContent = `${currentInputs.bioDecomposerAdoption}%`;
        if (valHappySeed) valHappySeed.textContent = `${currentInputs.happySeederAdoption}%`;

        // Update map particle wind angle & speed
        if (map) {
            map.updateWind(currentInputs.windSpeed, currentInputs.windDirectionDeg);
        }

        runModelAndUpdateUI();
    }

    function setInputsToUI(params) {
        if (sliderFireCount) sliderFireCount.value = params.fireCount;
        if (sliderWindSpeed) sliderWindSpeed.value = params.windSpeed;
        if (sliderWindDir) sliderWindDir.value = params.windDirectionDeg;
        if (sliderPbl) sliderPbl.value = params.pblHeight;
        if (sliderUrbanBase) sliderUrbanBase.value = params.urbanBaselineAqi;
        if (sliderBioDec) sliderBioDec.value = params.bioDecomposerAdoption;
        if (sliderHappySeed) sliderHappySeed.value = params.happySeederAdoption;

        syncInputsFromUI();
    }

    [sliderFireCount, sliderWindSpeed, sliderWindDir, sliderPbl, sliderUrbanBase, sliderBioDec, sliderHappySeed].forEach(el => {
        el?.addEventListener('input', syncInputsFromUI);
    });

    // 5. Compass direction helper
    function getCompassDirection(deg) {
        const directions = [
            "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
        ];
        const idx = Math.round(deg / 22.5) % 16;
        return directions[idx];
    }

    // 6. Prediction Model Execution & UI Updates
    function runModelAndUpdateUI() {
        const pred = model.predict(currentInputs);
        const hourly = model.generateHourlyForecast(currentInputs);

        // Update Key KPI Badges & Elements
        const elAqi = document.getElementById('kpi-aqi-value');
        const elCategory = document.getElementById('kpi-aqi-category');
        const elDominant = document.getElementById('kpi-dominant-pollutant');
        const elPm25 = document.getElementById('kpi-pm25-val');
        const elPm10 = document.getElementById('kpi-pm10-val');
        const elParaliPct = document.getElementById('kpi-parali-pct');
        const elFires = document.getElementById('kpi-active-fires');
        const elGrapBadge = document.getElementById('kpi-grap-badge');
        const elAirshedScore = document.getElementById('kpi-airshed-score');
        const elTransportLag = document.getElementById('kpi-transport-lag');

        if (elAqi) {
            elAqi.textContent = pred.predictedAqi;
            elAqi.style.color = pred.categoryColor;
        }
        if (elCategory) {
            elCategory.textContent = pred.category;
            elCategory.style.backgroundColor = pred.categoryColor + '33';
            elCategory.style.color = pred.categoryColor;
            elCategory.style.borderColor = pred.categoryColor;
        }
        if (elPm25) elPm25.textContent = `${pred.totalPm25} µg/m³`;
        if (elPm10) elPm10.textContent = `${pred.totalPm10} µg/m³`;
        if (elParaliPct) elParaliPct.textContent = `${pred.paraliPct}%`;
        if (elFires) elFires.textContent = currentInputs.fireCount.toLocaleString();
        if (elAirshedScore) elAirshedScore.textContent = `${pred.airshedScore}/100`;
        if (elTransportLag) elTransportLag.textContent = `~${pred.transportHours} hrs`;

        if (elGrapBadge) {
            elGrapBadge.textContent = pred.grapStage === "None" ? "Normal Baseline" : `GRAP ${pred.grapStage}`;
            elGrapBadge.className = `badge grap-badge ${pred.grapStage.toLowerCase().replace(' ', '-')}`;
        }

        // Update Calculator Results Card
        const calcAqi = document.getElementById('calc-res-aqi');
        const calcPm25 = document.getElementById('calc-res-pm25');
        const calcStubblePm25 = document.getElementById('calc-res-stubble-pm25');
        const calcParaliPct = document.getElementById('calc-res-parali-pct');
        const calcCategory = document.getElementById('calc-res-category');
        const calcDirFactor = document.getElementById('calc-res-dir-factor');
        const calcInversionFactor = document.getElementById('calc-res-inversion');
        const calcMitigationDrop = document.getElementById('calc-res-mitigation-drop');

        if (calcAqi) {
            calcAqi.textContent = pred.predictedAqi;
            calcAqi.style.color = pred.categoryColor;
        }
        if (calcPm25) calcPm25.textContent = `${pred.totalPm25} µg/m³`;
        if (calcStubblePm25) calcStubblePm25.textContent = `+${pred.stubblePm25} µg/m³`;
        if (calcParaliPct) calcParaliPct.textContent = `${pred.paraliPct}%`;
        if (calcCategory) {
            calcCategory.textContent = `${pred.category} (${pred.grapStage})`;
            calcCategory.style.color = pred.categoryColor;
        }
        if (calcDirFactor) calcDirFactor.textContent = `${pred.dirFactor}%`;
        if (calcInversionFactor) calcInversionFactor.textContent = `${pred.pblTrappingFactor}x`;
        if (calcMitigationDrop) {
            calcMitigationDrop.textContent = `-${pred.mitigationSavings.aqiDrop} AQI points`;
        }

        // Update Health Advisory Text
        updateHealthAdvisory(pred);

        // Check if custom alerts trigger
        checkAlertTriggers(pred.predictedAqi, currentInputs.fireCount);

        // Update Charts
        charts.renderDiurnalChart('chart-diurnal-forecast', hourly);
        charts.renderAqiSpeedometer('gauge-aqi-speedometer', pred.predictedAqi);

        // Source apportionment donut update
        const dynamicSources = [
            { source: "Agricultural Stubble Smoke", percentage: Math.max(5, Math.min(80, Math.round(pred.paraliPct))), color: "#ff5722", description: "Direct parali smoke transported via NW winds" },
            { source: "Vehicular Emissions", percentage: Math.max(10, Math.round((100 - pred.paraliPct) * 0.42)), color: "#00b0ff", description: "Urban tailpipe emissions" },
            { source: "Secondary Aerosols", percentage: Math.max(8, Math.round((100 - pred.paraliPct) * 0.28)), color: "#e040fb", description: "Atmospheric chemical transformations" },
            { source: "Road Dust & Construction", percentage: Math.max(5, Math.round((100 - pred.paraliPct) * 0.18)), color: "#ffab00", description: "Suspended road and construction dust" },
            { source: "Industrial & Power Plants", percentage: Math.max(5, Math.round((100 - pred.paraliPct) * 0.12)), color: "#00e676", description: "Surrounding industrial units & brick kilns" }
        ];
        charts.renderSourceDonut('chart-source-donut', dynamicSources);
    }

    function updateHealthAdvisory(pred) {
        const generalText = document.getElementById('advisory-general');
        const sensitiveText = document.getElementById('advisory-sensitive');
        const outdoorText = document.getElementById('advisory-outdoor');

        const cat = DEMO_DATA.aqiCategories.find(c => pred.predictedAqi >= c.min && pred.predictedAqi <= c.max) || DEMO_DATA.aqiCategories[DEMO_DATA.aqiCategories.length - 1];

        if (generalText) generalText.textContent = cat.advisory;
        if (sensitiveText) {
            if (pred.predictedAqi > 400) {
                sensitiveText.textContent = "High respiratory risk. Avoid going outdoors completely. Operate HEPA air purifiers in sealed indoor rooms.";
            } else if (pred.predictedAqi > 300) {
                sensitiveText.textContent = "Asthma and cardiac patients should keep rescue inhalers accessible; strictly avoid morning and evening walks.";
            } else {
                sensitiveText.textContent = "Sensitive individuals should wear protective N95 masks during heavy outdoor traffic hours.";
            }
        }
        if (outdoorText) {
            if (pred.predictedAqi > 400) {
                outdoorText.textContent = "Mandatory N95 respirator masks required for traffic police, construction workers, and delivery personnel.";
            } else {
                outdoorText.textContent = "Avoid high-intensity outdoor cardio/running between 18:00 and 09:00 IST.";
            }
        }
    }

    function updateVisualizations() {
        charts.renderWeeklyTrendChart('chart-weekly-trend', DEMO_DATA.weeklyTrend);
        charts.renderDistrictBars('chart-district-bars', DEMO_DATA.districtFireCounts);
    }

    // 7. Scenario Presets Handler
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetKey = btn.getAttribute('data-preset');
            const preset = DEMO_DATA.presets[presetKey];
            if (preset) {
                setInputsToUI(preset);
                showNotification(`Applied Preset: ${preset.name}`, "info");
            }
        });
    });

    // 8. Alerts & Threshold Trigger Engine
    function checkAlertTriggers(aqi, fires) {
        const banner = document.getElementById('active-alert-banner');
        if (!banner) return;

        if (aqi >= activeAlertThreshold.aqi || fires >= activeAlertThreshold.fires) {
            banner.classList.add('visible');
            document.getElementById('banner-alert-msg').textContent = 
                `CRITICAL THRESHOLD TRIGGERED: Current predicted AQI (${aqi}) or Active Fires (${fires}) exceeds your safety threshold (AQI > ${activeAlertThreshold.aqi} / Fires > ${activeAlertThreshold.fires}).`;
        } else {
            banner.classList.remove('visible');
        }
    }

    // Custom Threshold Inputs
    const inputThreshAqi = document.getElementById('thresh-aqi-input');
    const inputThreshFires = document.getElementById('thresh-fires-input');
    const btnSaveThresh = document.getElementById('btn-save-threshold');

    btnSaveThresh?.addEventListener('click', () => {
        activeAlertThreshold.aqi = parseInt(inputThreshAqi.value, 10) || 400;
        activeAlertThreshold.fires = parseInt(inputThreshFires.value, 10) || 2000;
        showNotification(`Alert thresholds updated: AQI > ${activeAlertThreshold.aqi}, Fires > ${activeAlertThreshold.fires}`, "success");
        runModelAndUpdateUI();
    });

    // Test Alert Audio Chime Demo (Uses browser Web Audio API, zero dependencies!)
    const handleSoundClick = () => {
        playAlertAudioChime();
        showNotification("Emergency Alert Tone Triggered (Web Audio API Synthesizer)", "warning");
    };
    document.getElementById('btn-test-alert-sound')?.addEventListener('click', handleSoundClick);
    document.getElementById('btn-test-alert-sound-tab')?.addEventListener('click', handleSoundClick);

    function playAlertAudioChime() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.15); // A5
            osc.frequency.setValueAtTime(587.33, ctx.currentTime + 0.30);
            osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.45);

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.75);
        } catch (e) {
            console.log("AudioContext blocked or unavailable:", e);
        }
    }

    // 9. Item Detail Modal (Stations & Hotspots)
    const modal = document.getElementById('detail-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalClose = document.getElementById('modal-close');

    function showDetailModal(item) {
        if (!modal) return;
        if (item.type === 'station') {
            const st = item.data;
            modalTitle.textContent = `Monitoring Station: ${st.name}`;
            modalContent.innerHTML = `
                <div class="modal-grid">
                    <div class="modal-kpi">
                        <div class="kpi-label">AQI</div>
                        <div class="kpi-num" style="color:${map.getAqiColor(st.aqi)}">${st.aqi}</div>
                        <div class="kpi-sub">${st.category}</div>
                    </div>
                    <div class="modal-kpi">
                        <div class="kpi-label">PM2.5 (24h)</div>
                        <div class="kpi-num">${st.pm25} <span style="font-size:12px">µg/m³</span></div>
                        <div class="kpi-sub">Dominant Pollutant</div>
                    </div>
                    <div class="modal-kpi">
                        <div class="kpi-label">Parali Smoke %</div>
                        <div class="kpi-num" style="color:#ff7043">${st.paraliPct}%</div>
                        <div class="kpi-sub">Upwind Contribution</div>
                    </div>
                </div>
                <div style="margin-top:16px;font-size:13px;line-height:1.6;color:#cbd5e1;">
                    <p><strong>Geographic Coordinates:</strong> ${st.lat.toFixed(4)}°N, ${st.lng.toFixed(4)}°E</p>
                    <p><strong>Station Classification:</strong> ${st.type}</p>
                    <p><strong>Airshed Inflow Exposure:</strong> Direct path for smoke plumes entering through the North-West corridor during north-westerly wind regimes.</p>
                </div>
            `;
        } else if (item.type === 'fire') {
            const f = item.data;
            modalTitle.textContent = `Fire Anomaly Cluster: ${f.district}, ${f.state}`;
            modalContent.innerHTML = `
                <div class="modal-grid">
                    <div class="modal-kpi">
                        <div class="kpi-label">Active Thermal Fires</div>
                        <div class="kpi-num" style="color:#ff5722">${f.fireCount}</div>
                        <div class="kpi-sub">${f.status}</div>
                    </div>
                    <div class="modal-kpi">
                        <div class="kpi-label">Avg Fire Radiative Power</div>
                        <div class="kpi-num">${f.avgFRP} <span style="font-size:12px">MW</span></div>
                        <div class="kpi-sub">Thermal Intensity</div>
                    </div>
                    <div class="modal-kpi">
                        <div class="kpi-label">Harvest Status</div>
                        <div class="kpi-num" style="font-size:18px">${f.harvestProgress}</div>
                        <div class="kpi-sub">${f.confidence}</div>
                    </div>
                </div>
                <div style="margin-top:16px;font-size:13px;line-height:1.6;color:#cbd5e1;">
                    <p><strong>Hotspot Center:</strong> ${f.lat.toFixed(4)}°N, ${f.lng.toFixed(4)}°E</p>
                    <p><strong>Smoke Emission Potential:</strong> Estimated ${(f.fireCount * 45).toLocaleString()} hectares of paddy residue under immediate post-harvest clearing.</p>
                    <p><strong>Downwind Trajectory:</strong> Plume dispersion vector points toward Delhi NCR with estimated transport travel time of 16-24 hours at prevailing wind speeds.</p>
                </div>
            `;
        }
        modal.classList.add('visible');
    }

    modalClose?.addEventListener('click', () => {
        modal.classList.remove('visible');
    });

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('visible');
    });

    // 10. Data Export (CSV Download via Blob)
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
        exportDiagnosticCSV();
    });

    function exportDiagnosticCSV() {
        const pred = model.predict(currentInputs);
        const hourly = model.generateHourlyForecast(currentInputs);

        let csv = "Time,Predicted_AQI,PM25_ug_m3,Stubble_Smoke_Contribution_Pct,PBL_Height_m,Wind_Speed_kmh,Category\n";
        hourly.forEach(row => {
            csv += `"${row.time}",${row.aqi},${row.pm25},${row.stubblePct},${row.pbl},${row.windSpeed},"${row.category}"\n`;
        });

        csv += "\n# System Metadata\n";
        csv += `"Generated At","${new Date().toISOString()}"\n`;
        csv += `"Active Stubble Fires",${currentInputs.fireCount}\n`;
        csv += `"Wind Direction","${currentInputs.windDirectionDeg} deg (${getCompassDirection(currentInputs.windDirectionDeg)})"\n`;
        csv += `"Summary Predicted 24h AQI",${pred.predictedAqi}\n`;
        csv += `"GRAP Stage","${pred.grapStage}"\n`;
        csv += `"Data Label","Demonstration & Physical-Empirical AI Simulation"\n`;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `AgriSmoke_AI_Air_Quality_Report_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showNotification("Diagnostic CSV Report successfully generated and downloaded.", "success");
    }

    // 11. Print Briefing View
    document.getElementById('btn-print-report')?.addEventListener('click', () => {
        window.print();
    });

    // 12. Toast Notification Helper
    function showNotification(msg, type = "info") {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-item toast-${type}`;
        toast.innerHTML = `
            <div class="toast-text">${msg}</div>
            <button class="toast-close">&times;</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 400);
        }, 4500);
    }

    // 13. Live Simulation Toggle (Simulate minor micro-variations)
    const toggleLiveSim = document.getElementById('toggle-live-sim');
    toggleLiveSim?.addEventListener('change', (e) => {
        if (e.target.checked) {
            startLiveSim();
            showNotification("Live simulation loop active: Simulating micro-variations every 4s", "info");
        } else {
            stopLiveSim();
            showNotification("Live simulation paused", "info");
        }
    });

    function startLiveSim() {
        if (liveSimulationInterval) clearInterval(liveSimulationInterval);
        liveSimulationInterval = setInterval(() => {
            // Apply slight natural variance to wind speed and direction
            const windDelta = (Math.random() - 0.5) * 0.8;
            currentInputs.windSpeed = Math.max(3, Math.min(30, currentInputs.windSpeed + windDelta));
            if (sliderWindSpeed) sliderWindSpeed.value = currentInputs.windSpeed.toFixed(1);

            const dirDelta = (Math.random() - 0.5) * 2;
            currentInputs.windDirectionDeg = (Math.round(currentInputs.windDirectionDeg + dirDelta) + 360) % 360;
            if (sliderWindDir) sliderWindDir.value = currentInputs.windDirectionDeg;

            syncInputsFromUI();
        }, 4000);
    }

    function stopLiveSim() {
        if (liveSimulationInterval) {
            clearInterval(liveSimulationInterval);
            liveSimulationInterval = null;
        }
    }

    // 14. Initial Load
    syncInputsFromUI();
    updateVisualizations();
    console.log("AgriSmoke AI initialized locally with zero external dependencies.");
});
