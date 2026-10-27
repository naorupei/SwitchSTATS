# SwitchSTATS
### Probabilistic Network Packet-Loss Monitoring and Prediction

**SwitchSTATS** is a real-time network monitoring and statistical analysis project that observes network connectivity through ICMP ping probes and applies the **Binomial Probability Distribution** to estimate packet-loss behaviour.

The project combines live network measurements, probability-based prediction, statistical validation, and a cyberpunk-inspired dashboard to make network reliability easier to understand.

> **Project status:** Development MVP  
> **Primary model:** Binomial Probability Distribution  
> **Backend:** Python, FastAPI  
> **Frontend:** HTML, CSS, JavaScript  
> **Target:** Real-time network connectivity monitoring and probabilistic analysis

---

## Table of Contents

- [1. Problem Statement](#1-problem-statement)
- [2. Objectives](#2-objectives)
- [3. Key Features](#3-key-features)
- [4. Mathematical Foundation](#4-mathematical-foundation)
- [5. Statistical Decision-Making](#5-statistical-decision-making)
- [6. Course Outcomes](#6-course-outcomes)
- [7. System Architecture](#7-system-architecture)
- [8. Technology Stack](#8-technology-stack)
- [9. Project Structure](#9-project-structure)
- [10. Installation and Setup](#10-installation-and-setup)
- [11. Configuration](#11-configuration)
- [12. API Endpoints](#12-api-endpoints)
- [13. Understanding the Results](#13-understanding-the-results)
- [14. Assumptions and Limitations](#14-assumptions-and-limitations)
- [15. Future Enhancements](#15-future-enhancements)

---

## 1. Problem Statement

Network reliability is influenced by several uncertain factors, including congestion, interference, routing conditions, and temporary connectivity failures. Packet loss can affect application performance, communication reliability, and the quality of network services.

Traditional monitoring can show the current network condition, but interpreting the probability of future failures requires a statistical approach.

SwitchSTATS addresses this problem by collecting ICMP ping responses, calculating observed packet loss, and applying the Binomial Distribution to estimate the probability of different numbers of failed probes over a future observation window.

The system presents these measurements and statistical results through an interactive dashboard.

## 2. Objectives

- Monitor network reachability using periodic ICMP ping probes.
- Calculate packet-loss percentage and latency statistics.
- Model the number of failed probes using the Binomial Distribution.
- Estimate expected packet loss over a specified number of future probes.
- Apply probability-based thresholds to communicate network risk.
- Use statistical tests to examine whether observed results differ significantly from a reference loss probability.
- Visualize network metrics and analytical results through an interactive dashboard.

## 3. Key Features

- **Live network monitoring:** Periodically probes a configurable network target.
- **Packet-loss measurement:** Tracks successful and unsuccessful probe attempts.
- **Latency analysis:** Displays response-time measurements when replies are received.
- **Probabilistic prediction:** Estimates the expected number of failed probes using the fitted Binomial model.
- **Risk indication:** Compares observed loss against a configurable warning threshold.
- **Interactive dashboard:** Presents monitoring statistics, charts, network-path visualizations, and probe logs.
- **Statistical validation:** Supports analysis of observed failures against a specified reference probability.
- **Configurable monitoring:** Allows the target host, probe interval, observation-window size, and warning threshold to be adjusted.

## 4. Mathematical Foundation

### 4.1 Why the Binomial Distribution?

The Binomial Distribution models the number of successes or failures in a fixed number of trials when each trial has two possible outcomes.

For SwitchSTATS, each ICMP ping probe is treated as one trial:

- **Success:** A valid ping reply is received within the applicable timeout.
- **Failure:** No valid reply is received within the applicable timeout.

Let:

- \(n\) = number of probes in an observation window.
- \(p\) = probability that a probe fails.
- \(X\) = number of failed probes in that window.
- \(1-p\) = probability that a probe succeeds.

Under the Binomial model:

\[
X \sim \operatorname{Binomial}(n,p)
\]

This model assumes a fixed number of trials, a common failure probability, and independent outcomes. Real network failures may violate these assumptions, so the model is an approximation of network behaviour.

### 4.2 Probability Mass Function

The probability of observing exactly \(k\) failed probes among \(n\) probes is:

\[
P(X=k)=\binom{n}{k}p^k(1-p)^{n-k}
\]

where

\[
\binom{n}{k}=\frac{n!}{k!(n-k)!}
\]

and \(k\) can take any integer value from \(0\) to \(n\).

This function estimates the probability of a particular number of failed probes under the assumed failure probability.

### 4.3 Estimating the Failure Probability

Suppose the system records \(x\) failed probes in a window containing \(n\) probes.

The observed failure probability is estimated by:

\[
\hat p=\frac{x}{n}
\]

The observed packet-loss percentage is:

\[
L=\frac{x}{n}\times100\%
\]

The observed success percentage is:

\[
S=\frac{n-x}{n}\times100\%
\]

For example, if 3 out of 30 probes fail:

\[
\hat p=\frac{3}{30}=0.10
\]

\[
L=10\%
\]

This is an estimate based on the current observations, not a guarantee of future network behaviour.

### 4.4 Expected Number of Future Failures

For a future window of \(m\) probes, assuming the failure probability remains approximately constant:

\[
Y\sim\operatorname{Binomial}(m,\hat p)
\]

The expected number of failed probes is:

\[
E[Y]=m\hat p
\]

The variance and standard deviation are:

\[
\operatorname{Var}(Y)=m\hat p(1-\hat p)
\]

\[
\sigma_Y=\sqrt{m\hat p(1-\hat p)}
\]

**Example:** Suppose 3 failures are observed among 30 probes, and the next window also contains 30 probes.

\[
\hat p=\frac{3}{30}=0.10
\]

\[
E[Y]=30(0.10)=3
\]

The model therefore predicts an average of 3 failed probes over the next 30 probes. It does **not** mean exactly 3 failures will occur.

The probability of observing exactly 3 failures in that future window is:

\[
P(Y=3)=\binom{30}{3}(0.1)^3(0.9)^{27}
\]

This probability is approximately \(0.236\), or 23.6%.

### 4.5 Probability of Exceeding a Loss Limit

The model can also estimate the probability that the number of failures reaches or exceeds a chosen limit \(r\):

\[
P(Y\geq r)=
\sum_{k=r}^{m}
\binom{m}{k}\hat p^k(1-\hat p)^{m-k}
\]

This is useful when the objective is to estimate the likelihood of a high-loss observation window rather than only its expected number of failures.

The result is conditional on the chosen model, observation window, and estimated failure probability.

## 5. Statistical Decision-Making

SwitchSTATS uses statistical measurements to support understandable network-status decisions.

### 5.1 Threshold-Based Warning

Let \(L\) be the observed packet-loss fraction and \(T\) the configured warning threshold.

A basic threshold rule is:

\[
\text{Warning}=
\begin{cases}
1, & L\geq T\\
0, & L<T
\end{cases}
\]

For example, if the configured threshold is \(T=0.10\), a measured loss of 10% or higher meets the warning condition.

This rule is a monitoring policy, not proof that the network is statistically abnormal.

### 5.2 Binomial Hypothesis Testing

To evaluate whether observed loss differs from an expected reference probability, a one-sided or two-sided exact Binomial test can be formulated.

For example:

\[
H_0:p=p_0
\]

\[
H_1:p>p_0
\]

where \(p_0\) is the reference failure probability.

The exact Binomial test calculates a p-value from the observed number of failures under the null hypothesis.

At a chosen significance level \(\alpha\):

- If the p-value is less than or equal to \(\alpha\), reject the null hypothesis.
- Otherwise, there is insufficient evidence to reject the null hypothesis.

A non-significant result does not prove that the network is healthy. Likewise, statistical significance does not automatically establish the cause of packet loss.

The Binomial test also assumes independent trials with a constant failure probability. Correlated network failures can make this assumption unsuitable.

### 5.3 Interpretation of Predictions

Predictions are statistical estimates, not deterministic forecasts. Their reliability depends on the quality of the measurements, the amount of observed data, and whether network conditions remain reasonably stable.

## 6. Course Outcomes

### CO3 — Predict Network Traffic Having Uncertainties

SwitchSTATS applies probability theory to uncertain network outcomes. It estimates the expected number of failed probes and the probability of observing different numbers of failures in a future observation window.

**Application:** Binomial modelling, expected value, variance, and probability estimation.

### CO4 — Statistically Justify AI Decisions

The project demonstrates how a system can justify monitoring decisions through measurable evidence rather than arbitrary labels. Packet-loss warnings can be explained using observed loss percentages, configured thresholds, and probability estimates.

**Application:** Evidence-based risk indicators and interpretable statistical decision rules.

*Scope note: SwitchSTATS is a probabilistic statistical monitoring system, not a trained AI model. Its predictions and warnings are justified by statistical calculations rather than machine-learning inference.*

### CO5 — Validate Data-Driven Models Using Statistical Tests

The project provides a framework for comparing observed probe failures against a reference failure probability using an exact Binomial test. This supports an assessment of whether the observations provide sufficient statistical evidence against the reference model.

**Application:** Null and alternative hypotheses, p-values, significance levels, and interpretation of statistical evidence.

A rigorous validation should use an explicitly defined reference probability and a suitable observation window. Testing assumptions must be checked before interpreting the result.

## 7. System Architecture

SwitchSTATS uses a frontend-backend architecture.

1. **Probe generation:** The backend periodically sends ICMP ping requests to the configured target.
2. **Measurement collection:** It records reply status and available response-time measurements.
3. **Metric calculation:** The system derives packet loss and latency statistics from collected probes.
4. **Statistical analysis:** The observed failure rate provides the probability estimate used in Binomial calculations.
5. **Communication:** The FastAPI backend exposes HTTP endpoints and a WebSocket connection for monitoring data.
6. **Visualization:** The frontend displays current metrics, charts, network-path information, and monitoring logs.

### Data Flow

```text
Configured Target Host
         |
         v
   ICMP Ping Probes
         |
         v
   FastAPI Backend
         |
         v
 Probe Results and Metrics
         |
         v
  Binomial Probability Model
         |
         v
   Statistical Indicators
         |
         v
 Interactive Web Dashboard
```

## 8. Technology Stack

| Component | Technology |
|---|---|
| Backend language | Python |
| Backend framework | FastAPI |
| ASGI server | Uvicorn |
| Statistical calculations | SciPy |
| Configuration | python-dotenv |
| Frontend structure | HTML |
| Frontend styling | CSS |
| Frontend logic | JavaScript |
| Real-time communication | WebSocket |
| Chart visualization | Chart.js |

## 9. Project Structure

```text
SwitchSTATS/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .gitignore
└── README.md
```

The `.venv/` directory may also exist locally after installation. It contains the Python virtual environment and should not be committed to Git.

## 10. Installation and Setup

### Prerequisites

Install the following before running the project:

- Python 3.10 or newer recommended.
- Git, if cloning the repository.
- A modern browser.
- Network access to a reachable ping target.
- Permission for ICMP ping requests on the operating system and network.

The commands below assume the repository uses the structure shown above.

### Step 1 — Clone the repository

```bash
git clone https://github.com/naorupei/SwitchSTATS.git
cd SwitchSTATS
```

### Step 2 — Create a virtual environment

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows PowerShell**

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks environment activation, use the Python executable inside `.venv` directly or follow your system's approved execution-policy procedure.

### Step 3 — Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

If the virtual environment is active, `python` should refer to its Python executable. On macOS, `python3` can be used if necessary.

### Step 4 — Configure the backend

Create or edit `backend/.env` with the following settings:

```dotenv
TARGET_HOST=8.8.8.8
PROBE_INTERVAL=2
WINDOW_SIZE=30
LOSS_WARNING_THRESHOLD=0.10
```

Configuration options:

| Variable | Purpose | Example |
|---|---|---|
| `TARGET_HOST` | Host to probe | `8.8.8.8` |
| `PROBE_INTERVAL` | Time between probes, in seconds | `2` |
| `WINDOW_SIZE` | Number of probes in the rolling observation window | `30` |
| `LOSS_WARNING_THRESHOLD` | Warning threshold as a fraction | `0.10` |

The examples above represent a 2-second probe interval, a 30-probe observation window, and a 10% loss threshold. The backend implementation determines how these values are loaded and applied.

Keep `.env` out of version control if it contains local or sensitive configuration.

### Step 5 — Start the backend

From the repository root, with the virtual environment active:

```bash
python -m uvicorn backend.main:app --reload
```

On macOS, if `python` is not found:

```bash
python3 -m uvicorn backend.main:app --reload
```

The backend should be available at:

- Application: `http://127.0.0.1:8000`
- API documentation: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

Leave this terminal running.

### Step 6 — Start the frontend

Open a second terminal and navigate to the project directory:

```bash
cd ~/Desktop/Code/SwitchSTATS
```

If your repository is stored elsewhere, use its actual path.

Start a local static file server:

```bash
python3 -m http.server 5500 --directory frontend
```

Open the dashboard in your browser:

**http://127.0.0.1:5500**

Keep both the backend and frontend terminals running while using the dashboard.

### Step 7 — Verify the application

1. Open `http://127.0.0.1:8000/api/health` and confirm the health endpoint responds.
2. Open `http://127.0.0.1:8000/docs` to inspect the available API operations.
3. Open `http://127.0.0.1:5500` to load the dashboard.
4. Confirm that the monitoring metrics update and that the configured target is reachable.
5. Check the backend terminal if probe requests fail or the dashboard cannot connect to the API.

If the dashboard is blank, verify that `frontend/index.html` contains the application code and that the frontend server is serving the correct directory.

If ping requests fail, check the target address, network connectivity, firewall restrictions, and whether ICMP is allowed. A failed ping does not always mean the destination server is offline.

## 11. Configuration

The default settings are suitable for a basic demonstration but are not universal network-performance standards.

- **Target host:** Choose a reachable host that permits ICMP requests.
- **Probe interval:** Short intervals provide more frequent observations but can increase the number of requests.
- **Window size:** Larger windows provide more observations but can respond more slowly to sudden changes.
- **Loss threshold:** Set this according to the monitoring objective rather than treating one percentage as appropriate for every network.

For meaningful statistical comparisons, keep the observation window and reference probability clearly documented.

## 12. API Endpoints

The project exposes the following monitoring interfaces:

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Checks backend health |
| `GET /api/metrics` | Retrieves current monitoring metrics |
| `WS /ws/monitor` | Provides the monitoring WebSocket connection |

The exact response fields and message formats are defined by the backend implementation. Use `/docs` to inspect the available HTTP endpoint schemas.

## 13. Understanding the Results

### Packet-loss percentage

The fraction of unsuccessful probes in the observation window, expressed as a percentage.

### Average latency

The average measured response time for probes with usable latency measurements. It is not the same as the average latency of all traffic on the network.

### Success count

The number of successful probes in the observation window.

### Loss prediction

An estimate of future failures based on the observed failure probability and a specified future window size. It should be interpreted as a probabilistic estimate, not a guaranteed count.

### Warning status

An indicator derived from the configured loss threshold or other implemented decision rules. A warning indicates that the defined condition has been met; it does not identify the root cause of a network problem.

## 14. Assumptions and Limitations

- ICMP ping probes measure reachability and response behaviour, not every packet exchanged by applications.
- Routers, firewalls, and destination hosts may block or deprioritize ICMP responses.
- A missing reply is treated as a failed probe within the monitoring timeout; it does not necessarily indicate that an ordinary data packet was dropped.
- The Binomial Distribution assumes a fixed number of trials, independent outcomes, and a constant failure probability.
- Network failures may be correlated, particularly during congestion or outages, which can violate the independence assumption.
- Short observation windows can produce unstable probability estimates.
- Predictions assume the estimated failure probability remains applicable to the future observation window.
- Statistical tests depend on the validity of their reference probability and modelling assumptions.
- The current project is a development MVP and should not be treated as a production network-monitoring or fault-diagnosis system.

## 15. Future Enhancements

Potential improvements include:

- Confidence intervals for estimated packet-loss probability.
- A configurable reference probability for formal statistical validation.
- More robust treatment of correlated probe failures.
- Historical metric storage and long-term trend analysis.
- Exportable reports containing measurements, assumptions, and test results.
- Comparison of different targets and observation windows.
- Additional network metrics and more detailed diagnostic information.
- Automated testing of statistical calculations against known results.

---

## Conclusion

SwitchSTATS demonstrates how probability theory can be applied to practical network monitoring. By combining live ICMP measurements with Binomial probability calculations and an interactive dashboard, the project makes uncertain network behaviour measurable and interpretable.

It connects network monitoring with statistical prediction, evidence-based decisions, and model validation, providing a practical demonstration of CO3, CO4, and CO5.

---

**Repository:** [naorupei/SwitchSTATS](https://github.com/naorupei/SwitchSTATS)
