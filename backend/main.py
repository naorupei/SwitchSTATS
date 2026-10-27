
import asyncio
import os
import platform
import re
import subprocess
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from scipy.stats import binom, binomtest

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

TARGET_HOST = os.getenv("TARGET_HOST", "8.8.8.8")
PROBE_INTERVAL = max(1, float(os.getenv("PROBE_INTERVAL", "2")))
WINDOW_SIZE = max(5, int(os.getenv("WINDOW_SIZE", "30")))
LOSS_WARNING_THRESHOLD = min(
    1.0, max(0.0, float(os.getenv("LOSS_WARNING_THRESHOLD", "0.10")))
)
HISTORY_LIMIT = 300

# Each record represents one ICMP ping attempt.
history = deque(maxlen=HISTORY_LIMIT)
monitor_task = None
started_at = time.time()


# --------------------------------------------------
# NETWORK PROBING
# --------------------------------------------------

def perform_ping():
    """Send one ICMP ping and return its measured outcome."""
    system = platform.system()

    if system == "Darwin":
        # macOS: -W is in milliseconds.
        command = ["ping", "-n", "-c", "1", "-W", "2000", TARGET_HOST]
    elif system == "Linux":
        # Linux: -W is in seconds.
        command = ["ping", "-n", "-c", "1", "-W", "2", TARGET_HOST]
    else:
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "target": TARGET_HOST,
            "success": False,
            "latency_ms": None,
            "error": f"Unsupported operating system: {system}",
        }

    timestamp = datetime.now(timezone.utc).isoformat()
    started = time.perf_counter()

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        success = result.returncode == 0

        # Parse the actual round-trip time reported by macOS/Linux ping.
        output = result.stdout + "\n" + result.stderr
        latency_ms = elapsed_ms
        match = re.search(r"time[=<]\s*([0-9]+(?:\.[0-9]+)?)\s*ms?", output, re.IGNORECASE)
        if match:
            latency_ms = float(match.group(1))
        elif re.search(r"time<\s*1\s*ms", output, re.IGNORECASE):
            latency_ms = 0.5

        return {
            "timestamp": timestamp,
            "target": TARGET_HOST,
            "success": success,
            "latency_ms": latency_ms if success else None,
            "error": None if success else "No ping reply received",
        }

    except subprocess.TimeoutExpired:
        return {
            "timestamp": timestamp,
            "target": TARGET_HOST,
            "success": False,
            "latency_ms": None,
            "error": "Ping timed out",
        }
    except FileNotFoundError:
        return {
            "timestamp": timestamp,
            "target": TARGET_HOST,
            "success": False,
            "latency_ms": None,
            "error": "The ping command was not found",
        }
    except Exception as exc:
        return {
            "timestamp": timestamp,
            "target": TARGET_HOST,
            "success": False,
            "latency_ms": None,
            "error": str(exc),
        }


# --------------------------------------------------
# STATISTICS AND PREDICTION
# --------------------------------------------------

def recent_records():
    return list(history)[-WINDOW_SIZE:]


