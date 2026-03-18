// Parse ?runId=xxxx from URL
const params = new URLSearchParams(window.location.search);
const runId = params.get("runId");

if (!runId) {
  document.getElementById("run-header").innerHTML =
    "<h2 style='color:red'>❌ runId missing in URL</h2>";
  throw new Error("Missing runId");
}

// Fetch run details
async function loadRun() {
  const res = await fetch(`/api/runs/${runId}`);
  const data = await res.json();

  renderHeader(data);
  renderTests(data.tests);
}

function renderHeader(run) {
  const el = document.getElementById("run-header");

  const start = new Date(run.startTime).toLocaleString();
  const end = new Date(run.endTime).toLocaleString();

  el.innerHTML = `
    <h1>Run: ${run.runId}</h1>
    <p><strong>Status:</strong> ${run.status}</p>
    <p><strong>Start:</strong> ${start}</p>
    <p><strong>End:</strong> ${end}</p>
    <p><strong>Total Tests:</strong> ${run.tests.length}</p>
  `;
}

function renderTests(tests) {
  const container = document.getElementById("tests-container");
  container.innerHTML = "";

  tests.forEach((t) => {
    const card = document.createElement("div");
    card.className = "test-card";

    const attemptList = t.attemptsHtml
      ? t.attemptsHtml
      : t.attempts
          .map((_, idx) => {
            const status = t.statuses[idx];
            return `<div class="attempt ${status}">Attempt ${idx + 1}: ${status}</div>`;
          })
          .join("");

    const errorHtml =
      t.errors && t.errors.length
        ? `<div class="error-block">${t.errors.join("\n\n")}</div>`
        : "";

    card.innerHTML = `
      <h3>${t.fullTitle}</h3>
      <p><strong>File:</strong> ${t.file}</p>
      <p><strong>Flakiness:</strong> ${t.flakiness}</p>
      <p><strong>Attempts:</strong></p>
      ${attemptList}
      ${errorHtml}
    `;

    container.appendChild(card);
  });
}

loadRun();

