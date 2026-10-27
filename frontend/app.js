
const API_BASE = "http://127.0.0.1:8000";
const WS_URL = "ws://127.0.0.1:8000/ws/monitor";

let latestSnapshot = null;
let latencyChart = null;
let analyticsChart = null;
let deliveryChart = null;

const $ = (id) => document.getElementById(id);
const formatNumber = (value, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? "--"
    : Number(value).toFixed(digits);

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function updateClock() {
  setText("clock", new Date().toLocaleTimeString("en-GB", { hour12: false }));
}
setInterval(updateClock, 1000);
updateClock();

function setConnection(connected, message) {
  const dot = $("connection-dot");
  dot.classList.toggle("connected", connected);
  dot.classList.toggle("disconnected", !connected);
  setText("connection-text", message);
}

function makeChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#17192a",
        borderColor: "rgba(173,174,224,.2)",
        borderWidth: 1,
        titleColor: "#f1f1fb",
        bodyColor: "#c7c8dc"
      }
    },
    scales: {
      x: {
        ticks: { color: "#777c99", maxTicksLimit: 6, font: { size: 9 } },
        grid: { display: false },
        border: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#777c99", font: { size: 9 } },
        grid: { color: "rgba(173,174,224,.08)" },
        border: { display: false }
      }
    }
  };
}