def calculate_metrics():
    records = recent_records()
    total = len(records)
    successes = sum(1 for record in records if record["success"])
    losses = total - successes

    loss_rate = losses / total if total else 0.0
    latencies = [
        record["latency_ms"]
        for record in records
        if record["success"] and record["latency_ms"] is not None
    ]

    return {
        "target": TARGET_HOST,
        "total_probes": total,
        "successful_probes": successes,
        "lost_probes": losses,
        "packet_loss_rate": round(loss_rate, 4),
        "packet_loss_percent": round(loss_rate * 100, 2),
        "average_latency_ms": (
            round(sum(latencies) / len(latencies), 2) if latencies else None
        ),
        "latest_probe": records[-1] if records else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def calculate_prediction():
    metrics = calculate_metrics()
    n = metrics["total_probes"]
    losses = metrics["lost_probes"]

    if n == 0:
        return {
            "status": "collecting_data",
            "message": "Waiting for network probe results.",
            "sample_size": 0,
        }

    # Estimate the probability of loss from the observed sample.
    p_hat = losses / n

    # Predict losses in the next WINDOW_SIZE probes under a Binomial model.
    future_n = WINDOW_SIZE
    expected_losses = future_n * p_hat
    warning_count = int(LOSS_WARNING_THRESHOLD * future_n)

    # Probability that future loss exceeds the configured warning threshold.
    # sf(k) = P(X > k), where X ~ Binomial(future_n, p_hat).
    probability_exceed = float(binom.sf(warning_count, future_n, p_hat))

    return {
        "status": "available",
        "model": "Binomial distribution",
        "sample_size": n,
        "estimated_loss_probability": round(p_hat, 4),
        "prediction_window": future_n,
        "expected_lost_probes": round(expected_losses, 2),
        "warning_threshold": LOSS_WARNING_THRESHOLD,
        "warning_threshold_percent": round(LOSS_WARNING_THRESHOLD * 100, 2),
        "probability_exceed_threshold": round(probability_exceed, 4),
        "probability_exceed_threshold_percent": round(
            probability_exceed * 100, 2
        ),
        "interpretation": (
            "Elevated predicted loss risk"
            if probability_exceed >= 0.5
            else "Predicted loss risk is below the alert criterion"
        ),
        "assumption": (
            "Probes are treated as independent trials with a constant "
            "loss probability estimated from recent observations."
        ),
    }


def calculate_validation():
    metrics = calculate_metrics()
    n = metrics["total_probes"]
    losses = metrics["lost_probes"]

    if n < 5:
        return {
            "status": "insufficient_data",
            "sample_size": n,
            "minimum_sample_size": 5,
            "message": "Collect at least 5 probes before running this test.",
        }

    # One-sided exact binomial test:
    # H0: loss probability <= configured warning threshold
    # H1: loss probability > configured warning threshold
    test = binomtest(
        k=losses,
        n=n,
        p=LOSS_WARNING_THRESHOLD,
        alternative="greater",
    )

    alpha = 0.05
    p_value = float(test.pvalue)

    return {
        "status": "available",
        "test": "One-sided exact binomial test",
        "null_hypothesis": (
            f"Packet-loss probability <= {LOSS_WARNING_THRESHOLD:.2%}"
        ),
        "alternative_hypothesis": (
            f"Packet-loss probability > {LOSS_WARNING_THRESHOLD:.2%}"
        ),
        "sample_size": n,
        "observed_losses": losses,
        "observed_loss_rate": round(losses / n, 4),
        "significance_level": alpha,
        "p_value": round(p_value, 6),
        "reject_null_hypothesis": p_value < alpha,
        "interpretation": (
            "Evidence that packet loss exceeds the configured threshold."
            if p_value < alpha
            else "Insufficient statistical evidence that packet loss exceeds "
                 "the configured threshold."
        ),
        "caveat": (
            "This test assumes independent probe outcomes. Network losses "
            "can be correlated, so interpret the result cautiously."
        ),
    }


# --------------------------------------------------
# SNAPSHOT AND BACKGROUND MONITOR
# --------------------------------------------------

def build_snapshot():
    return {
        "type": "monitor_update",
        "metrics": calculate_metrics(),
        "prediction": calculate_prediction(),
        "validation": calculate_validation(),
        "history": list(history),
        "config": {
            "probe_interval_seconds": PROBE_INTERVAL,
            "window_size": WINDOW_SIZE,
            "loss_warning_threshold": LOSS_WARNING_THRESHOLD,
        },
    }


async def monitor_loop():
    while True:
        record = await asyncio.to_thread(perform_ping)
        history.append(record)
        await asyncio.sleep(PROBE_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global monitor_task
    monitor_task = asyncio.create_task(monitor_loop())
    yield
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass


# --------------------------------------------------
# FASTAPI APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="SwitchSTATS API",
    description="Network probe monitoring, Binomial prediction, and validation.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development only; restrict before deployment.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "name": "SwitchSTATS",
        "status": "running",
        "docs": "/docs",
        "target": TARGET_HOST,
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "target": TARGET_HOST,
        "uptime_seconds": round(time.time() - started_at, 2),
    }


@app.get("/api/metrics")
async def metrics():
    return calculate_metrics()


@app.get("/api/history")
async def get_history():
    return list(history)


@app.get("/api/prediction")
async def prediction():
    return calculate_prediction()


@app.get("/api/validation")
async def validation():
    return calculate_validation()


@app.websocket("/ws/monitor")
async def websocket_monitor(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(build_snapshot())
            await asyncio.sleep(PROBE_INTERVAL)
    except WebSocketDisconnect:
        pass