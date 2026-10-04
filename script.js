const GEOJSON_FILE = "data/Bengaluru_wards_LST_NDVI_NDBI_NDWI_2026_04_25.geojson";
const RESULTS_FILE = "data/results.json";

const map = L.map("map", { zoomControl: true }).setView([12.9716, 77.5946], 10.7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let wardsLayer;
let wardData;
let selectedIndicator = "LST_mean_C";

const indicatorTitles = {
  LST_mean_C: "Mean Land Surface Temperature (°C)",
  NDVI_mean: "Mean NDVI",
  NDBI_mean: "Mean NDBI",
  NDWI_mean: "Mean NDWI"
};

function numeric(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function wardName(properties) {
  const keys = [
    "WARD_NAME",
    "ward_name",
    "Ward_Name",
    "NAME",
    "name",
    "WARD_NO",
    "ward_no",
    "Ward_No",
    "ward_id",
    "WARD_ID"
  ];

  for (const key of keys) {
    if (properties[key] !== undefined && properties[key] !== null) {
      return String(properties[key]);
    }
  }

  return "Selected ward";
}

function getColor(value, indicator) {
  if (!Number.isFinite(value)) {
    return "#bdbdbd";
  }

  if (indicator === "LST_mean_C") {
    if (value < 38) return "#ffffb2";
    if (value < 40) return "#fecc5c";
    if (value < 42) return "#fd8d3c";
    if (value < 44) return "#f03b20";
    return "#bd0026";
  }

  if (indicator === "NDVI_mean") {
    if (value < 0.15) return "#edf8e9";
    if (value < 0.25) return "#bae4b3";
    if (value < 0.35) return "#74c476";
    if (value < 0.45) return "#31a354";
    return "#006d2c";
  }

  if (indicator === "NDBI_mean") {
    if (value < -0.15) return "#f1eef6";
    if (value < -0.05) return "#d7b5d8";
    if (value < 0.05) return "#df65b0";
    if (value < 0.15) return "#ce1256";
    return "#67001f";
  }

  if (indicator === "NDWI_mean") {
    if (value < -0.20) return "#f7fbff";
    if (value < -0.10) return "#c6dbef";
    if (value < 0.00) return "#6baed6";
    if (value < 0.10) return "#3182bd";
    return "#08519c";
  }

  return "#bdbdbd";
}

function wardStyle(feature) {
  return {
    fillColor: getColor(numeric(feature.properties[selectedIndicator]), selectedIndicator),
    weight: 0.65,
    color: "#334e68",
    fillOpacity: 0.78
  };
}

function updateHeatProfile(properties) {
  const profileContent = document.getElementById("profile-content");
  const diagnosisCard = document.getElementById("diagnosis-card");
  const diagnosisTitle = document.getElementById("diagnosis-title");
  const diagnosisText = document.getElementById("diagnosis-text");
  const diagnosisList = document.getElementById("diagnosis-list");

  if (!profileContent || !diagnosisCard || !diagnosisTitle || !diagnosisText || !diagnosisList) {
    console.error("Diagnosis card HTML elements were not found.");
    return;
  }

  if (!properties) {
    profileContent.innerHTML = `
      <p class="panel-eyebrow">Click a ward</p>
      <h3>Heat Profile</h3>
      <p>Select a ward on the map to view observed LST, vegetation, built-up, and wetness values.</p>
    `;

    diagnosisTitle.textContent = "Select a ward on the map";

    diagnosisText.textContent =
      "Once a ward is selected, this card will explain whether its temperature is relatively high or low and identify vegetation, built-up intensity, and water/wetness signals.";

    diagnosisList.innerHTML = `
      <li>Surface temperature: waiting for ward selection</li>
      <li>Vegetation signal: waiting for ward selection</li>
      <li>Built-up signal: waiting for ward selection</li>
      <li>Wetness signal: waiting for ward selection</li>
    `;

    return;
  }

  const lst = numeric(properties.LST_mean_C, 0);
  const ndvi = numeric(properties.NDVI_mean, 0);
  const ndbi = numeric(properties.NDBI_mean, 0);
  const ndwi = numeric(properties.NDWI_mean, 0);

  const anomaly = numeric(properties.lst_anomaly_C, 0);
  const anomalyText = anomaly > 0
    ? `+${anomaly.toFixed(2)}`
    : anomaly.toFixed(2);

  const heatCategory = properties.heat_class || "N/A";
  const diagnosticClass = properties.diagnostic_class || "Data pending";
  const priority = properties.priority_score || "N/A";

  /* Update only the top Heat Profile text.
     Do NOT replace #heat-profile because that would delete the diagnosis card. */
  profileContent.innerHTML = `
    <p class="panel-eyebrow">${wardName(properties)}</p>
    <h3>Ward Heat Diagnosis</h3>
    <p>
      This ward has observed satellite indicators that can be used to understand
      relative daytime heat conditions.
    </p>
  `;

  /* Update the diagnosis card that already exists in index.html. */
  diagnosisTitle.textContent = `${wardName(properties)}: Heat Diagnosis`;

  diagnosisText.innerHTML = `
    <strong>Observed LST:</strong> ${lst.toFixed(2)} °C<br>
    <strong>Relative heat anomaly:</strong> ${anomalyText} °C<br>
    <strong>Heat category:</strong> ${heatCategory}<br>
    <strong>Diagnostic class:</strong> ${diagnosticClass}<br>
    <strong>Priority score:</strong> ${priority}
  `;

  diagnosisList.innerHTML = `
    <li><strong>NDBI:</strong> ${ndbi.toFixed(4)} — ${properties.built_up_risk || "Unknown"} built-up signal</li>
    <li><strong>NDVI:</strong> ${ndvi.toFixed(4)} — ${properties.vegetation_deficit || "Unknown"} vegetation deficit</li>
    <li><strong>NDWI:</strong> ${ndwi.toFixed(4)} — water/wetness indicator</li>
    <li><strong>Confidence:</strong> ${properties.evidence_confidence || "N/A"}</li>
    <li><strong>Recommended intervention:</strong> ${properties.intervention_package || "Pending audit"}</li>
    <li><strong>Required audit:</strong> ${properties.recommended_audit || "Pending audit"}</li>
    <li><strong>Limitations:</strong> ${properties.limitations || "None"}</li>
  `;

  diagnosisCard.style.display = "block";
}

function addWardLayer() {
  if (wardsLayer) {
    map.removeLayer(wardsLayer);
  }

  wardsLayer = L.geoJSON(wardData, {
    style: wardStyle,
    onEachFeature(feature, layer) {
      layer.on({
        click(event) {
          updateHeatProfile(feature.properties);
          map.fitBounds(event.target.getBounds(), {
            padding: [35, 35],
            maxZoom: 13
          });
        },
        mouseover(event) {
          event.target.setStyle({
            weight: 2,
            color: "#102a43",
            fillOpacity: 0.92
          });
        },
        mouseout(event) {
          wardsLayer.resetStyle(event.target);
        }
      });

      layer.bindTooltip(wardName(feature.properties), { sticky: true });
    }
  }).addTo(map);

  map.fitBounds(wardsLayer.getBounds(), { padding: [20, 20] });
  updateLegend();
}

function updateLegend() {
  const legend = document.getElementById("legend");

  const text = {
    LST_mean_C: "LST: pale yellow = relatively cooler wards; dark red = relatively hotter wards.",
    NDVI_mean: "NDVI: light green = lower vegetation signal; dark green = higher vegetation signal.",
    NDBI_mean: "NDBI: pale colours = lower built-up signal; dark magenta = higher built-up signal.",
    NDWI_mean: "NDWI: pale blue = lower water/wetness signal; dark blue = higher water/wetness signal."
  };

  legend.textContent = `${indicatorTitles[selectedIndicator]} — ${text[selectedIndicator]}`;
}

function loadSummary() {
  fetch(RESULTS_FILE)
    .then((response) => response.json())
    .then((results) => {
      const ndwiElement = document.getElementById("mean-ndwi");

      if (ndwiElement && results.mean_ndwi !== null && results.mean_ndwi !== undefined) {
        ndwiElement.textContent = Number(results.mean_ndwi).toFixed(4);
      }
    })
    .catch((error) => {
      console.warn("Results summary could not be loaded.", error);
    });
}

fetch(GEOJSON_FILE)
  .then((response) => {
    if (!response.ok) {
      throw new Error("Could not load the ward GeoJSON file.");
    }
    return response.json();
  })
  .then((data) => {
    wardData = data;
    addWardLayer();
  })
  .catch((error) => {
    const legend = document.getElementById("legend");
    if (legend) {
        legend.textContent = `${error.message} Use a local server or GitHub Pages; do not open index.html directly.`;
    }
    console.error(error);
  });

document.getElementById("indicator").addEventListener("change", (event) => {
  selectedIndicator = event.target.value;
  addWardLayer();
});

loadSummary();