function initCharts() {
  if (!window.Chart) {
    console.warn("Chart.js did not load. Charts are unavailable.");
    return;
  }

  const latencyConfig = () => ({
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Latency (ms)",
        data: [],
        borderColor: "#9b8aff",
        backgroundColor: "rgba(155,138,255,.09)",
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.32,
        fill: true,
        spanGaps: false
      }]
    },
    options: makeChartOptions()
  });

  const packetLossConfig = {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Probe outcome (1 = lost)",
        data: [],
        borderColor: "#ed78bb",
        backgroundColor: "rgba(237,120,187,.12)",
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        stepped: true,
        fill: true
      }]
    },
    options: {
      ...makeChartOptions(),
      scales: {
        ...makeChartOptions().scales,
        y: {
          min: 0,
          max: 1,
          ticks: {
            stepSize: 1,
            color: "#777c99",
            font: { size: 9 },
            callback: (value) => value === 1 ? "Lost" : "Received"
          },
          grid: { color: "rgba(173,174,224,.08)" },
          border: { display: false }
        }
      }
    }
  };

  latencyChart = new Chart($("latency-chart"), packetLossConfig);
  analyticsChart = new Chart($("analytics-chart"), latencyConfig());

  deliveryChart = new Chart($("delivery-chart"), {
    type: "doughnut",
    data: {
      labels: ["Received", "Lost"],
      datasets: [{
        data: [0, 0],
        backgroundColor: ["#9b8aff", "#ed78bb"],
        borderColor: "#101321",
        borderWidth: 4,
        hoverOffset: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "78%",
      plugins: { legend: { display: false } }
    }
  });
}

function updateLineChart(chart, records) {
  if (!chart) return;
  const rows = records.slice(-40);
  chart.data.labels = rows.map((r) => {
    const date = new Date(r.timestamp);
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  });
  chart.data.datasets[0].data = rows.map((r) =>
    r.success ? r.latency_ms : null
  );
  chart.update("none");
}

function updatePacketLossChart(chart, records) {
  if (!chart) return;
  const rows = records.slice(-40);
  chart.data.labels = rows.map((r) => {
    const date = new Date(r.timestamp);
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  });
  // A value of 1 means this probe received no reply; 0 means it succeeded.
  chart.data.datasets[0].data = rows.map((r) => r.success ? 0 : 1);
  chart.update("none");
}

function renderMetrics(snapshot) {
  const m = snapshot.metrics || {};
  const p = snapshot.prediction || {};
  const v = snapshot.validation || {};
  const records = snapshot.history || [];

  setText("target-host", m.target || "Unknown");
  setText("server-label", m.target || "Unknown");
  setText("metric-loss", formatNumber(m.packet_loss_percent, 2));
  setText("metric-latency", formatNumber(m.average_latency_ms, 2));
  setText("metric-success", `${m.successful_probes ?? 0} / ${m.total_probes ?? 0}`);
  setText("metric-risk", formatNumber(p.probability_exceed_threshold_percent, 2));
  setText("metric-loss-foot", `${m.lost_probes ?? 0} lost of ${m.total_probes ?? 0} probes`);
  setText("metric-probes-foot", `Window of ${snapshot.config?.window_size ?? 30} probes`);
  setText("topology-sample", `${records.length} OBSERVATIONS`);
  setText("device-state", "Probe source");
  setText("router-state", "Path not directly measured");
  setText("server-state", records.length ? "Probing" : "Awaiting data");

  const loss = Number(m.packet_loss_percent || 0);
  const risk = Number(p.probability_exceed_threshold_percent || 0);
  const isAlert = loss >= (snapshot.config?.loss_warning_threshold ?? 0.1) * 100;

  setText(
    "network-status",
    records.length === 0 ? "Collecting network data" :
      isAlert ? "Packet loss detected" : "Network probes responding"
  );
  setText(
    "network-subtitle",
    `${m.successful_probes ?? 0} replies received and ${m.lost_probes ?? 0} lost in the current observation window.`
  );

  setText("delivery-percent",
    m.total_probes ? `${((m.successful_probes / m.total_probes) * 100).toFixed(0)}%` : "--%"
  );

  if (deliveryChart) {
    deliveryChart.data.datasets[0].data = [
      m.successful_probes ?? 0,
      m.lost_probes ?? 0
    ];
    deliveryChart.update("none");
  }

  updatePacketLossChart(latencyChart, records);
  updateLineChart(analyticsChart, records);

  setText("analytics-total", m.total_probes ?? 0);
  setText("analytics-success", m.successful_probes ?? 0);
  setText("analytics-loss", m.lost_probes ?? 0);
  setText("analytics-latency", formatNumber(m.average_latency_ms, 2));

  renderPrediction(p);
  renderValidation(v);
  renderLogs(records);
  renderSettings(snapshot.config || {}, m.target);
}

function renderPrediction(p) {
  if (p.status !== "available") {
    setText("prediction-rate", "--%");
    setText("prediction-count", "--");
    setText("prediction-window", p.message || "Waiting for probe observations");
    setText("prediction-interpretation", p.message || "Collecting data.");
    setText("risk-label", "AWAITING DATA");
    $("risk-bar").style.width = "0%";
    return;
  }

  setText("prediction-rate", `${(p.estimated_loss_probability * 100).toFixed(2)}%`);
  setText("prediction-count", formatNumber(p.expected_lost_probes, 2));
  setText("prediction-window", `Expected out of ${p.prediction_window} future probes`);
  setText(
    "prediction-interpretation",
    `${p.interpretation}. The model estimates ${p.expected_lost_probes} lost probes in the next ${p.prediction_window} attempts.`
  );
  setText("risk-label", `${p.probability_exceed_threshold_percent.toFixed(2)}% EXCEEDANCE PROBABILITY`);
  $("risk-bar").style.width = `${Math.min(100, Math.max(0, p.probability_exceed_threshold_percent))}%`;
}

function renderValidation(v) {
  if (v.status !== "available") {
    setText("validation-status", "COLLECTING SAMPLES");
    setText("validation-heading", "Exact binomial test");
    setText("validation-interpretation", v.message || "Waiting for enough samples.");
    setText("validation-n", v.sample_size ?? 0);
    setText("validation-rate", "--%");
    setText("validation-p", "--");
    setText("null-hypothesis", "Loss probability is at or below the warning threshold.");
    setText("alternative-hypothesis", "Loss probability exceeds the warning threshold.");
    setText("validation-caveat", "Collect at least five probe observations before interpreting the test.");
    return;
  }

  setText("validation-status", v.reject_null_hypothesis ? "THRESHOLD EXCEEDED" : "NO SIGNIFICANT EXCEEDANCE");
  setText("validation-heading", v.test);
  setText("validation-interpretation", v.interpretation);
  setText("validation-n", v.sample_size);
  setText("validation-rate", `${(v.observed_loss_rate * 100).toFixed(2)}%`);
  setText("validation-p", v.p_value);
  setText("null-hypothesis", v.null_hypothesis);
  setText("alternative-hypothesis", v.alternative_hypothesis);
  setText("validation-caveat", v.caveat);
}

function renderLogs(records) {
  const tbody = $("log-body");
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="5">Waiting for probe records...</td></tr>';
    return;
  }

  tbody.replaceChildren();
  records.slice().reverse().slice(0, 100).forEach((record) => {
    const row = document.createElement("tr");
    const values = [
      new Date(record.timestamp).toLocaleTimeString(),
      record.target,
      record.success ? "RECEIVED" : "LOST",
      record.latency_ms == null ? "--" : `${record.latency_ms.toFixed(2)} ms`,
      record.error || (record.success ? "Reply received" : "No reply")
    ];

    values.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 2) {
        const pill = document.createElement("span");
        pill.className = `result-pill ${record.success ? "success" : "loss"}`;
        pill.textContent = value;
        cell.appendChild(pill);
      } else {
        cell.textContent = value;
      }
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
}

function renderSettings(config, target) {
  setText("settings-target", target || "Unknown");
  setText("settings-interval", `${config.probe_interval_seconds ?? "--"} seconds`);
  setText("settings-window", `${config.window_size ?? "--"} probes`);
  setText("settings-threshold", `${((config.loss_warning_threshold ?? 0) * 100).toFixed(1)}%`);
}

const pageTitles = {
  network: ["Network overview", "OVERVIEW"],
  analytics: ["Network analytics", "ANALYTICS"],
  prediction: ["Packet-loss prediction", "PREDICTION"],
  validation: ["Model validation", "VALIDATION"],
  logs: ["Probe log", "OBSERVATIONS"],
  settings: ["Monitor settings", "CONFIGURATION"]
};

document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    document.querySelectorAll(".nav-item[data-view]").forEach((item) =>
      item.classList.toggle("active", item === button)
    );
    document.querySelectorAll(".view").forEach((section) =>
      section.classList.toggle("active", section.id === `view-${view}`)
    );
    const [title, section] = pageTitles[view] || ["SwitchSTATS", "OVERVIEW"];
    setText("page-title", title);
    setText("current-section", section);
    setTimeout(() => {
      latencyChart?.resize();
      analyticsChart?.resize();
      deliveryChart?.resize();
    }, 50);
  });
});

const nodeInfo = {
  device: {
    title: "Your device",
    description: "This machine initiates the ICMP probes used by SwitchSTATS.",
    status: "Probe source",
    detail: "Local application host",
    role: "Client"
  },
  router: {
    title: "Network path",
    description: "The route between your machine and the target is not directly mapped by this MVP. Intermediate hops are not individually measured.",
    status: "Path not directly measured",
    detail: "ICMP probes to target",
    role: "Network path"
  },
  server: {
    title: "Target server",
    description: "The configured host receiving the ICMP probes. A missing reply is recorded as a failed probe, but does not by itself identify where packet loss occurred.",
    status: "Probe target",
    detail: "Selected in backend/.env",
    role: "Destination"
  }
};

function openNode(node) {
  const info = nodeInfo[node];
  if (!info) return;
  setText("drawer-title", info.title);
  setText("drawer-description", info.description);
  setText("drawer-status", info.status);
  setText("drawer-detail", node === "server" ? (latestSnapshot?.metrics?.target || info.detail) : info.detail);
  setText("drawer-role", info.role);
  $("node-drawer").classList.add("open");
  $("drawer-backdrop").classList.add("open");
  $("node-drawer").setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  $("node-drawer").classList.remove("open");
  $("drawer-backdrop").classList.remove("open");
  $("node-drawer").setAttribute("aria-hidden", "true");
}

document.querySelectorAll(".topology-node").forEach((node) => {
  node.addEventListener("click", () => openNode(node.dataset.node));
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openNode(node.dataset.node);
    }
  });
});
$("drawer-close").addEventListener("click", closeDrawer);
$("drawer-backdrop").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

function connectWebSocket() {
  setConnection(false, "Connecting...");
  const socket = new WebSocket(WS_URL);

  socket.addEventListener("open", () => setConnection(true, "Backend connected"));
  socket.addEventListener("message", (event) => {
    try {
      latestSnapshot = JSON.parse(event.data);
      renderMetrics(latestSnapshot);
    } catch (error) {
      console.error("Could not parse monitor data:", error);
    }
  });
  socket.addEventListener("error", () => setConnection(false, "Connection error"));
  socket.addEventListener("close", () => {
    setConnection(false, "Reconnecting...");
    setTimeout(connectWebSocket, 2500);
  });
}

initCharts();
connectWebSocket();
